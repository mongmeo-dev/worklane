import { beforeEach, describe, expect, it, vi } from "vitest";

const STORAGE_KEY = "preview:urls";

describe("previewStore", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });
  it("rejects the parent app origin while preserving other http and https preview URLs", async () => {
    const { parsePreviewUrl } = await import("./preview.svelte");

    expect(parsePreviewUrl(`${window.location.origin}/nested/preview`)).toBeNull();
    expect(parsePreviewUrl("http://preview.test/nested/route")).toBe("http://preview.test/nested/route");
    expect(parsePreviewUrl("https://preview.test/nested/route")).toBe("https://preview.test/nested/route");
    expect(parsePreviewUrl("tauri://localhost")).toBeNull();
  });

  it("keeps draft edits separate from persisted URL until persist", async () => {
    const { previewStore } = await import("./preview.svelte");
    previewStore.persist("agent-a", "http://saved.test");
    previewStore.setDraft("agent-a", "http://typing.test");

    expect(previewStore.snapshot("agent-a")).toMatchObject({
      draftUrl: "http://typing.test",
      persistedUrl: "http://saved.test",
      reloadRevision: 0,
    });
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual({ "agent-a": "http://saved.test" });
  });

  it("reloads the current draft rather than overwriting it with an older snapshot", async () => {
    const { previewStore } = await import("./preview.svelte");
    previewStore.setDraft("agent-a", " http://draft.test ");
    previewStore.persist("agent-a");
    const opened = previewStore.snapshot("agent-a");
    previewStore.setDraft("agent-a", "http://newer-draft.test");

    previewStore.reload(opened);

    expect(previewStore.snapshot("agent-a")).toMatchObject({
      draftUrl: "http://newer-draft.test",
      persistedUrl: "http://newer-draft.test",
      reloadRevision: 1,
    });
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual({ "agent-a": "http://newer-draft.test" });
  });

  it("returns an open-time snapshot that is not changed by later draft edits", async () => {
    const { previewStore } = await import("./preview.svelte");
    previewStore.setDraft("agent-a", "http://when-opened.test");
    const opened = previewStore.snapshot("agent-a");
    previewStore.setDraft("agent-a", "http://after-open.test");

    expect(opened).toEqual({
      agentId: "agent-a",
      draftUrl: "http://when-opened.test",
      persistedUrl: "",
      reloadRevision: 0,
    });
  });

  it("isolates drafts, persisted URLs, and reload revisions by agent", async () => {
    const { previewStore } = await import("./preview.svelte");
    previewStore.persist("agent-a", "http://a.test");
    previewStore.setDraft("agent-b", "http://b-draft.test");
    previewStore.reload(previewStore.snapshot("agent-b"));

    expect(previewStore.snapshot("agent-a")).toMatchObject({
      draftUrl: "http://a.test",
      persistedUrl: "http://a.test",
      reloadRevision: 0,
    });
    expect(previewStore.snapshot("agent-b")).toMatchObject({
      draftUrl: "http://b-draft.test",
      persistedUrl: "http://b-draft.test",
      reloadRevision: 1,
    });
  });
});
