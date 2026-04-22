"use strict";
/**
 * @type {HTMLFormElement}
 */

const form = document.getElementById("sj-form");
/**
 * @type {HTMLInputElement}
 */
const address = document.getElementById("sj-address");
/**
 * @type {HTMLInputElement}
 */
const searchEngine = document.getElementById("sj-search-engine");
/**
 * @type {HTMLParagraphElement}
 */
const error = document.getElementById("sj-error");
/**
 * @type {HTMLPreElement}
 */
const errorCode = document.getElementById("sj-error-code");
const backButton = document.getElementById("sj-back");
const forwardButton = document.getElementById("sj-forward");
const reloadButton = document.getElementById("sj-reload");
const fullscreenButton = document.getElementById("sj-fullscreen");
const tabsList = document.getElementById("sj-tabs");
const newTabButton = document.getElementById("sj-new-tab");
const landing = document.getElementById("landing");
const frameArea = document.getElementById("sj-frame-area");
const autoclickerButton = document.getElementById("sj-autoclicker");

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
let tabs = [];
let activeTabId = null;
let tabCounter = 0;

function getActiveTab() {
	return tabs.find((tab) => tab.id === activeTabId) || null;
}

async function ensureTransport() {
	let wispUrl =
		(location.protocol === "https:" ? "wss" : "ws") +
		"://" +
		location.host +
		"/wisp/";

	if ((await connection.getTransport()) !== "/libcurl/index.mjs") {
		await connection.setTransport("/libcurl/index.mjs", [
			{ websocket: wispUrl },
		]);
	}
}

function updateVisibility() {
	const hasTabs = tabs.length > 0;
	landing.style.display = hasTabs ? "none" : "flex";
	frameArea.style.display = hasTabs ? "block" : "none";
}

function setActiveTab(tabId) {
	activeTabId = tabId;
	for (const tab of tabs) {
		const isActive = tab.id === tabId;
		tab.frameElement.classList.toggle("active", isActive);
		tab.button.classList.toggle("active", isActive);
	}

	const active = getActiveTab();
	address.value = active?.currentUrl || "";
}

function updateTabTitle(tab, titleText) {
	tab.title.textContent = titleText || "New Tab";
}

function closeTab(tabId) {
	const index = tabs.findIndex((tab) => tab.id === tabId);
	if (index === -1) return;

	const [tab] = tabs.splice(index, 1);
	tab.frameElement.remove();
	tab.button.remove();

	if (activeTabId === tabId) {
		const nextTab = tabs[index] || tabs[index - 1] || null;
		activeTabId = nextTab?.id ?? null;
		if (nextTab) {
			setActiveTab(nextTab.id);
		} else {
			address.value = "";
		}
	}

	updateVisibility();
}

function openInProxy(url, target = "_self") {
	const proxyUrl = search(url, searchEngine.value);
	if (target === "_self") {
		const active = getActiveTab();
		if (active) {
			active.currentUrl = url;
			active.controller.go(proxyUrl);
			address.value = url;
		}
		return;
	}

	const tab = createTab(url, true);
	tab.currentUrl = url;
	tab.controller.go(proxyUrl);
}

function installPopupInterception(tab) {
	try {
		const win = tab.frameElement.contentWindow;
		if (!win || win.__sjPopupHooked) return;
		win.__sjPopupHooked = true;

		win.open = (url = "", target = "_blank") => {
			const resolvedUrl = new URL(url, win.location.href).toString();
			openInProxy(resolvedUrl, target || "_blank");
			return null;
		};

		const doc = win.document;
		doc.addEventListener(
			"click",
			(event) => {
				const anchor = event.target.closest("a[target]");
				if (!anchor) return;
				if (anchor.target === "_blank" || anchor.target === "_new") {
					event.preventDefault();
					openInProxy(anchor.href, "_blank");
				}
			},
			true
		);
	} catch (hookError) {
		// Some pages may restrict access during initial load; retry on next load.
	}
}

function createTab(initialUrl = "", activate = true) {
	const id = `tab-${++tabCounter}`;
	const controller = scramjet.createFrame();
	const frameElement = controller.frame;
	frameElement.className = "proxy-frame";
	frameArea.appendChild(frameElement);

	const tabItem = document.createElement("div");
	tabItem.className = "tab-item";

	const button = document.createElement("button");
	button.type = "button";
	button.className = "tab-btn";

	const title = document.createElement("span");
	title.className = "tab-title";
	title.textContent = "New Tab";

	const closeButton = document.createElement("button");
	closeButton.type = "button";
	closeButton.className = "tab-close";
	closeButton.textContent = "×";

	button.appendChild(title);
	tabItem.appendChild(button);
	tabItem.appendChild(closeButton);

	const tab = {
		id,
		controller,
		frameElement,
		button: tabItem,
		title,
		currentUrl: initialUrl,
	};

	button.addEventListener("click", () => {
		setActiveTab(id);
	});

	closeButton.addEventListener("click", (event) => {
		event.stopPropagation();
		closeTab(id);
	});

	frameElement.addEventListener("load", () => {
		installPopupInterception(tab);
		try {
			const pageTitle = tab.frameElement.contentDocument?.title;
			updateTabTitle(tab, pageTitle || tab.currentUrl || "New Tab");
		} catch {
			updateTabTitle(tab, tab.currentUrl || "New Tab");
		}
	});

	tabs.push(tab);
	tabsList.appendChild(tabItem);
	updateVisibility();
	if (activate) setActiveTab(id);
	return tab;
}

function runAutoClickerInFrame(frameWindow) {
	const delayInput = frameWindow.prompt(
		"Directions:\n 1. Enter CPS\n 2. Click an element\n 3. Click the same spot to stop.\n\nEnter CPS (0 to cancel):"
	);
	const cps = Number(delayInput);
	if (!Number.isFinite(cps) || cps <= 0) return;

	const delay = 1000 / cps;
	const style = frameWindow.document.createElement("style");
	style.textContent = "*{cursor: crosshair !important;}";
	frameWindow.document.body.appendChild(style);

	const addClicker = (event) => {
		if (!event.isTrusted) return;

		frameWindow.document.body.removeChild(style);
		frameWindow.document.body.removeEventListener("click", addClicker, true);
		event.preventDefault();

		const target = event.target;
		target.classList.add("auto-clicker-target");

		const toggle = (clickEvent) => {
			if (!clickEvent.isTrusted) return;
			target.classList.toggle("auto-clicker-active");
			if (target.classList.contains("auto-clicker-active")) {
				autoClick(target);
			}
			clickEvent.preventDefault();
		};

		target.addEventListener("click", toggle);
	};

	function autoClick(element) {
		if (!element.classList.contains("auto-clicker-active")) return;
		element.click();
		frameWindow.setTimeout(() => autoClick(element), delay);
	}

	frameWindow.document.body.addEventListener("click", addClicker, true);
}

async function navigateActiveTab(inputValue) {
	const target = getActiveTab() || createTab("", true);
	const requested = inputValue.trim();
	const url = search(requested, searchEngine.value);
	await ensureTransport();
	target.currentUrl = requested;
	target.controller.go(url);
	address.value = requested;
	updateTabTitle(target, requested);
}

form.addEventListener("submit", async (event) => {
	event.preventDefault();

	try {
		await registerSW();
		await navigateActiveTab(address.value);
	} catch (err) {
		error.textContent = "Failed to register service worker.";
		error.textContent = "Failed to navigate with service worker.";
		errorCode.textContent = err.toString();
		throw err;
	}
});

	const url = search(address.value, searchEngine.value);
newTabButton.addEventListener("click", () => {
	createTab("", true);
});

	let wispUrl =
		(location.protocol === "https:" ? "wss" : "ws") +
		"://" +
		location.host +
		"/wisp/";
	if ((await connection.getTransport()) !== "/libcurl/index.mjs") {
		await connection.setTransport("/libcurl/index.mjs", [
			{ websocket: wispUrl },
		]);
autoclickerButton?.addEventListener("click", () => {
	const active = getActiveTab();
	if (!active?.frameElement?.contentWindow) {
		error.textContent = "Open a page first, then run autoclicker.";
		return;
	}

	try {
		runAutoClickerInFrame(active.frameElement.contentWindow);
	} catch (err) {
		error.textContent = "AutoClicker could not start on this page.";
		errorCode.textContent = err.toString();
	}
});

backButton.addEventListener("click", () => {
	const active = getActiveTab();
	active?.frameElement?.contentWindow?.history?.back();
});

forwardButton.addEventListener("click", () => {
	const active = getActiveTab();
	active?.frameElement?.contentWindow?.history?.forward();
});

reloadButton.addEventListener("click", () => {
	const active = getActiveTab();
	active?.frameElement?.contentWindow?.location?.reload();
});

fullscreenButton.addEventListener("click", async () => {
	if (!document.fullscreenElement) {
		await document.documentElement.requestFullscreen();
	} else {
		await document.exitFullscreen();
	}
	const frame = scramjet.createFrame();
	frame.frame.id = "sj-frame";
	document.body.appendChild(frame.frame);
	frame.go(url);
});

document.addEventListener("fullscreenchange", () => {
	document.body.classList.toggle(
		"fullscreen-mode",
		Boolean(document.fullscreenElement)
	);
});

updateVisibility();
