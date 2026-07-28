import { describe, expect, it } from "vitest";
import { allowedWhileModal, resolveShortcut, type KeyLike } from "./keymap";

function chord(partial: Partial<KeyLike> & { key: string }): KeyLike {
  return { metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...partial };
}

describe("resolveShortcut", () => {
  it("수식키 없는 입력은 터미널에 양보한다", () => {
    expect(resolveShortcut(chord({ key: "k", code: "KeyK" }))).toBeNull();
    expect(resolveShortcut(chord({ key: "1", code: "Digit1" }))).toBeNull();
  });

  it("⌘K는 팔레트, ⌘0은 오버뷰", () => {
    expect(resolveShortcut(chord({ key: "k", code: "KeyK", metaKey: true }))).toEqual({ type: "palette" });
    expect(resolveShortcut(chord({ key: "0", code: "Digit0", metaKey: true }))).toEqual({ type: "overview" });
  });

  it("⌘1~⌘9는 0-based 인덱스로 점프한다", () => {
    expect(resolveShortcut(chord({ key: "1", code: "Digit1", metaKey: true }))).toEqual({ type: "jump", index: 0 });
    expect(resolveShortcut(chord({ key: "9", code: "Digit9", metaKey: true }))).toEqual({ type: "jump", index: 8 });
  });

  it("Ctrl도 ⌘와 동일하게 취급한다", () => {
    expect(resolveShortcut(chord({ key: "b", code: "KeyB", ctrlKey: true }))).toEqual({ type: "toggleLeft" });
  });

  it("Option 조합은 대체 글리프가 와도 code로 판별한다", () => {
    // macOS에서 ⌘⌥B는 event.key가 "∫"로 들어온다.
    expect(resolveShortcut(chord({ key: "∫", code: "KeyB", metaKey: true, altKey: true }))).toEqual({
      type: "toggleRight",
    });
  });

  it("⌘⌥↑↓는 워크스페이스를 순환한다", () => {
    expect(resolveShortcut(chord({ key: "ArrowDown", metaKey: true, altKey: true }))).toEqual({ type: "cycle", delta: 1 });
    expect(resolveShortcut(chord({ key: "ArrowUp", metaKey: true, altKey: true }))).toEqual({ type: "cycle", delta: -1 });
  });

  it("⌘⇧A는 주의 필요 항목으로 이동한다", () => {
    expect(resolveShortcut(chord({ key: "A", code: "KeyA", metaKey: true, shiftKey: true }))).toEqual({ type: "attention" });
  });

  it("⌘N/⌘⇧N/⌘⇧T를 구분한다", () => {
    expect(resolveShortcut(chord({ key: "n", code: "KeyN", metaKey: true }))).toEqual({ type: "newAgent" });
    expect(resolveShortcut(chord({ key: "N", code: "KeyN", metaKey: true, shiftKey: true }))).toEqual({ type: "fanout" });
    expect(resolveShortcut(chord({ key: "T", code: "KeyT", metaKey: true, shiftKey: true }))).toEqual({ type: "tasks" });
  });

  it("⌘/와 ⌘?는 모두 단축키 도움말을 연다", () => {
    expect(resolveShortcut(chord({ key: "/", code: "Slash", metaKey: true }))).toEqual({ type: "help" });
    expect(resolveShortcut(chord({ key: "?", code: "Slash", metaKey: true, shiftKey: true }))).toEqual({ type: "help" });
  });

  it("⌘,는 설정을 연다", () => {
    expect(resolveShortcut(chord({ key: ",", code: "Comma", metaKey: true }))).toEqual({ type: "settings" });
  });

  it("정의되지 않은 조합은 무시한다", () => {
    expect(resolveShortcut(chord({ key: "z", code: "KeyZ", metaKey: true }))).toBeNull();
    expect(resolveShortcut(chord({ key: "c", code: "KeyC", metaKey: true, shiftKey: true }))).toBeNull();
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
