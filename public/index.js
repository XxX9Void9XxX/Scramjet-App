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
var form = document.getElementById("sj-form");
var address = document.getElementById("sj-address");
var searchEngine = document.getElementById("sj-search-engine");
var error = document.getElementById("sj-error");
var errorCode = document.getElementById("sj-error-code");
var backBtn = document.getElementById("sj-back");
var forwardBtn = document.getElementById("sj-forward");
var reloadBtn = document.getElementById("sj-reload");
var fullscreenBtn = document.getElementById("sj-fullscreen");
var newTabBtn = document.getElementById("sj-new-tab");
var tabsEl = document.getElementById("sj-tabs");
var landing = document.getElementById("landing");

scramjet.init();
var scramjet = null;
var connection = null;
var frameController = null;
var frameHost = null;

const connection = new BareMux.BareMuxConnection("/baremux/worker.js");
let frame = null;
let currentUrl = "";
const historyStack = [];
let historyIndex = -1;
var tabs = [];
var tabCounter = 0;
var activeTabId = null;

function clearErrors() {
	error.textContent = "";
	errorCode.textContent = "";
}

function showError(message, code = "") {
function showError(message, code) {
	error.textContent = message;
	errorCode.textContent = code;
	errorCode.textContent = code || "";
}

function updateNavState() {
	backBtn.disabled = historyIndex <= 0;
	forwardBtn.disabled = historyIndex >= historyStack.length - 1;
function getScramjet() {
	if (scramjet) return scramjet;
	if (typeof $scramjetLoadController !== "function") {
		throw new Error("Scramjet controller script failed to load.");
	}
	var loaded = $scramjetLoadController();
	scramjet = new loaded.ScramjetController({
		files: {
			wasm: "/scram/scramjet.wasm.wasm",
			all: "/scram/scramjet.all.js",
			sync: "/scram/scramjet.sync.js",
		},
	});
	scramjet.init();
	return scramjet;
}

async function ensureTransportReady() {
	let wispUrl =
		(location.protocol === "https:" ? "wss" : "ws") +
		"://" +
		location.host +
		"/wisp/";
function getConnection() {
	if (connection) return connection;
	if (!window.BareMux || !window.BareMux.BareMuxConnection) {
		throw new Error("BareMux script failed to load.");
	}
	connection = new BareMux.BareMuxConnection("/baremux/worker.js");
	return connection;
}

	if ((await connection.getTransport()) !== "/libcurl/index.mjs") {
		await connection.setTransport("/libcurl/index.mjs", [{ websocket: wispUrl }]);
function getActiveTab() {
	for (var i = 0; i < tabs.length; i += 1) {
		if (tabs[i].id === activeTabId) return tabs[i];
	}
	return null;
}

function ensureFrame() {
	if (!frame) {
		frame = scramjet.createFrame();
		frame.frame.id = "sj-frame";
		landing.replaceWith(frame.frame);
function labelForUrl(url) {
	if (!url) return "New Tab";
	try {
		return new URL(url).hostname;
	} catch (err) {
		return url;
	}
}

async function navigate(inputValue, pushHistory = true) {
	if (!inputValue.trim()) {
function updateNavState() {
	var tab = getActiveTab();
	if (!tab) {
		backBtn.disabled = true;
		forwardBtn.disabled = true;
		return;
	}
	backBtn.disabled = tab.historyIndex <= 0;
	forwardBtn.disabled = tab.historyIndex >= tab.history.length - 1;
}

	clearErrors();
function renderTabs() {
	tabsEl.innerHTML = "";
	for (var i = 0; i < tabs.length; i += 1) {
		var tab = tabs[i];
		var item = document.createElement("div");
		item.className = "tab-item" + (tab.id === activeTabId ? " active" : "");

		var tabBtn = document.createElement("button");
		tabBtn.type = "button";
		tabBtn.className = "tab-btn";
		tabBtn.setAttribute("data-tab-id", tab.id);
		tabBtn.textContent = tab.title;

		var closeBtn = document.createElement("button");
		closeBtn.type = "button";
		closeBtn.className = "tab-close";
		closeBtn.setAttribute("data-tab-id", tab.id);
		closeBtn.innerHTML = "&times;";

		item.appendChild(tabBtn);
		item.appendChild(closeBtn);
		tabsEl.appendChild(item);
	}
}

function createFrameIfNeeded() {
	if (frameController) return;
	frameHost = document.createElement("div");
	frameHost.id = "sj-frame-host";
	landing.replaceWith(frameHost);

	frameController = getScramjet().createFrame();
	frameController.frame.classList.add("sj-frame", "active");
	frameHost.appendChild(frameController.frame);
	installNewTabInterceptors();
}

function installNewTabInterceptors() {
	if (!frameController) return;
	frameController.frame.addEventListener("load", function () {
		try {
			var win = frameController.frame.contentWindow;
			if (!win || !win.document || win.__sjTabsInstalled) return;
			win.__sjTabsInstalled = true;
			var originalOpen = win.open.bind(win);
			win.open = function (url, target, features) {
				if (!target || target === "_blank") {
					openInNewTab(String(url || win.location.href));
					return win;
				}
				return originalOpen(url, target, features);
			};

			win.document.addEventListener(
				"click",
				function (event) {
					var targetEl = event.target;
					if (!targetEl || typeof targetEl.closest !== "function") return;
					var link = targetEl.closest("a[target='_blank']");
					if (!link || !link.href) return;
					event.preventDefault();
					openInNewTab(link.href);
				},
				true,
			);
		} catch (err) {
			// ignore cross-origin interception failures
		}
	});
}

function createTab(initialUrl) {
	var tab = {
		id: String(++tabCounter),
		title: "New Tab",
		url: "",
		history: [],
		historyIndex: -1,
	};
	tabs.push(tab);
	activeTabId = tab.id;
	address.value = "";
	renderTabs();
	updateNavState();
	if (initialUrl) navigate(initialUrl, true, tab.id);
	return tab;
}

function closeTab(tabId) {
	if (tabs.length <= 1) {
		tabs[0].title = "New Tab";
		tabs[0].url = "";
		tabs[0].history = [];
		tabs[0].historyIndex = -1;
		address.value = "";
		renderTabs();
		updateNavState();
		return;
	}
	var removeIndex = -1;
	for (var i = 0; i < tabs.length; i += 1) {
		if (tabs[i].id === tabId) {
			removeIndex = i;
			break;
		}
	}
	if (removeIndex < 0) return;
	tabs.splice(removeIndex, 1);
	if (activeTabId === tabId) {
		activeTabId = tabs[Math.max(0, removeIndex - 1)].id;
	}
	renderTabs();
	switchTab(activeTabId);
}

function switchTab(tabId) {
	activeTabId = tabId;
	var tab = getActiveTab();
	if (!tab) return;
	address.value = tab.url;
	renderTabs();
	updateNavState();
	if (tab.url) {
		createFrameIfNeeded();
		frameController.go(tab.url);
	}
}

function ensureTransportReady() {
	try {
		await registerSW();
		await ensureTransportReady();
		var wispUrl =
			(location.protocol === "https:" ? "wss" : "ws") +
			"://" +
			location.host +
			"/wisp/";
		var mux = getConnection();
		return mux.getTransport().then(function (transport) {
			if (transport !== "/libcurl/index.mjs") {
				return mux.setTransport("/libcurl/index.mjs", [{ websocket: wispUrl }]);
			}
		});
	} catch (err) {
		showError("Failed to initialize Scramjet service worker/transport.", err.toString());
		return;
		return Promise.reject(err);
	}
}

	const destination = search(inputValue, searchEngine.value);
	ensureFrame();
	currentUrl = destination;
	address.value = destination;
	frame.go(destination);
function registerServiceWorker() {
	if (typeof registerSW !== "function") {
		return Promise.reject(new Error("registerSW is unavailable."));
	}
	return registerSW();
}

	if (pushHistory) {
		historyStack.splice(historyIndex + 1);
		historyStack.push(destination);
		historyIndex = historyStack.length - 1;
function openInNewTab(url) {
	createTab(url);
}

function navigate(inputValue, pushHistory, targetTabId) {
	var value = (inputValue || "").trim();
	if (!value) return;
	clearErrors();

	var tab = null;
	for (var i = 0; i < tabs.length; i += 1) {
		if (tabs[i].id === targetTabId) {
			tab = tabs[i];
			break;
		}
	}
	if (!tab) return;

	updateNavState();
	Promise.resolve()
		.then(registerServiceWorker)
		.then(ensureTransportReady)
		.then(function () {
			var searchFn = typeof search === "function" ? search : function (input) {
				return input;
			};
			var destination = searchFn(value, searchEngine.value);
			tab.url = destination;
			tab.title = labelForUrl(destination);
			if (pushHistory) {
				tab.history.splice(tab.historyIndex + 1);
				tab.history.push(destination);
				tab.historyIndex = tab.history.length - 1;
			}
			createFrameIfNeeded();
			frameController.go(destination);
			address.value = destination;
			renderTabs();
			updateNavState();
		})
		.catch(function (err) {
			showError("Failed to initialize Scramjet service worker/transport.", String(err));
		});
}

form.addEventListener("submit", async (event) => {
form.addEventListener("submit", function (event) {
	event.preventDefault();
	await navigate(address.value, true);
	var tab = getActiveTab();
	if (!tab) return;
	navigate(address.value, true, tab.id);
});

backBtn.addEventListener("click", async () => {
	if (historyIndex <= 0) {
		return;
	}

	historyIndex -= 1;
	await navigate(historyStack[historyIndex], false);
backBtn.addEventListener("click", function () {
	var tab = getActiveTab();
	if (!tab || tab.historyIndex <= 0) return;
	tab.historyIndex -= 1;
	navigate(tab.history[tab.historyIndex], false, tab.id);
});

forwardBtn.addEventListener("click", async () => {
	if (historyIndex >= historyStack.length - 1) {
		return;
	}
forwardBtn.addEventListener("click", function () {
	var tab = getActiveTab();
	if (!tab || tab.historyIndex >= tab.history.length - 1) return;
	tab.historyIndex += 1;
	navigate(tab.history[tab.historyIndex], false, tab.id);
});

	historyIndex += 1;
	await navigate(historyStack[historyIndex], false);
reloadBtn.addEventListener("click", function () {
	var tab = getActiveTab();
	if (!tab || !tab.url || !frameController) return;
	frameController.go(tab.url);
});

reloadBtn.addEventListener("click", () => {
	if (!frame || !currentUrl) {
		return;
fullscreenBtn.addEventListener("click", function () {
	if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
		document.documentElement.requestFullscreen();
	} else if (document.exitFullscreen) {
		document.exitFullscreen();
	}
});

	frame.go(currentUrl);
newTabBtn.addEventListener("click", function () {
	createTab("");
});

fullscreenBtn.addEventListener("click", async () => {
	if (!document.fullscreenElement) {
		await document.documentElement.requestFullscreen();
tabsEl.addEventListener("click", function (event) {
	var target = event.target;
	if (!target || typeof target.closest !== "function") return;
	var closeBtn = target.closest(".tab-close");
	if (closeBtn) {
		closeTab(closeBtn.getAttribute("data-tab-id"));
		return;
	}

	await document.exitFullscreen();
	var tabBtn = target.closest(".tab-btn");
	if (tabBtn) {
		switchTab(tabBtn.getAttribute("data-tab-id"));
	}
});

updateNavState();
try {
	createTab("");
} catch (err) {
	showError("Failed to initialize browser UI.", String(err));
}
