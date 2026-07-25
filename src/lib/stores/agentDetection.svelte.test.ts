import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$lib/ipc/pty", () => ({
  detectSessionProcesses: vi.fn(),
}));

import { detectSessionProcesses } from "$lib/ipc/pty";
import { agentDetection } from "./agentDetection.svelte";

describe("agentDetection", () => {
  beforeEach(() => vi.clearAllMocks());

  it("forget 뒤에 완료된 늦은 refresh 결과를 거부한다", async () => {
    let resolveDetection!: (tokens: string[]) => void;
    (detectSessionProcesses as any).mockImplementation(
      () => new Promise<string[]>((resolve) => { resolveDetection = resolve; }),
    );

    agentDetection.activate("deleted-terminal");
    const refresh = agentDetection.refresh("deleted-terminal");
    agentDetection.forget("deleted-terminal");
    resolveDetection(["codex"]);
    await refresh;

    expect(agentDetection.get("deleted-terminal")).toBeNull();
  });

  it("forget 뒤 scheduler refresh는 감지 요청이나 캐시를 되살리지 않는다", async () => {
    agentDetection.activate("forgotten-terminal");
    agentDetection.forget("forgotten-terminal");

    await agentDetection.refresh("forgotten-terminal");

    expect(detectSessionProcesses).not.toHaveBeenCalled();
    expect(agentDetection.get("forgotten-terminal")).toBeNull();
  });

  it("operational detect failure 뒤에도 같은 활성 세대는 갱신할 수 있다", async () => {
    (detectSessionProcesses as any)
      .mockRejectedValueOnce(new Error("backend unavailable"))
      .mockResolvedValueOnce(["codex"]);
    agentDetection.activate("retry-terminal");

    await agentDetection.refresh("retry-terminal");
    await agentDetection.refresh("retry-terminal");

    expect(detectSessionProcesses).toHaveBeenCalledTimes(2);
    expect(agentDetection.get("retry-terminal")).toBe("codex");
    agentDetection.forget("retry-terminal");
  });

  it("명시적인 closed session 오류만 감지 대상을 forget한다", async () => {
    (detectSessionProcesses as any).mockRejectedValueOnce(new Error("SESSION_CLOSED"));
    agentDetection.activate("closed-terminal");

    await agentDetection.refresh("closed-terminal");
    await agentDetection.refresh("closed-terminal");

    expect(detectSessionProcesses).toHaveBeenCalledTimes(1);
    expect(agentDetection.get("closed-terminal")).toBeNull();
  });
});
