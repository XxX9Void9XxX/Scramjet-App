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
const newTabBtn = document.getElementById("sj-new-tab");
/** @type {HTMLElement} */
const tabsEl = document.getElementById("sj-tabs");
/** @type {HTMLElement} */
const landing = document.getElementById("landing");

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
let frame = null;
let currentUrl = "";
const historyStack = [];
let historyIndex = -1;
const tabs = [];
let activeTabId = null;
let tabIdCounter = 0;
let frameHost = null;

function clearErrors() {
	error.textContent = "";
	errorCode.textContent = "";
}

function showError(message, code = "") {
	error.textContent = message;
	errorCode.textContent = code;
}

function getActiveTab() {
	return tabs.find((tab) => tab.id === activeTabId) ?? null;
}

function updateNavState() {
	backBtn.disabled = historyIndex <= 0;
	forwardBtn.disabled = historyIndex >= historyStack.length - 1;
	const tab = getActiveTab();
	if (!tab) {
		backBtn.disabled = true;
		forwardBtn.disabled = true;
		return;
	}

	backBtn.disabled = tab.historyIndex <= 0;
	forwardBtn.disabled = tab.historyIndex >= tab.history.length - 1;
}

function createFrameHost() {
	if (frameHost) {
		return;
	}

	frameHost = document.createElement("div");
	frameHost.id = "sj-frame-host";
	landing.replaceWith(frameHost);
}

function tabLabel(url) {
	if (!url) {
		return "New Tab";
	}

	try {
		return new URL(url).hostname;
	} catch {
		return url;
	}
}

function renderTabs() {
	tabsEl.innerHTML = "";

	for (const tab of tabs) {
		const tabBtn = document.createElement("button");
		tabBtn.className = `tab-btn${tab.id === activeTabId ? " active" : ""}`;
		tabBtn.type = "button";
		tabBtn.role = "tab";
		tabBtn.dataset.tabId = tab.id;
		tabBtn.title = tab.url || "New Tab";

		const title = document.createElement("span");
		title.className = "tab-title";
		title.textContent = tab.title;

		const close = document.createElement("button");
		close.className = "tab-close";
		close.type = "button";
		close.innerHTML = "&times;";
		close.title = "Close tab";
		close.dataset.tabId = tab.id;

		tabBtn.append(title, close);
		tabsEl.append(tabBtn);
	}
}

function switchToTab(tabId) {
	const tab = tabs.find((candidate) => candidate.id === tabId);
	if (!tab) {
		return;
	}

	activeTabId = tabId;

	for (const candidate of tabs) {
		candidate.frame.classList.toggle("active", candidate.id === tabId);
	}

	address.value = tab.url;
	updateNavState();
	renderTabs();
}

function closeTab(tabId) {
	const index = tabs.findIndex((tab) => tab.id === tabId);
	if (index < 0) {
		return;
	}

	const [tab] = tabs.splice(index, 1);
	tab.frame.remove();

	if (tabs.length === 0) {
		createTab();
		return;
	}

	if (activeTabId === tabId) {
		const fallbackTab = tabs[Math.max(0, index - 1)];
		switchToTab(fallbackTab.id);
	} else {
		renderTabs();
	}
}

function attachNewTabInterception(tab) {
	const { frame } = tab;
	const bindInterception = () => {
		try {
			const frameWindow = frame.contentWindow;
			if (!frameWindow || !frameWindow.document) {
				return;
			}

			if (frameWindow.__sjTabInterceptApplied) {
				return;
			}
			frameWindow.__sjTabInterceptApplied = true;

			const originalOpen = frameWindow.open.bind(frameWindow);
			frameWindow.open = (url = "", target = "_blank", features) => {
				if (target === "_blank" || target === "" || target === null) {
					const destination = String(url || frameWindow.location.href);
					openInNewTab(destination);
					return frameWindow;
				}
				return originalOpen(url, target, features);
			};

			frameWindow.document.addEventListener(
				"click",
				(event) => {
					const link = event.target.closest("a[target='_blank']");
					if (!link || !link.href) {
						return;
					}

					event.preventDefault();
					openInNewTab(link.href);
				},
				true,
			);
		} catch {
			// Cross-origin safeguards may prevent direct interception on some pages.
		}
	};

	frame.addEventListener("load", bindInterception);
}

function createTab(initialUrl = "") {
	createFrameHost();

	const tab = {
		id: String(++tabIdCounter),
		title: "New Tab",
		url: "",
		history: [],
		historyIndex: -1,
		frame: scramjet.createFrame().frame,
	};

	tab.frame.classList.add("sj-frame");
	frameHost.append(tab.frame);
	attachNewTabInterception(tab);

	tabs.push(tab);
	renderTabs();
	switchToTab(tab.id);

	if (initialUrl) {
		navigate(initialUrl, true, tab.id);
	}

	return tab;
}

async function ensureTransportReady() {
	let wispUrl =
		(location.protocol === "https:" ? "wss" : "ws") +
		"://" +
		location.host +
		"/wisp/";

	if ((await connection.getTransport()) !== "/libcurl/index.mjs") {
		await connection.setTransport("/libcurl/index.mjs", [{ websocket: wispUrl }]);
	}
}

function ensureFrame() {
	if (!frame) {
		frame = scramjet.createFrame();
		frame.frame.id = "sj-frame";
		landing.replaceWith(frame.frame);
	}
function openInNewTab(destination) {
	const tab = createTab(destination);
	switchToTab(tab.id);
}

async function navigate(inputValue, pushHistory = true) {
async function navigate(inputValue, pushHistory = true, targetTabId = activeTabId) {
	if (!inputValue.trim()) {
		return;
	}

	const tab = tabs.find((candidate) => candidate.id === targetTabId);
	if (!tab) {
		return;
	}

	clearErrors();

	try {
		await registerSW();
		await ensureTransportReady();
	} catch (err) {
		showError("Failed to initialize Scramjet service worker/transport.", err.toString());
		return;
	}

	const destination = search(inputValue, searchEngine.value);
	ensureFrame();
	currentUrl = destination;
	address.value = destination;
	frame.go(destination);
	tab.url = destination;
	tab.title = tabLabel(destination);

	if (pushHistory) {
		historyStack.splice(historyIndex + 1);
		historyStack.push(destination);
		historyIndex = historyStack.length - 1;
		tab.history.splice(tab.historyIndex + 1);
		tab.history.push(destination);
		tab.historyIndex = tab.history.length - 1;
	}

	if (activeTabId === tab.id) {
		address.value = destination;
	}

	tab.frame.src = destination;
	updateNavState();
	renderTabs();
}

form.addEventListener("submit", async (event) => {
	event.preventDefault();
	await navigate(address.value, true);
});

backBtn.addEventListener("click", async () => {
	if (historyIndex <= 0) {
	const tab = getActiveTab();
	if (!tab || tab.historyIndex <= 0) {
		return;
	}

	historyIndex -= 1;
	await navigate(historyStack[historyIndex], false);
	tab.historyIndex -= 1;
	await navigate(tab.history[tab.historyIndex], false, tab.id);
});

forwardBtn.addEventListener("click", async () => {
	if (historyIndex >= historyStack.length - 1) {
	const tab = getActiveTab();
	if (!tab || tab.historyIndex >= tab.history.length - 1) {
		return;
	}

	historyIndex += 1;
	await navigate(historyStack[historyIndex], false);
	tab.historyIndex += 1;
	await navigate(tab.history[tab.historyIndex], false, tab.id);
});

reloadBtn.addEventListener("click", () => {
	if (!frame || !currentUrl) {
	const tab = getActiveTab();
	if (!tab || !tab.url) {
		return;
	}

	frame.go(currentUrl);
	tab.frame.src = tab.url;
});

fullscreenBtn.addEventListener("click", async () => {
	if (!document.fullscreenElement) {
		await document.documentElement.requestFullscreen();
		return;
	}

	await document.exitFullscreen();
});

newTabBtn.addEventListener("click", () => {
	createTab();
});

tabsEl.addEventListener("click", (event) => {
	const closeBtn = event.target.closest(".tab-close");
	if (closeBtn) {
		event.stopPropagation();
		closeTab(closeBtn.dataset.tabId);
		return;
	}

	const tabBtn = event.target.closest(".tab-btn");
	if (tabBtn) {
		switchToTab(tabBtn.dataset.tabId);
	}
});

createTab();
updateNavState();
