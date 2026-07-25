import { afterEach, describe, expect, it, vi } from "vitest";
import { createPreviewContextBridge } from "./contextBridge";

function previewFrame(
  source: { postMessage: ReturnType<typeof vi.fn> },
  rect: Pick<DOMRect, "left" | "top" | "width" | "height">,
  dimensions = { clientWidth: 100, clientHeight: 100, clientLeft: 0, clientTop: 0, offsetWidth: 100, offsetHeight: 100 },
) {
  const frame = document.createElement("iframe");
  Object.defineProperty(frame, "contentWindow", { value: source });
  Object.defineProperties(frame, {
    clientWidth: { value: dimensions.clientWidth },
    clientHeight: { value: dimensions.clientHeight },
    clientLeft: { value: dimensions.clientLeft },
    clientTop: { value: dimensions.clientTop },
    offsetWidth: { value: dimensions.offsetWidth },
    offsetHeight: { value: dimensions.offsetHeight },
  });
  vi.spyOn(frame, "getBoundingClientRect").mockReturnValue({ ...rect } as DOMRect);
  document.body.append(frame);
  return frame;
}

function dispatchFrom(source: object, data: unknown) {
  window.dispatchEvent(new MessageEvent("message", { data, source: source as unknown as MessageEventSource }));
}

afterEach(() => document.body.replaceChildren());

describe("preview context bridge", () => {
  it("opens a direct child request at viewport coordinates after issuing its token", () => {
    const source = { postMessage: vi.fn() };
    const open = vi.fn();
    const bridge = createPreviewContextBridge({ open, createToken: () => "direct-token" });
    const frame = previewFrame(source, { left: 120, top: 45, width: 100, height: 100 });

    bridge.setFrame(frame);
    bridge.issueToken();
    dispatchFrom(source, { type: "worklane:preview-context", token: "direct-token", x: 8, y: 9 });

    expect(source.postMessage).toHaveBeenCalledWith({ type: "worklane:preview-context-init", token: "direct-token" }, "*");
    expect(open).toHaveBeenCalledWith({ point: { x: 128, y: 54 }, origin: frame });
    bridge.destroy();
  });

  it("accepts a nested relay from only the current direct child and preserves its accumulated local offset", () => {
    const outerSource = { postMessage: vi.fn() };
    const unrelatedSource = { postMessage: vi.fn() };
    const open = vi.fn();
    const bridge = createPreviewContextBridge({ open, createToken: () => "nested-token" });
    const frame = previewFrame(outerSource, { left: 100, top: 200, width: 100, height: 100 });

    bridge.setFrame(frame);
    bridge.issueToken();
    dispatchFrom(unrelatedSource, { type: "worklane:preview-context-relay", token: "nested-token", x: 25, y: 30 });
    dispatchFrom(outerSource, { type: "worklane:preview-context-relay", token: "nested-token", x: 25, y: 30 });

    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith({ point: { x: 125, y: 230 }, origin: frame });
    bridge.destroy();
  });

  it("rejects stale tokens and messages after teardown", () => {
    const source = { postMessage: vi.fn() };
    const open = vi.fn();
    const tokens = ["first-token", "second-token"];
    const bridge = createPreviewContextBridge({ open, createToken: () => tokens.shift()! });
    const frame = previewFrame(source, { left: 0, top: 0, width: 100, height: 100 });

    bridge.setFrame(frame);
    bridge.issueToken();
    bridge.issueToken();
    dispatchFrom(source, { type: "worklane:preview-context", token: "first-token", x: 1, y: 1 });
    dispatchFrom(source, { type: "worklane:preview-context", token: "second-token", x: 2, y: 3 });
    bridge.destroy();
    dispatchFrom(source, { type: "worklane:preview-context", token: "second-token", x: 4, y: 5 });

    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith({ point: { x: 2, y: 3 }, origin: frame });
  });
  it("rejects requests before initialization and outside the frame content viewport", () => {
    const source = { postMessage: vi.fn() };
    const open = vi.fn();
    const bridge = createPreviewContextBridge({ open, createToken: () => "token" });
    const frame = previewFrame(source, { left: 10, top: 20, width: 100, height: 100 });

    bridge.setFrame(frame);
    dispatchFrom(source, { type: "worklane:preview-context", token: "token", x: 10, y: 10 });
    bridge.issueToken();
    dispatchFrom(source, { type: "worklane:preview-context", token: "token", x: -1, y: 10 });
    dispatchFrom(source, { type: "worklane:preview-context", token: "token", x: 10, y: -1 });
    dispatchFrom(source, { type: "worklane:preview-context", token: "token", x: 100, y: 10 });
    dispatchFrom(source, { type: "worklane:preview-context", token: "token", x: 10, y: 100 });
    dispatchFrom(source, { type: "worklane:preview-context", token: "token", x: Number.MAX_VALUE, y: 10 });

    expect(open).not.toHaveBeenCalled();
    bridge.destroy();
  });

  it("uses the iframe content-box offset and scale instead of accepting app-chrome coordinates", () => {
    const source = { postMessage: vi.fn() };
    const open = vi.fn();
    const bridge = createPreviewContextBridge({ open, createToken: () => "token" });
    const frame = previewFrame(
      source,
      { left: 100, top: 200, width: 408, height: 306 },
      { clientWidth: 200, clientHeight: 150, clientLeft: 2, clientTop: 3, offsetWidth: 204, offsetHeight: 153 },
    );

    bridge.setFrame(frame);
    bridge.issueToken();
    dispatchFrom(source, { type: "worklane:preview-context-relay", token: "token", x: 8, y: 9 });

    expect(open).toHaveBeenCalledWith({ point: { x: 120, y: 224 }, origin: frame });
    bridge.destroy();
  });

  it("rate-limits valid current-frame UI requests", () => {
    const source = { postMessage: vi.fn() };
    const open = vi.fn();
    let currentTime = 1_000;
    const bridge = createPreviewContextBridge({ open, createToken: () => "token", now: () => currentTime });
    const frame = previewFrame(source, { left: 0, top: 0, width: 100, height: 100 });

    bridge.setFrame(frame);
    bridge.issueToken();
    dispatchFrom(source, { type: "worklane:preview-context", token: "token", x: 1, y: 1 });
    currentTime += 299;
    dispatchFrom(source, { type: "worklane:preview-context", token: "token", x: 2, y: 2 });
    currentTime += 1;
    dispatchFrom(source, { type: "worklane:preview-context", token: "token", x: 3, y: 3 });

    expect(open).toHaveBeenCalledTimes(2);
    expect(open).toHaveBeenLastCalledWith({ point: { x: 3, y: 3 }, origin: frame });
    bridge.destroy();
  });
});
