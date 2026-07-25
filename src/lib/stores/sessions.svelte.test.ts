import { beforeEach, describe, expect, it, vi } from "vitest";

const listenStatus = vi.hoisted(() => vi.fn());

vi.mock("$lib/ipc/status", () => ({
  listenStatus,
}));

describe("sessionStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("forget 뒤의 늦은 status event는 삭제된 session을 되살리지 않는다", async () => {
    let onStatus!: (event: { sessionId: string; status: "running" }) => void;
    listenStatus.mockImplementation(async (callback: (event: { sessionId: string; status: "running" }) => void) => {
      onStatus = callback;
    });
    const { sessionStatus } = await import("./sessions.svelte");

    await sessionStatus.start();
    sessionStatus.forget("deleted-terminal");
    onStatus({ sessionId: "deleted-terminal", status: "running" });

    expect(sessionStatus.get("deleted-terminal")).toBeUndefined();
    expect(sessionStatus.revision("deleted-terminal")).toBe(0);
  });
});
