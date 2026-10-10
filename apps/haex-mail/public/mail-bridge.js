// Loaded into the mail body iframe (which runs with `allow-scripts` but stays
// an opaque origin). It is a file rather than an inline script because the
// iframe inherits the host's Content-Security-Policy, which only allows
// scripts from the extension's own URL (holzi rejects unknown inline scripts).
//
// Forwards link clicks to the host app so it can open them in the system
// browser — the extension is itself nested in a sandbox without
// `allow-popups`, so `target="_blank"` / `window.open` would be blocked.
// Also reports the document's content height so the host can size the iframe
// to fit it exactly — otherwise the mail body scrolls in its own box instead
// of together with the rest of the message view. Also forwards the Delete key
// so the host's "delete open message" shortcut still fires when focus is
// inside the iframe's own document (keydown there never reaches the host
// window — cross-frame events don't bubble across a frame boundary). Also
// forwards link hover so the host can show the real target URL in a
// browser-style status line (label text and actual href can differ).
(function () {
  function linkOf(e) {
    return e.target && e.target.closest ? e.target.closest("a[href]") : null;
  }
  addEventListener(
    "click",
    function (e) {
      var a = linkOf(e);
      if (!a) return;
      var h = a.getAttribute("href") || "";
      if (/^https?:\/\//i.test(h)) {
        e.preventDefault();
        parent.postMessage({ haexMailOpenUrl: h }, "*");
      }
    },
    true,
  );
  addEventListener(
    "keydown",
    function (e) {
      if (e.key === "Delete") parent.postMessage({ haexMailKeydown: e.key }, "*");
    },
    true,
  );
  addEventListener(
    "mouseover",
    function (e) {
      var a = linkOf(e);
      if (!a) return;
      parent.postMessage({ haexMailHoverUrl: a.getAttribute("href") || "" }, "*");
    },
    true,
  );
  addEventListener(
    "mouseout",
    function (e) {
      var a = linkOf(e);
      if (!a) return;
      var to = e.relatedTarget;
      if (to && a.contains(to)) return;
      parent.postMessage({ haexMailHoverUrl: null }, "*");
    },
    true,
  );
  function reportHeight() {
    parent.postMessage(
      { haexMailContentHeight: document.documentElement.scrollHeight },
      "*",
    );
  }
  new ResizeObserver(reportHeight).observe(document.body);
  reportHeight();
})();
