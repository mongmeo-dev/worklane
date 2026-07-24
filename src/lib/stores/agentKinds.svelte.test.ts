import { beforeEach, describe, expect, it, vi } from "vitest";
import { firstCommandToken } from "./agentKinds.svelte";

const STORAGE_KEY = "settings:agent-kinds";

async function freshStore() {
  const mod = await import("./agentKinds.svelte");
  return mod.agentKindStore;
}

describe("agentKinds store", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it("기본 5종을 씨앗으로 시작한다", async () => {
    const store = await freshStore();
    expect(store.cliKindIds).toEqual(["claude-code", "codex", "cursor", "gemini", "gajae-code"]);
    expect(store.cliKinds.every((k) => k.builtin)).toBe(true);
  });

  it("selectableKindIds는 빈 터미널을 맨 뒤에 포함한다", async () => {
    const store = await freshStore();
    expect(store.selectableKindIds).toEqual([
      "claude-code",
      "codex",
      "cursor",
      "gemini",
      "gajae-code",
      "terminal",
    ]);
  });

  it("labelOf는 표시명을, 빈 터미널/미지의 값도 처리한다", async () => {
    const store = await freshStore();
    expect(store.labelOf("claude-code")).toBe("Claude Code");
    expect(store.labelOf("terminal")).toBe("빈 터미널");
    expect(store.labelOf("unknown")).toBe("unknown");
  });

  it("defaultCommandOf는 기본 커맨드를, 빈 터미널은 빈 문자열을 준다", async () => {
    const store = await freshStore();
    expect(store.defaultCommandOf("cursor")).toBe("cursor-agent");
    expect(store.defaultCommandOf("terminal")).toBe("");
    expect(store.defaultCommandOf("unknown")).toBe("");
  });

  it("add는 표시명에서 id를 파생하고 저장한다", async () => {
    const store = await freshStore();
    const def = store.add("Aider", "aider --model gpt-4");
    expect(def.id).toBe("aider");
    expect(def.builtin).toBe(false);
    expect(store.labelOf("aider")).toBe("Aider");
    expect(store.defaultCommandOf("aider")).toBe("aider --model gpt-4");
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toHaveLength(6);
  });

  it("add는 id가 충돌하면 접미사를 붙인다", async () => {
    const store = await freshStore();
    const def = store.add("Codex", "codex --alt");
    expect(def.id).toBe("codex-2");
  });

  it("add는 빈 이름이면 예외를 던진다", async () => {
    const store = await freshStore();
    expect(() => store.add("   ", "x")).toThrow();
  });

  it("update는 표시명·기본 커맨드를 바꾸고 저장한다", async () => {
    const store = await freshStore();
    store.update("claude-code", { defaultCommand: "claude --dangerously" });
    expect(store.defaultCommandOf("claude-code")).toBe("claude --dangerously");
    store.update("claude-code", { label: "Claude" });
    expect(store.labelOf("claude-code")).toBe("Claude");
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(saved.find((k: { id: string }) => k.id === "claude-code")).toMatchObject({
      label: "Claude",
      defaultCommand: "claude --dangerously",
    });
  });

  it("update는 빈 표시명은 무시하고 기존값을 유지한다", async () => {
    const store = await freshStore();
    store.update("codex", { label: "  " });
    expect(store.labelOf("codex")).toBe("Codex");
  });

  it("remove는 기본 종류도 삭제하고 저장한다", async () => {
    const store = await freshStore();
    store.remove("codex");
    expect(store.cliKindIds).toEqual(["claude-code", "cursor", "gemini", "gajae-code"]);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toHaveLength(4);
  });

  it("reorder는 항목을 목표 위치로 옮기고 저장한다", async () => {
    const store = await freshStore();
    store.reorder(1, 0);
    expect(store.cliKindIds).toEqual(["codex", "claude-code", "cursor", "gemini", "gajae-code"]);
    store.reorder(0, 3);
    expect(store.cliKindIds).toEqual(["claude-code", "cursor", "gemini", "codex", "gajae-code"]);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).map((k: { id: string }) => k.id)).toEqual([
      "claude-code",
      "cursor",
      "gemini",
      "codex",
      "gajae-code",
    ]);
  });

  it("reorder는 범위를 벗어나거나 동일한 위치면 무시한다", async () => {
    const store = await freshStore();
    store.reorder(0, 0);
    store.reorder(-1, 2);
    store.reorder(0, 9);
    expect(store.cliKindIds).toEqual(["claude-code", "codex", "cursor", "gemini", "gajae-code"]);
  });

  it("reorder로 바뀐 순서는 selectableKindIds(생성 모달 옵션)에 반영된다", async () => {
    const store = await freshStore();
    store.reorder(3, 2);
    expect(store.selectableKindIds).toEqual([
      "claude-code",
      "codex",
      "gemini",
      "cursor",
      "gajae-code",
      "terminal",
    ]);
  });

  it("init은 저장된 목록(삭제 반영 포함)을 복원한다", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([{ id: "aider", label: "Aider", defaultCommand: "aider", builtin: false }]),
    );
    const store = await freshStore();
    store.init();
    expect(store.cliKindIds).toEqual(["aider"]);
  });

  it("init은 빈 배열(사용자가 전부 삭제)을 그대로 반영한다", async () => {
    localStorage.setItem(STORAGE_KEY, "[]");
    const store = await freshStore();
    store.init();
    expect(store.cliKindIds).toEqual([]);
    expect(store.selectableKindIds).toEqual(["terminal"]);
  });

  it("init은 통째로 손상된 저장값이면 기본값을 유지한다", async () => {
    localStorage.setItem(STORAGE_KEY, "{{not json");
    const store = await freshStore();
    store.init();
    expect(store.cliKindIds).toEqual(["claude-code", "codex", "cursor", "gemini", "gajae-code"]);
  });

  it("init은 유효 항목이 하나도 없는 배열이면 기본값을 유지한다", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([{ nope: 1 }, { id: "terminal" }]));
    const store = await freshStore();
    store.init();
    expect(store.cliKindIds).toEqual(["claude-code", "codex", "cursor", "gemini", "gajae-code"]);
  });
});

describe("firstCommandToken", () => {
  it("첫 토큰의 basename을 소문자로 뽑는다", () => {
    expect(firstCommandToken("codex --model o3")).toBe("codex");
    expect(firstCommandToken("/usr/bin/claude")).toBe("claude");
    expect(firstCommandToken("  claude  ")).toBe("claude");
    expect(firstCommandToken("")).toBe("");
  });
});

describe("agentKindStore.detectKind", () => {
  it("프로세스 토큰이 종류의 실행 커맨드와 맞으면 그 종류를 감지한다", async () => {
    const store = await freshStore();
    // 기본 제공 종류(claude-code→claude, codex→codex)가 감지 대상.
    expect(store.detectKind(["zsh", "node", "claude"])).toBe("claude-code");
    expect(store.detectKind(["zsh", "codex"])).toBe("codex");
  });

  it("맞는 커맨드가 없으면 null을 반환한다", async () => {
    const store = await freshStore();
    expect(store.detectKind(["zsh", "vim"])).toBeNull();
    expect(store.detectKind([])).toBeNull();
  });
});
