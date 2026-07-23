import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("$lib/ipc/projects", () => ({
  listProjects: vi.fn(),
  createProject: vi.fn(),
  deleteProject: vi.fn(),
  createAgent: vi.fn(),
  deleteAgent: vi.fn(),
  agentWorktreeHasChanges: vi.fn(),
}));

import * as ipc from "$lib/ipc/projects";
import { createProjectStore } from "./projects.svelte";

const sampleProject = {
  id: "p1", name: "proj", path: "/tmp/p", createdAt: 1, updatedAt: 1,
  agents: [{ id: "a1", projectId: "p1", title: "t", kind: "codex" as const,
    command: "codex", branch: "b", worktreePath: "/tmp/w", worktreeManaged: false }],
};

describe("projectStore", () => {
  beforeEach(() => vi.clearAllMocks());

  it("load()가 IPC 결과로 projects를 채운다", async () => {
    (ipc.listProjects as any).mockResolvedValue([sampleProject]);
    const store = createProjectStore();
    await store.load();
    expect(store.projects).toHaveLength(1);
    expect(store.projects[0].agents[0].command).toBe("codex");
  });

  it("addProject()가 기본 작업환경 설정을 전달하고 생성 결과를 반환한다", async () => {
    (ipc.listProjects as any).mockResolvedValue([]);
    (ipc.createProject as any).mockResolvedValue(sampleProject);
    const store = createProjectStore();
    await store.load();

    const created = await store.addProject("proj", "/tmp/p", "codex", "codex");

    expect(ipc.createProject).toHaveBeenCalledWith("proj", "/tmp/p", "codex", "codex");
    expect(created).toEqual(sampleProject);
    expect(store.projects[0].agents).toHaveLength(1);
    expect(store.projects[0].agents[0].worktreeManaged).toBe(false);
  });

  it("removeAgent()가 해당 에이전트를 목록에서 제거한다", async () => {
    (ipc.listProjects as any).mockResolvedValue([sampleProject]);
    (ipc.deleteAgent as any).mockResolvedValue(undefined);
    const store = createProjectStore();
    await store.load();
    await store.removeAgent("a1", true, false);
    expect(store.projects[0].agents).toHaveLength(0);
    expect(ipc.deleteAgent).toHaveBeenCalledWith("a1", true, false);
  });
});
