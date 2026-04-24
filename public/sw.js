importScripts("/scram/scramjet.all.js");

const { ScramjetServiceWorker } = $scramjetLoadWorker();
const scramjet = new ScramjetServiceWorker();

/**
 * Injected into proxied HTML documents by the SW.
 * It captures popup flows like:
 * const w = window.open("about:blank","_blank");
 * w.document.write(...); w.document.close();
 * and notifies the Tempest top app to open an internal proxy tab.
 */
const TEMPEST_POPUP_SHIM = `
<script>
(() => {
  if (window.__tempestPopupShimInstalled) return;
  window.__tempestPopupShimInstalled = true;

  function sendToTop(payload) {
    try {
      top.postMessage({ __tempestPopup: true, ...payload }, "*");
    } catch (_) {}
  }

  function resolveUrl(raw, base) {
    try {
      return new URL(String(raw || ""), base || location.href).href;
    } catch (_) {
      return String(raw || "");
    }
  }

  function extractIframeSrc(html) {
    const m = String(html || "").match(/<iframe\\b[^>]*\\bsrc\\s*=\\s*["']([^"']+)["']/i);
    return m ? m[1] : "";
  }

  function createPopupProxy(baseUrl) {
    let closed = false;
    let opened = false;
    let buffer = "";

    function nav(url) {
      if (closed || !url) return;
      sendToTop({ type: "navigate", url: resolveUrl(url, baseUrl) });
    }

    const locationObj = {};
    Object.defineProperty(locationObj, "href", {
      get() { return "about:blank"; },
      set(v) { nav(v); }
    });
    locationObj.assign = (v) => nav(v);
    locationObj.replace = (v) => nav(v);

    const documentObj = {
      open() { opened = true; buffer = ""; },
      write(chunk) {
        if (!opened) { opened = true; buffer = ""; }
        buffer += String(chunk || "");
      },
      close() {
        const iframeSrc = extractIframeSrc(buffer);
        if (iframeSrc) {
          nav(iframeSrc);
          return;
        }
        sendToTop({ type: "srcdoc", html: buffer || "<!doctype html><title>Tempest</title>" });
      }
    };

    return {
      closed: false,
      close() { closed = true; this.closed = true; },
      focus() {},
      blur() {},
      postMessage() {},
      opener: window,
      location: locationObj,
      document: documentObj
    };
  }

  const nativeOpen = window.open ? window.open.bind(window) : null;
  if (nativeOpen) {
    window.open = function(url = "", target = "_blank", features = "") {
      const t = String(target || "_blank").toLowerCase();
      if (t === "_blank" || t === "_new" || t === "") {
        const requested = String(url || "").trim();
        if (requested && requested !== "about:blank") {
          sendToTop({ type: "navigate", url: resolveUrl(requested, location.href) });
        }
        return createPopupProxy(location.href);
      }
      return nativeOpen(url, target, features);
    };
  }

  document.addEventListener("click", (event) => {
    const anchor = event.target instanceof Element ? event.target.closest("a[target='_blank']") : null;
    if (!anchor) return;
    const href = anchor.getAttribute("href");
    if (!href) return;
    event.preventDefault();
    sendToTop({ type: "navigate", url: resolveUrl(href, location.href) });
  }, true);
})();
</script>
`;

function injectShimIntoHtml(html) {
	const source = String(html || "");
	if (source.includes("__tempestPopupShimInstalled")) {
		return source;
	}

	if (/<head[^>]*>/i.test(source)) {
		return source.replace(/<head([^>]*)>/i, `<head$1>${TEMPEST_POPUP_SHIM}`);
	}

	return `${TEMPEST_POPUP_SHIM}${source}`;
}

async function handleRequest(event) {
	await scramjet.loadConfig();

	if (scramjet.route(event)) {
		const response = await scramjet.fetch(event);

		const contentType = response.headers.get("content-type") || "";
		const isHtml = /text\\/html/i.test(contentType);

		if (!isHtml) {
			return response;
		}

		const originalHtml = await response.text();
		const patchedHtml = injectShimIntoHtml(originalHtml);

		const headers = new Headers(response.headers);
		headers.delete("content-length");

		return new Response(patchedHtml, {
			status: response.status,
			statusText: response.statusText,
			headers,
		});
	}

	return fetch(event.request);
}

self.addEventListener("fetch", (event) => {
	event.respondWith(handleRequest(event));
});
