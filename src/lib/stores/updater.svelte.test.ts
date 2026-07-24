import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { checkUpdateMock } = vi.hoisted(() => ({
  checkUpdateMock: vi.fn(),
}));

vi.mock("$lib/ipc/updater", () => ({
  checkUpdate: checkUpdateMock,
  installUpdate: vi.fn(),
}));

describe("updater store", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
    checkUpdateMock.mockReset().mockResolvedValue(null);
  });

  afterEach(async () => {
    const { updater } = await import("./updater.svelte");
    updater.stop();
    vi.useRealTimers();
  });

  it("start는 즉시 확인하고 하루마다 다시 확인한다", async () => {
    const { AUTO_UPDATE_CHECK_INTERVAL_MS, updater } = await import("./updater.svelte");

    updater.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(checkUpdateMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(AUTO_UPDATE_CHECK_INTERVAL_MS);
    expect(checkUpdateMock).toHaveBeenCalledTimes(2);
  });

  it("start를 반복 호출해도 확인 타이머를 중복 등록하지 않는다", async () => {
    const { AUTO_UPDATE_CHECK_INTERVAL_MS, updater } = await import("./updater.svelte");

    updater.start();
    updater.start();
    await vi.advanceTimersByTimeAsync(AUTO_UPDATE_CHECK_INTERVAL_MS);

    expect(checkUpdateMock).toHaveBeenCalledTimes(2);
  });

  it("stop은 주기적인 확인을 중단한다", async () => {
    const { AUTO_UPDATE_CHECK_INTERVAL_MS, updater } = await import("./updater.svelte");

    updater.start();
    await vi.advanceTimersByTimeAsync(0);
    updater.stop();
    await vi.advanceTimersByTimeAsync(AUTO_UPDATE_CHECK_INTERVAL_MS);

    expect(checkUpdateMock).toHaveBeenCalledTimes(1);
  });

  it("이전 확인이 진행 중이면 다음 자동 확인을 중복 실행하지 않는다", async () => {
    let resolveCheck: (value: null) => void = () => undefined;
    checkUpdateMock.mockReturnValue(new Promise<null>((resolve) => (resolveCheck = resolve)));
    const { AUTO_UPDATE_CHECK_INTERVAL_MS, updater } = await import("./updater.svelte");

    updater.start();
    await vi.advanceTimersByTimeAsync(AUTO_UPDATE_CHECK_INTERVAL_MS);
    expect(checkUpdateMock).toHaveBeenCalledTimes(1);

    resolveCheck(null);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(AUTO_UPDATE_CHECK_INTERVAL_MS);
    expect(checkUpdateMock).toHaveBeenCalledTimes(2);
  });
});
