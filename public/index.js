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
/** @type {HTMLDivElement} */
const tabsEl = document.getElementById("sj-tabs");
/** @type {HTMLElement} */
const landing = document.getElementById("landing");
/** @type {HTMLElement} */
const contentArea = document.getElementById("sj-content");
/** @type {HTMLElement} */
const browserShell = document.getElementById("browser-shell");

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

function getTabLabel(url) {
	if (!url) {
		return "New Tab";
	}

	try {
		const parsed = new URL(url);
		return parsed.hostname || url;
	} catch {
		return url;
	}
}

function renderTabs() {
	for (const tab of tabs) {
		tab.button.classList.toggle("is-active", tab.id === activeTabId);
		tab.select.setAttribute("aria-selected", String(tab.id === activeTabId));
		tab.select.setAttribute("tabindex", tab.id === activeTabId ? "0" : "-1");
		tab.label.textContent = getTabLabel(tab.currentUrl);
		tab.frame.frame.classList.toggle("is-active", tab.id === activeTabId);
	}

	landing.classList.toggle("hidden", tabs.length > 0);
}

function updateNavState() {
	backBtn.disabled = historyIndex <= 0;
	forwardBtn.disabled = historyIndex >= historyStack.length - 1;
	const tab = currentTab();
	const hasTab = Boolean(tab);

	backBtn.disabled = !hasTab || tab.historyIndex <= 0;
	forwardBtn.disabled =
		!hasTab || tab.historyIndex >= tab.historyStack.length - 1;
	reloadBtn.disabled = !hasTab || !tab.currentUrl;
	address.value = hasTab ? tab.currentUrl : "";
}

async function ensureTransportReady() {
	let wispUrl =
	const wispUrl =
		(location.protocol === "https:" ? "wss" : "ws") +
		"://" +
		location.host +
		"/wisp/";

	if ((await connection.getTransport()) !== "/libcurl/index.mjs") {
		await connection.setTransport("/libcurl/index.mjs", [{ websocket: wispUrl }]);
		await connection.setTransport("/libcurl/index.mjs", [
			{ websocket: wispUrl },
		]);
	}
}

function ensureFrame() {
	if (!frame) {
		frame = scramjet.createFrame();
		frame.frame.id = "sj-frame";
		landing.replaceWith(frame.frame);
function setActiveTab(tabId) {
	activeTabId = tabId;
	renderTabs();
	updateNavState();
}

function createTab(makeActive = true) {
	const id = ++tabIdCounter;
	const frame = scramjet.createFrame();
	frame.frame.classList.add("sj-frame");
	contentArea.appendChild(frame.frame);

	const button = document.createElement("div");
	button.className = "tab";
	button.setAttribute("role", "tab");

	const select = document.createElement("button");
	select.type = "button";
	select.className = "tab-select";

	const label = document.createElement("span");
	label.className = "tab-label";
	label.textContent = "New Tab";

	const close = document.createElement("button");
	close.type = "button";
	close.className = "tab-close";
	close.title = "Close tab";
	close.setAttribute("aria-label", "Close tab");
	close.textContent = "×";

	select.appendChild(label);
	button.append(select, close);
	tabsEl.insertBefore(button, newTabBtn);

	const tab = {
		id,
		frame,
		currentUrl: "",
		historyStack: [],
		historyIndex: -1,
		button,
		select,
		label,
	};
	tabs.push(tab);

	select.addEventListener("click", () => {
		setActiveTab(id);
	});

	close.addEventListener("click", (event) => {
		event.stopPropagation();
		closeTab(id);
	});

	if (makeActive) {
		setActiveTab(id);
	} else {
		renderTabs();
		updateNavState();
	}

	return tab;
}

function closeTab(tabId) {
	const tabIndex = tabs.findIndex((tab) => tab.id === tabId);
	if (tabIndex === -1) {
		return;
	}

	const [tab] = tabs.splice(tabIndex, 1);
	tab.button.remove();
	tab.frame.frame.remove();

	if (activeTabId === tabId) {
		if (tabs.length === 0) {
			activeTabId = null;
		} else {
			const nextTab = tabs[Math.min(tabIndex, tabs.length - 1)];
			activeTabId = nextTab.id;
		}
	}

	renderTabs();
	updateNavState();
}

async function navigate(inputValue, pushHistory = true) {
	if (!inputValue.trim()) {
		return;
	}

	clearErrors();

	let tab = currentTab();
	if (!tab) {
		tab = createTab(true);
	}

	try {
		await registerSW();
		await ensureTransportReady();
	} catch (err) {
		showError("Failed to initialize Scramjet service worker/transport.", err.toString());
		showError(
			"Failed to initialize Scramjet service worker/transport.",
			err.toString()
		);
		return;
	}

	const destination = search(inputValue, searchEngine.value);
	ensureFrame();
	currentUrl = destination;
	tab.currentUrl = destination;
	address.value = destination;
	frame.go(destination);
	tab.frame.go(destination);

	if (pushHistory) {
		historyStack.splice(historyIndex + 1);
		historyStack.push(destination);
		historyIndex = historyStack.length - 1;
		tab.historyStack.splice(tab.historyIndex + 1);
		tab.historyStack.push(destination);
		tab.historyIndex = tab.historyStack.length - 1;
	}

	renderTabs();
	updateNavState();
}

form.addEventListener("submit", async (event) => {
	event.preventDefault();
	await navigate(address.value, true);
});

newTabBtn.addEventListener("click", () => {
	createTab(true);
	clearErrors();
});

backBtn.addEventListener("click", async () => {
	if (historyIndex <= 0) {
	const tab = currentTab();
	if (!tab || tab.historyIndex <= 0) {
		return;
	}

	historyIndex -= 1;
	await navigate(historyStack[historyIndex], false);
	tab.historyIndex -= 1;
	await navigate(tab.historyStack[tab.historyIndex], false);
});

forwardBtn.addEventListener("click", async () => {
	if (historyIndex >= historyStack.length - 1) {
	const tab = currentTab();
	if (!tab || tab.historyIndex >= tab.historyStack.length - 1) {
		return;
	}

	historyIndex += 1;
	await navigate(historyStack[historyIndex], false);
	tab.historyIndex += 1;
	await navigate(tab.historyStack[tab.historyIndex], false);
});

reloadBtn.addEventListener("click", () => {
	if (!frame || !currentUrl) {
	const tab = currentTab();
	if (!tab || !tab.currentUrl) {
		return;
	}

	frame.go(currentUrl);
	tab.frame.go(tab.currentUrl);
});

fullscreenBtn.addEventListener("click", async () => {
	if (!document.fullscreenElement) {
		await document.documentElement.requestFullscreen();
		await browserShell.requestFullscreen();
		return;
	}

	await document.exitFullscreen();
});

document.addEventListener("fullscreenchange", () => {
	document.body.classList.toggle(
		"is-fullscreen",
		Boolean(document.fullscreenElement)
	);
});

updateNavState();
