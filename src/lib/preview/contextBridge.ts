import type { ContextMenuPoint } from "$lib/context-menu/model";

const INIT = "worklane:preview-context-init";
const CONTEXT = "worklane:preview-context";
const RELAY = "worklane:preview-context-relay";

// Requests are untrusted current-frame UI hints; they can only open the preview menu.
type PreviewContextMessage = {
  type: typeof CONTEXT | typeof RELAY;
  token: string;
  x: number;
  y: number;
};

type PreviewContextInit = {
  type: typeof INIT;
  token: string;
};

export type PreviewContextBridgeOptions = {
  open: (options: { point: ContextMenuPoint; origin: HTMLIFrameElement }) => void;
  createToken?: () => string;
  now?: () => number;
};

export type PreviewContextBridge = {
  setFrame: (frame: HTMLIFrameElement | null) => void;
  issueToken: (frame?: HTMLIFrameElement | null) => void;
  destroy: () => void;
};

export function createPreviewContextBridge({
  open,
  createToken = () => crypto.randomUUID(),
  now = () => Date.now(),
}: PreviewContextBridgeOptions): PreviewContextBridge {
  let frame: HTMLIFrameElement | null = null;
  // The nonce only associates a request with the current frame; it grants no action authority.
  let token: string | null = null;
  let lastOpenAt = -Infinity;
  let disposed = false;

  const onMessage = (event: MessageEvent<unknown>) => {
    if (disposed || !frame || event.source !== frame.contentWindow) return;
    const message = previewContextMessage(event.data);
    if (!message || message.token !== token) return;

    const point = iframeContentPoint(frame, message.x, message.y);
    const openedAt = now();
    if (!point || !Number.isFinite(openedAt) || openedAt - lastOpenAt < 300) return;

    lastOpenAt = openedAt;
    open({ point, origin: frame });
  };

  window.addEventListener("message", onMessage);

  return {
    setFrame(nextFrame) {
      if (frame === nextFrame) return;
      frame = nextFrame;
      token = null;
    },
    issueToken(target = frame) {
      if (disposed || !target || target !== frame || !target.contentWindow) return;
      token = createToken();
      const message: PreviewContextInit = { type: INIT, token };
      target.contentWindow.postMessage(message, "*");
    },
    destroy() {
      if (disposed) return;
      disposed = true;
      token = null;
      frame = null;
      window.removeEventListener("message", onMessage);
    },
  };
}

function previewContextMessage(value: unknown): PreviewContextMessage | null {
  if (!value || typeof value !== "object") return null;
  const message = value as Partial<PreviewContextMessage>;
  if ((message.type !== CONTEXT && message.type !== RELAY) || typeof message.token !== "string" || !Number.isFinite(message.x) || !Number.isFinite(message.y)) return null;
  return message as PreviewContextMessage;
}

function iframeContentPoint(frame: HTMLIFrameElement, x: number, y: number): ContextMenuPoint | null {
  if (x < 0 || y < 0 || x >= frame.clientWidth || y >= frame.clientHeight) return null;

  const rect = frame.getBoundingClientRect();
  const scaleX = frame.offsetWidth > 0 ? rect.width / frame.offsetWidth : 1;
  const scaleY = frame.offsetHeight > 0 ? rect.height / frame.offsetHeight : 1;
  if (!Number.isFinite(scaleX) || !Number.isFinite(scaleY) || scaleX <= 0 || scaleY <= 0) return null;

  const point = {
    x: rect.left + (frame.clientLeft + x) * scaleX,
    y: rect.top + (frame.clientTop + y) * scaleY,
  };
  return Number.isFinite(point.x) && Number.isFinite(point.y) ? point : null;
}
