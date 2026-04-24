"use strict";

const form = document.getElementById("sj-form");
const address = document.getElementById("sj-address");
const searchEngine = document.getElementById("sj-search-engine");
const error = document.getElementById("sj-error");
const errorCode = document.getElementById("sj-error-code");
const backBtn = document.getElementById("sj-back");
const forwardBtn = document.getElementById("sj-forward");
const reloadBtn = document.getElementById("sj-reload");
const fullscreenBtn = document.getElementById("sj-fullscreen");
const bookmarkletBtn = document.getElementById("sj-bookmarklet");
const inspectBtn = document.getElementById("sj-inspect");
const landing = document.getElementById("landing");
const browserShell = document.getElementById("browser-shell");
const viewHost = document.getElementById("sj-view-host");
const tabstrip = document.getElementById("sj-tabstrip");
const newTabBtn = document.getElementById("sj-new-tab");
const homeForm = document.getElementById("sj-home-form");
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
const AUTOCLICKER_URL = "https://cdn.jsdelivr.net/gh/wea-f/Norepted@a4cd53b/bookmarklets/autoclicker.js";
const ERUDA_URL = "https://cdn.jsdelivr.net/npm/eruda";

const tabs = [];
let activeTabId = null;

function clearErrors() { error.textContent = ""; errorCode.textContent = ""; }
function showError(message, code = "") { error.textContent = message; errorCode.textContent = code; }
function currentTab() { return tabs.find((t) => t.id === activeTabId) ?? null; }

function parseStartupInput() {
	const pathname = decodeURIComponent(location.pathname).replace(/^\/+/, "");
	return pathname || "";
}
function shouldShowStartupBar() { return new URLSearchParams(location.search).has("showbar"); }

function labelFromUrl(url) {
	if (!url) return "Tempest";
	try { return new URL(url).hostname || url; } catch { return url; }
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
		backBtn.disabled = true; forwardBtn.disabled = true; reloadBtn.disabled = true; address.value = "";
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
		tab.frame.frame.classList.toggle("active", tab.id === activeTabId && Boolean(tab.currentUrl));
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

	if (!tabs.length) return createTab();
	if (activeTabId === tabId) {
		const nextTab = tabs[Math.max(0, index - 1)] ?? tabs[0];
		activateTab(nextTab.id);
	} else updateNavState();
}

function createTabButton(tab) {
	const button = document.createElement("button");
	button.type = "button";
	button.className = "tab";
	button.setAttribute("role", "tab");
	button.innerHTML = `<span class="tab-title"></span><span class="tab-close" aria-label="Close tab">✕</span>`;
	button.addEventListener("click", (event) => {
		const closeBtn = event.target instanceof Element ? event.target.closest(".tab-close") : null;
		if (closeBtn) { event.stopPropagation(); removeTab(tab.id); return; }
		activateTab(tab.id);
	});
	tabstrip.appendChild(button);
	return button;
}

function resolveUrlWithBase(rawUrl, baseUrl = "") {
	if (!rawUrl) return "about:blank";
	const t = String(rawUrl).trim();
	if (!t) return "about:blank";
	if (t === "about:blank") return t;
	try { return baseUrl ? new URL(t, baseUrl).href : new URL(t).href; } catch { return t; }
}

async function ensureTransportReady() {
	const wispUrl = (location.protocol === "https:" ? "wss" : "ws") + "://" + location.host + "/wisp/";
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
	if (tab.frame.frame.hasAttribute("srcdoc")) tab.frame.frame.removeAttribute("srcdoc");
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
	if (resolved && resolved !== "about:blank") await navigate(resolved, true, tab);
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

async function getActiveFrameContext() {
	const tab = currentTab();
	if (!tab || !tab.currentUrl) throw new Error("Open a proxied page first.");
	const frameWindow = tab.frame.frame.contentWindow;
	const frameDocument = frameWindow?.document;
	if (!frameWindow || !frameDocument) throw new Error("Proxy frame not ready.");
	return { frameWindow, frameDocument };
}

async function injectScriptIntoActiveFrame(url, doneMessage) {
	try {
		clearErrors();
		const { frameWindow, frameDocument } = await getActiveFrameContext();
		const s = frameDocument.createElement("script");
		s.src = url;
		s.onload = () => showError(doneMessage);
		s.onerror = () => showError(`Failed loading ${url}`);
		(frameDocument.head || frameDocument.documentElement).appendChild(s);

		// Ensure script executes even in odd DOM states
		if (!s.parentNode) {
			frameWindow.eval(`(function(){var x=document.createElement('script');x.src='${url}';document.documentElement.appendChild(x);})();`);
		}
	} catch (err) {
		showError(String(err));
	}
}

async function injectAutoclickerIntoCurrentTab() {
	try {
		clearErrors();
		bookmarkletBtn.disabled = true;
		const { frameDocument } = await getActiveFrameContext();
		const res = await fetch(AUTOCLICKER_URL, { cache: "no-store" });
		if (!res.ok) throw new Error(`Script fetch failed: ${res.status}`);
		const code = await res.text();
		const scriptEl = frameDocument.createElement("script");
		scriptEl.textContent = `${code}\n//# sourceURL=autoclicker.js`;
		(frameDocument.head || frameDocument.documentElement).appendChild(scriptEl);
		scriptEl.remove();
	} catch (err) {
		showError("Failed to inject autoclicker.", String(err));
	} finally {
		bookmarkletBtn.disabled = false;
	}
}

async function injectInspectIntoCurrentTab() {
	inspectBtn.disabled = true;
	await injectScriptIntoActiveFrame(ERUDA_URL, "Inspector loaded (DEV).");
	try {
		const { frameWindow } = await getActiveFrameContext();
		frameWindow.eval(`
			(function(){
				if (window.eruda) {
					if (!window.__tempestErudaInit) {
						eruda.init({ useShadowDom: false });
						window.__tempestErudaInit = true;
					} else {
						eruda.show();
					}
				}
			})();
		`);
	} catch (err) {
		showError("Failed to initialize inspector.", String(err));
	} finally {
		inspectBtn.disabled = false;
	}
}

// Messages from SW-injected popup shim inside proxied pages
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

form.addEventListener("submit", async (event) => { event.preventDefault(); await navigate(address.value, true); });
homeForm.addEventListener("submit", async (event) => { event.preventDefault(); address.value = homeSearchInput.value; await navigate(homeSearchInput.value, true); });

newTabBtn.addEventListener("click", () => { createTab("", true); clearErrors(); });
bookmarkletBtn.addEventListener("click", () => { injectAutoclickerIntoCurrentTab(); });
inspectBtn.addEventListener("click", () => { injectInspectIntoCurrentTab(); });

backBtn.addEventListener("click", async () => {
	const tab = currentTab(); if (!tab || tab.historyIndex <= 0) return;
	tab.historyIndex -= 1; await navigate(tab.historyStack[tab.historyIndex], false, tab);
});
forwardBtn.addEventListener("click", async () => {
	const tab = currentTab(); if (!tab || tab.historyIndex >= tab.historyStack.length - 1) return;
	tab.historyIndex += 1; await navigate(tab.historyStack[tab.historyIndex], false, tab);
});
reloadBtn.addEventListener("click", () => { const tab = currentTab(); if (tab?.currentUrl) tab.frame.go(tab.currentUrl); });

async function enterFullscreen(element) {
	if (!element) return;
	try { await element.requestFullscreen({ navigationUI: "hide" }); } catch { await element.requestFullscreen(); }
}
fullscreenBtn.addEventListener("click", async () => {
	if (!document.fullscreenElement) return enterFullscreen(browserShell);
	await document.exitFullscreen();
});

document.addEventListener("click", (event) => {
	const anchor = event.target instanceof Element ? event.target.closest("a[target='_blank']") : null;
	if (!anchor) return;
	const href = anchor.getAttribute("href");
	if (!href) return;
	event.preventDefault();
	openProxyTab(href, currentTab()?.currentUrl || location.href);
}, true);

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
