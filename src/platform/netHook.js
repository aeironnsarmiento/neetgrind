// Watches NeetCode's own API calls. Logged-in progress lives on NeetCode's server, not in
// localStorage, so the only way to see it without handling auth tokens is to read the
// responses the page already gets. The hook runs in the page (userscripts are sandboxed) and
// posts what it sees back with postMessage. Read-only: requests pass through untouched.

const TAG = "neetgrind:net";

// Runs in the page context, so it must be self-contained (it's injected as source text).
function pageHook(tag) {
  if (window.__neetgrindNetHook) return;
  window.__neetgrindNetHook = true;
  const WATCH = /\/(callableFunctionHttp|executeCodeFunctionHttp)(?:[?#]|$)/;
  const post = (url, body, status, text) => {
    try {
      window.postMessage(
        { tag, url: String(url), body: typeof body === "string" ? body : null, status, text: String(text ?? ""), path: location.pathname },
        location.origin,
      );
    } catch {}
  };

  const XHR = XMLHttpRequest.prototype;
  const open = XHR.open;
  const send = XHR.send;
  XHR.open = function (method, url) {
    this.__ngUrl = String(url);
    return open.apply(this, arguments);
  };
  XHR.send = function (body) {
    if (WATCH.test(this.__ngUrl ?? "")) {
      this.addEventListener("load", () => {
        const text = this.responseType === "" || this.responseType === "text" ? this.responseText : JSON.stringify(this.response);
        post(this.__ngUrl, body, this.status, text);
      });
    }
    return send.apply(this, arguments);
  };

  const fetch0 = window.fetch;
  window.fetch = function (input, init) {
    const url = typeof input === "string" ? input : (input?.url ?? String(input));
    const res = fetch0.apply(this, arguments);
    if (WATCH.test(url)) {
      res.then((r) => r.clone().text().then((t) => post(url, init?.body, r.status, t))).catch(() => {});
    }
    return res;
  };
}

// Call as early as possible (document-start) so the hook is in place before NeetCode's first request.
export function installNetHook(onCapture) {
  const el = document.createElement("script");
  el.textContent = `(${pageHook})(${JSON.stringify(TAG)});`;
  (document.head || document.documentElement).appendChild(el);
  el.remove();

  window.addEventListener("message", (e) => {
    // Origin, not e.source: in Firefox the sandbox's `window` is a wrapper, not the page's.
    if (e.origin !== location.origin || e.data?.tag !== TAG) return;
    onCapture(e.data);
  });
}
