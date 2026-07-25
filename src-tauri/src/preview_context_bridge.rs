pub const INIT_SCRIPT: &str = r#"
(() => {
  const INIT = "worklane:preview-context-init";
  const CONTEXT = "worklane:preview-context";
  const RELAY = "worklane:preview-context-relay";
  // This is a per-frame UI request nonce, not authentication or permission to act.
  let token = null;

  function directFrame(source) {
    return Array.from(document.querySelectorAll("iframe")).find((frame) => frame.contentWindow === source) ?? null;
  }

  function sendInit(frame) {
    if (token && frame.contentWindow) frame.contentWindow.postMessage({ type: INIT, token }, "*");
  }

  function keyboardPoint(event) {
    const target = document.activeElement instanceof Element
      ? document.activeElement
      : event.target instanceof Element
        ? event.target
        : document.documentElement;
    const rect = target.getBoundingClientRect();
    const viewport = window.visualViewport;
    const left = Number.isFinite(viewport?.offsetLeft) ? viewport.offsetLeft : 0;
    const top = Number.isFinite(viewport?.offsetTop) ? viewport.offsetTop : 0;
    const width = Number.isFinite(viewport?.width) && viewport.width > 0
      ? viewport.width
      : Math.max(document.documentElement.clientWidth, window.innerWidth, 1);
    const height = Number.isFinite(viewport?.height) && viewport.height > 0
      ? viewport.height
      : Math.max(document.documentElement.clientHeight, window.innerHeight, 1);
    const right = left + Math.max(width - 1, 0);
    const bottom = top + Math.max(height - 1, 0);
    return {
      x: Math.min(Math.max(Number.isFinite(rect.left) ? rect.left : left, left), right),
      y: Math.min(Math.max(Number.isFinite(rect.bottom) ? rect.bottom : top, top), bottom),
    };
  }

  function report(event) {
    if (!token || window.parent === window) return;
    const point = event instanceof MouseEvent
      ? { x: event.clientX, y: event.clientY }
      : keyboardPoint(event);
    window.parent.postMessage({ type: CONTEXT, token, x: point.x, y: point.y }, "*");
  }

  document.addEventListener("contextmenu", (event) => {
    // Native menus must never escape a framed preview, even before initialization.
    event.preventDefault();
    report(event);
  }, true);
  document.addEventListener("keydown", (event) => {
    if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
      event.preventDefault();
      report(event);
    }
  }, true);
  document.addEventListener("load", (event) => {
    if (event.target instanceof HTMLIFrameElement) sendInit(event.target);
  }, true);

  window.addEventListener("message", (event) => {
    const data = event.data;
    if (!data || typeof data !== "object") return;

    if (data.type === INIT) {
      if (event.source !== window.parent || typeof data.token !== "string") return;
      token = data.token;
      document.querySelectorAll("iframe").forEach(sendInit);
      return;
    }

    if ((data.type !== CONTEXT && data.type !== RELAY) || event.source === null || data.token !== token || !Number.isFinite(data.x) || !Number.isFinite(data.y)) return;
    const frame = directFrame(event.source);
    if (!frame || window.parent === window) return;
    if (data.x < 0 || data.y < 0 || data.x >= frame.clientWidth || data.y >= frame.clientHeight) return;

    const rect = frame.getBoundingClientRect();
    const scaleX = frame.offsetWidth > 0 ? rect.width / frame.offsetWidth : 1;
    const scaleY = frame.offsetHeight > 0 ? rect.height / frame.offsetHeight : 1;
    if (!Number.isFinite(scaleX) || !Number.isFinite(scaleY) || scaleX <= 0 || scaleY <= 0) return;

    window.parent.postMessage({
      type: RELAY,
      token,
      x: rect.left + (frame.clientLeft + data.x) * scaleX,
      y: rect.top + (frame.clientTop + data.y) * scaleY,
    }, "*");
  });
})();
"#;
