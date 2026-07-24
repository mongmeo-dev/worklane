import { describe, it, expect, beforeEach } from "vitest";
import type { Terminal } from "@xterm/xterm";
import { HangulImeAddon } from "./HangulImeAddon";

/**
 * xterm 코어의 CompositionHelper가 그리는 .composition-view 오버레이를 애드온이
 * 숨기는지 검증한다. 이 오버레이가 남아 있으면 PTY 에코와 겹쳐 "마지막 글자가 두 번"
 * 보이는 버그가 재발한다.
 */
function makeTerm(): { term: Terminal; overlay: HTMLElement } {
  const element = document.createElement("div");
  const textarea = document.createElement("textarea");
  textarea.classList.add("xterm-helper-textarea");
  const overlay = document.createElement("div");
  overlay.classList.add("composition-view");
  element.append(textarea, overlay);
  document.body.append(element);
  // 실제 xterm.css의 .composition-view.active { display: block } 규칙을 재현한다.
  const style = document.createElement("style");
  style.textContent = ".composition-view.active { display: block; }";
  document.head.append(style);
  return { term: { element } as unknown as Terminal, overlay };
}

describe("HangulImeAddon 조합 오버레이 숨김", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    document.head.innerHTML = "";
  });

  it("activate 시 .composition-view를 인라인 display:none으로 숨긴다", () => {
    const { term, overlay } = makeTerm();
    const addon = new HangulImeAddon(() => {});
    addon.activate(term);
    expect(overlay.style.display).toBe("none");
  });

  it("active 클래스가 붙어도 인라인 display:none이 우선해 계속 숨겨진다", () => {
    const { term, overlay } = makeTerm();
    const addon = new HangulImeAddon(() => {});
    addon.activate(term);
    // xterm이 조합 시작 시 붙이는 active 클래스를 흉내낸다.
    overlay.classList.add("active");
    expect(getComputedStyle(overlay).display).toBe("none");
  });

  it("dispose 시 인라인 display 오버라이드를 되돌린다", () => {
    const { term, overlay } = makeTerm();
    const addon = new HangulImeAddon(() => {});
    addon.activate(term);
    addon.dispose();
    expect(overlay.style.display).toBe("");
  });
});
