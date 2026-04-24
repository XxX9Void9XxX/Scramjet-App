"use strict";

/** @type {HTMLFormElement} */
const form = document.getElementById("sj-form");
/** @type {HTMLInputElement} */
const address = document.getElementById("sj-address");
/** @type {HTMLInputElement} */
const searchEngine = document.getElementById("sj-search-engine");
/** @type {HTMLParagraphElement} */
const error = document.getElementById("sj-error");
/** @type {HTMLPreElement} */
const errorCode = document.getElementById("sj-error-code");
/** @type {HTMLButtonElement} */
const backBtn = document.getElementById("sj-back");
/** @type {HTMLButtonElement} */
const forwardBtn = document.getElementById("sj-forward");
/** @type {HTMLButtonElement} */
const reloadBtn = document.getElementById("sj-reload");
/** @type {HTMLButtonElement} */
const fullscreenBtn = document.getElementById("sj-fullscreen");
/** @type {HTMLButtonElement} */
const bookmarkletBtn = document.getElementById("sj-bookmarklet");
/** @type {HTMLElement} */
const landing = document.getElementById("landing");
/** @type {HTMLElement} */
const browserShell = document.getElementById("browser-shell");
/** @type {HTMLElement} */
const viewHost = document.getElementById("sj-view-host");
/** @type {HTMLElement} */
const tabstrip = document.getElementById("sj-tabstrip");
/** @type {HTMLButtonElement} */
const newTabBtn = document.getElementById("sj-new-tab");
/** @type {HTMLFormElement} */
const homeForm = document.getElementById("sj-home-form");
/** @type {HTMLInputElement} */
const homeSearchInput = document.getElementById("sj-home-search");

const { ScramjetController } = $scramjetLoadController();

const scramjet = new ScramjetController({
	files: {
		wasm: "/scram/scramjet.wasm.wasm",
		all: "/scram/scramjet.all.js",
		sync: "/scram/scramjet.sync.js",
	},
});

scramjet.init();

const connection = new BareMux.BareMuxConnection("/baremux/worker.js");
const AUTOCLICKER_URL =
	"https://cdn.jsdelivr.net/gh/wea-f/Norepted@a4cd53b/bookmarklets/autoclicker.js";

/** @type {Array<{id: string,title: string,currentUrl: string,historyStack: string[],historyIndex: number,frame: any,button: HTMLButtonElement}>} */
const tabs = [];
let activeTabId = null;

function clearErrors() {
	error.textContent = "";
	errorCode.textContent = "";
}

function showError(message, code = "") {
	error.textContent = message;
	errorCode.textContent = code;
}

function currentTab() {
	return tabs.find((tab) => tab.id === activeTabId) ?? null;
}

function parseStartupInput() {
	const pathname = decodeURIComponent(location.pathname).replace(/^\/+/, "");
	return pathname || "";
}

function shouldShowStartupBar() {
	const params = new URLSearchParams(location.search);
	return params.has("showbar");
}

function labelFromUrl(url) {
	if (!url) return "Tempest";
	try {
		const parsed = new URL(url);
		return parsed.hostname || parsed.href;
	} catch {
		return url;
	}
}

function updateTabButton(tab) {
	const titleNode = tab.button.querySelector(".tab-title");
	if (titleNode) titleNode.textContent = tab.title;
	tab.button.classList.toggle("active", tab.id === activeTabId);
	tab.button.setAttribute("aria-selected", tab.id === activeTabId ? "true" : "false");
}

function updateNavState() {
	const tab = currentTab();
	if (!tab) {
		backBtn.disabled = true;
		forwardBtn.disabled = true;
		reloadBtn.disabled = true;
		address.value = "";
		return;
	}

	backBtn.disabled = tab.historyIndex <= 0;
	forwardBtn.disabled = tab.historyIndex >= tab.historyStack.length - 1;
	reloadBtn.disabled = !tab.currentUrl;
	address.value = tab.currentUrl || "";
}

function setLandingVisible(visible) {
	landing.classList.toggle("active", visible);
	landing.setAttribute("aria-hidden", visible ? "false" : "true");
}

function activateTab(tabId) {
	activeTabId = tabId;

	for (const tab of tabs) {
		tab.frame.frame.classList.toggle(
			"active",
			tab.id === activeTabId && Boolean(tab.currentUrl)
		);
		updateTabButton(tab);
	}

	const active = currentTab();
	setLandingVisible(!active || !active.currentUrl);
	updateNavState();
}

function removeTab(tabId) {
	const index = tabs.findIndex((tab) => tab.id === tabId);
	if (index === -1) return;

	const [tab] = tabs.splice(index, 1);
	tab.frame.frame.remove();
	tab.button.remove();

	if (tabs.length === 0) {
		createTab();
		return;
	}

	if (activeTabId === tabId) {
		const nextTab = tabs[Math.max(0, index - 1)] ?? tabs[0];
		activateTab(nextTab.id);
	} else {
		updateNavState();
	}
}

function createTabButton(tab) {
	const button = document.createElement("button");
	button.type = "button";
	button.className = "tab";
	button.setAttribute("role", "tab");
	button.innerHTML = `<span class="tab-title"></span><span class="tab-close" aria-label="Close tab">✕</span>`;

	button.addEventListener("click", (event) => {
		const closeBtn =
			event.target instanceof Element ? event.target.closest(".tab-close") : null;
		if (closeBtn) {
			event.stopPropagation();
			removeTab(tab.id);
			return;
		}
		activateTab(tab.id);
	});

	tabstrip.appendChild(button);
	return button;
}

function resolveUrlWithBase(rawUrl, baseUrl = "") {
	if (!rawUrl) return "about:blank";
	const trimmed = String(rawUrl).trim();
	if (!trimmed) return "about:blank";
	if (trimmed === "about:blank") return trimmed;

	try {
		return baseUrl ? new URL(trimmed, baseUrl).href : new URL(trimmed).href;
	} catch {
		return trimmed;
	}
}

async function ensureTransportReady() {
	const wispUrl =
		(location.protocol === "https:" ? "wss" : "ws") + "://" + location.host + "/wisp/";

	if ((await connection.getTransport()) !== "/libcurl/index.mjs") {
		await connection.setTransport("/libcurl/index.mjs", [{ websocket: wispUrl }]);
	}
}

async function navigate(inputValue, pushHistory = true, explicitTab = null) {
	if (!String(inputValue || "").trim()) return;

	const tab = explicitTab ?? currentTab();
	if (!tab) return;

	clearErrors();

	try {
		await registerSW();
		await ensureTransportReady();
	} catch (err) {
		showError("Failed to initialize Scramjet service worker/transport.", String(err));
		return;
	}

	const destination = search(String(inputValue), searchEngine.value);
	tab.currentUrl = destination;
	tab.title = labelFromUrl(destination);

	if (tab.frame.frame.hasAttribute("srcdoc")) {
		tab.frame.frame.removeAttribute("srcdoc");
	}

	tab.frame.go(destination);

	if (pushHistory) {
		tab.historyStack.splice(tab.historyIndex + 1);
		tab.historyStack.push(destination);
		tab.historyIndex = tab.historyStack.length - 1;
	}

	browserShell.classList.add("is-browsing");
	updateTabButton(tab);
	if (tab.id === activeTabId) activateTab(tab.id);
	updateNavState();
}

async function openProxyTab(rawUrl, baseUrl = "") {
	const resolved = resolveUrlWithBase(rawUrl, baseUrl);
	const tab = createTab("", true);
	if (resolved && resolved !== "about:blank") {
		await navigate(resolved, true, tab);
	}
	return tab;
}

function createTab(startUrl = "", activate = true) {
	const tab = {
		id: `tab-${crypto.randomUUID()}`,
		title: "Tempest",
		currentUrl: "",
		historyStack: [],
		historyIndex: -1,
		frame: scramjet.createFrame(),
		button: null,
	};

	tab.frame.frame.classList.add("tab-frame");
	viewHost.appendChild(tab.frame.frame);
	tab.button = createTabButton(tab);
	tabs.push(tab);
	updateTabButton(tab);

	if (activate) activateTab(tab.id);
	if (startUrl) navigate(startUrl, true, tab);

	return tab;
}

async function injectAutoclickerIntoCurrentTab() {
	const tab = currentTab();
	if (!tab || !tab.currentUrl) {
		showError("Open a proxied page first, then click AC.");
		return;
	}

	let frameWindow;
	let frameDocument;
	try {
		frameWindow = tab.frame.frame.contentWindow;
		frameDocument = frameWindow?.document;
	} catch (err) {
		showError("Cannot access active proxy frame.", String(err));
		return;
	}

	if (!frameWindow || !frameDocument) {
		showError("Proxy frame is not ready yet.");
		return;
	}

	try {
		clearErrors();
		bookmarkletBtn.disabled = true;

		const response = await fetch(AUTOCLICKER_URL, { cache: "no-store" });
		if (!response.ok) throw new Error(`Script fetch failed: ${response.status}`);
		const scriptText = await response.text();

		const scriptEl = frameDocument.createElement("script");
		scriptEl.textContent = `${scriptText}\n//# sourceURL=autoclicker.js`;
		(frameDocument.head || frameDocument.documentElement).appendChild(scriptEl);
		scriptEl.remove();
	} catch (err) {
		showError("Failed to inject bookmarklet.", String(err));
	} finally {
		bookmarkletBtn.disabled = false;
	}
}

// Listen for SW-injected popup shim messages from proxied pages.
window.addEventListener("message", async (event) => {
	const data = event.data;
	if (!data || data.__tempestPopup !== true) return;

	const active = currentTab();
	const base = active?.currentUrl || location.href;

	if (data.type === "navigate" && data.url) {
		await openProxyTab(data.url, base);
		return;
	}

	if (data.type === "srcdoc" && data.html) {
		const tab = createTab("", true);
		tab.currentUrl = "about:blank";
		tab.title = "Tempest";
		tab.frame.frame.srcdoc = String(data.html);
		updateTabButton(tab);
		updateNavState();
	}
});

form.addEventListener("submit", async (event) => {
	event.preventDefault();
	await navigate(address.value, true);
});

homeForm.addEventListener("submit", async (event) => {
	event.preventDefault();
	address.value = homeSearchInput.value;
	await navigate(homeSearchInput.value, true);
});

newTabBtn.addEventListener("click", () => {
	createTab("", true);
	clearErrors();
});

bookmarkletBtn.addEventListener("click", () => {
	injectAutoclickerIntoCurrentTab();
});

backBtn.addEventListener("click", async () => {
	const tab = currentTab();
	if (!tab || tab.historyIndex <= 0) return;
	tab.historyIndex -= 1;
	await navigate(tab.historyStack[tab.historyIndex], false, tab);
});

forwardBtn.addEventListener("click", async () => {
	const tab = currentTab();
	if (!tab || tab.historyIndex >= tab.historyStack.length - 1) return;
	tab.historyIndex += 1;
	await navigate(tab.historyStack[tab.historyIndex], false, tab);
});

reloadBtn.addEventListener("click", () => {
	const tab = currentTab();
	if (!tab || !tab.currentUrl) return;
	tab.frame.go(tab.currentUrl);
});

async function enterFullscreen(element) {
	if (!element) return;
	try {
		await element.requestFullscreen({ navigationUI: "hide" });
	} catch {
		await element.requestFullscreen();
	}
}

fullscreenBtn.addEventListener("click", async () => {
	if (!document.fullscreenElement) {
		await enterFullscreen(browserShell);
		return;
	}
	await document.exitFullscreen();
});

document.addEventListener("click", (event) => {
	const anchor =
		event.target instanceof Element ? event.target.closest("a[target='_blank']") : null;
	if (!anchor) return;

	const hrefAttr = anchor.getAttribute("href");
	if (!hrefAttr) return;

	event.preventDefault();
	const base = currentTab()?.currentUrl || location.href;
	openProxyTab(hrefAttr, base);
});

createTab();
activateTab(tabs[0].id);
updateNavState();

const startupInput = parseStartupInput();
if (startupInput) {
	if (!shouldShowStartupBar()) browserShell.classList.add("startup-direct");
	homeSearchInput.value = startupInput;
	address.value = startupInput;
	navigate(startupInput, true);
}
