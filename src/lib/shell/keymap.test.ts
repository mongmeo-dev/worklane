import { describe, expect, it, vi } from "vitest";
import {
  allowedWhileModal,
  detectShortcutPlatform,
  resolveShortcut,
  type KeyLike,
} from "./keymap";

function chord(partial: Partial<KeyLike> & { key: string }): KeyLike {
  return { metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...partial };
}

/** macOS 기준 해석. 앱 단축키 표기(⌘)와 동일한 플랫폼이다. */
function onMac(partial: Partial<KeyLike> & { key: string }) {
  return resolveShortcut(chord(partial), "mac");
}

/** Windows/Linux 기준 해석. 주 수식키는 Ctrl이다. */
function onOther(partial: Partial<KeyLike> & { key: string }) {
  return resolveShortcut(chord(partial), "other");
}

describe("resolveShortcut", () => {
  it("수식키 없는 입력은 터미널에 양보한다", () => {
    expect(onMac({ key: "k", code: "KeyK" })).toBeNull();
    expect(onMac({ key: "1", code: "Digit1" })).toBeNull();
  });

  it("⌘K는 팔레트, ⌘0은 오버뷰", () => {
    expect(onMac({ key: "k", code: "KeyK", metaKey: true })).toEqual({ type: "palette" });
    expect(onMac({ key: "0", code: "Digit0", metaKey: true })).toEqual({ type: "overview" });
  });

  it("⌘1~⌘9는 0-based 인덱스로 점프한다", () => {
    expect(onMac({ key: "1", code: "Digit1", metaKey: true })).toEqual({ type: "jump", index: 0 });
    expect(onMac({ key: "9", code: "Digit9", metaKey: true })).toEqual({ type: "jump", index: 8 });
  });

  it("macOS에서 Ctrl 조합은 터미널 제어 문자이므로 가로채지 않는다", () => {
    // vim의 ^B(페이지 위)·^N(자동완성), readline의 ^K(줄 삭제)가 앱 액션과 겹치면 안 된다.
    expect(onMac({ key: "b", code: "KeyB", ctrlKey: true })).toBeNull();
    expect(onMac({ key: "k", code: "KeyK", ctrlKey: true })).toBeNull();
    expect(onMac({ key: "n", code: "KeyN", ctrlKey: true })).toBeNull();
    expect(onMac({ key: "1", code: "Digit1", ctrlKey: true })).toBeNull();
  });

  it("macOS에서 ⌃⌘ 조합은 앱 단축키가 아니다", () => {
    expect(onMac({ key: "b", code: "KeyB", metaKey: true, ctrlKey: true })).toBeNull();
  });

  it("macOS가 아니면 Ctrl이 주 수식키다", () => {
    expect(onOther({ key: "b", code: "KeyB", ctrlKey: true })).toEqual({ type: "toggleLeft" });
    expect(onOther({ key: "k", code: "KeyK", ctrlKey: true })).toEqual({ type: "palette" });
    // Windows/Linux에서 Meta(Win 키)는 OS가 소유하므로 앱 단축키로 쓰지 않는다.
    expect(onOther({ key: "b", code: "KeyB", metaKey: true })).toBeNull();
  });

  it("Option 조합은 대체 글리프가 와도 code로 판별한다", () => {
    // macOS에서 ⌘⌥B는 event.key가 "∫"로 들어온다.
    expect(onMac({ key: "∫", code: "KeyB", metaKey: true, altKey: true })).toEqual({
      type: "toggleRight",
    });
  });

  it("⌘⌥↑↓는 워크스페이스를 순환한다", () => {
    expect(onMac({ key: "ArrowDown", metaKey: true, altKey: true })).toEqual({ type: "cycle", delta: 1 });
    expect(onMac({ key: "ArrowUp", metaKey: true, altKey: true })).toEqual({ type: "cycle", delta: -1 });
  });

  it("⌘⇧A는 주의 필요 항목으로 이동한다", () => {
    expect(onMac({ key: "A", code: "KeyA", metaKey: true, shiftKey: true })).toEqual({ type: "attention" });
  });

  it("⌘N/⌘⇧N/⌘⇧T를 구분한다", () => {
    expect(onMac({ key: "n", code: "KeyN", metaKey: true })).toEqual({ type: "newAgent" });
    expect(onMac({ key: "N", code: "KeyN", metaKey: true, shiftKey: true })).toEqual({ type: "fanout" });
    expect(onMac({ key: "T", code: "KeyT", metaKey: true, shiftKey: true })).toEqual({ type: "tasks" });
  });

  it("⌘/와 ⌘?는 모두 단축키 도움말을 연다", () => {
    expect(onMac({ key: "/", code: "Slash", metaKey: true })).toEqual({ type: "help" });
    expect(onMac({ key: "?", code: "Slash", metaKey: true, shiftKey: true })).toEqual({ type: "help" });
  });

  it("⌘,는 설정을 연다", () => {
    expect(onMac({ key: ",", code: "Comma", metaKey: true })).toEqual({ type: "settings" });
  });

  it("정의되지 않은 조합은 무시한다", () => {
    expect(onMac({ key: "z", code: "KeyZ", metaKey: true })).toBeNull();
    expect(onMac({ key: "c", code: "KeyC", metaKey: true, shiftKey: true })).toBeNull();
  });
});

describe("detectShortcutPlatform", () => {
  it("macOS WebView는 mac으로 판별한다", () => {
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15",
      platform: "MacIntel",
    });
    expect(detectShortcutPlatform()).toBe("mac");
    vi.unstubAllGlobals();
  });

  it("그 외 플랫폼은 other로 판별한다", () => {
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      platform: "Win32",
    });
    expect(detectShortcutPlatform()).toBe("other");
    vi.unstubAllGlobals();
  });
});

describe("allowedWhileModal", () => {
  it("모달 위에서는 팔레트와 도움말만 허용한다", () => {
    expect(allowedWhileModal({ type: "palette" })).toBe(true);
    expect(allowedWhileModal({ type: "help" })).toBe(true);
    expect(allowedWhileModal({ type: "jump", index: 0 })).toBe(false);
    expect(allowedWhileModal({ type: "cycle", delta: 1 })).toBe(false);
  });
});
