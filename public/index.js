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

function clearErrors() {
	error.textContent = "";
	errorCode.textContent = "";
}

function showError(message, code = "") {
	error.textContent = message;
	errorCode.textContent = code;
}

function updateNavState() {
	backBtn.disabled = historyIndex <= 0;
	forwardBtn.disabled = historyIndex >= historyStack.length - 1;
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
}

async function navigate(inputValue, pushHistory = true) {
	if (!inputValue.trim()) {
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

	if (pushHistory) {
		historyStack.splice(historyIndex + 1);
		historyStack.push(destination);
		historyIndex = historyStack.length - 1;
	}

	updateNavState();
}

form.addEventListener("submit", async (event) => {
	event.preventDefault();
	await navigate(address.value, true);
});

backBtn.addEventListener("click", async () => {
	if (historyIndex <= 0) {
		return;
	}

	historyIndex -= 1;
	await navigate(historyStack[historyIndex], false);
});

forwardBtn.addEventListener("click", async () => {
	if (historyIndex >= historyStack.length - 1) {
		return;
	}

	historyIndex += 1;
	await navigate(historyStack[historyIndex], false);
});

reloadBtn.addEventListener("click", () => {
	if (!frame || !currentUrl) {
		return;
	}

	frame.go(currentUrl);
});

updateNavState();
