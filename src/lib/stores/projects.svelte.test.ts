import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("$lib/ipc/projects", () => ({
  listProjects: vi.fn(),
  createProject: vi.fn(),
  createDefaultAgent: vi.fn(),
  deleteProject: vi.fn(),
  createAgent: vi.fn(),
  deleteAgent: vi.fn(),
  agentWorktreeHasChanges: vi.fn(),
  createAgentTerminal: vi.fn(),
  deleteAgentTerminal: vi.fn(),
}));

import * as ipc from "$lib/ipc/projects";
import { createProjectStore } from "./projects.svelte";

const sampleProject = {
  id: "p1", name: "proj", path: "/tmp/p", createdAt: 1, updatedAt: 1,
  agents: [{ id: "a1", projectId: "p1", title: "t", kind: "codex" as const,
    command: "codex", branch: "b", worktreePath: "/tmp/w", worktreeManaged: false,
    terminals: [{ id: "t1", agentId: "a1", title: "", kind: "codex", command: "codex", position: 0, createdAt: 1 }] }],
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
  it("addDefaultWorkspace()가 기본 작업환경을 만들어 프로젝트에 붙인다", async () => {
    const defaultAgent = {
      id: "d1", projectId: "p1", title: "feature/root", kind: "codex" as const,
      command: "codex", branch: "feature/root", worktreePath: "/tmp/p", worktreeManaged: false,
    };
    (ipc.listProjects as any).mockResolvedValue([{ ...sampleProject, agents: [] }]);
    (ipc.createDefaultAgent as any).mockResolvedValue(defaultAgent);
    const store = createProjectStore();
    await store.load();

    const created = await store.addDefaultWorkspace("p1", "codex", "codex");

    expect(ipc.createDefaultAgent).toHaveBeenCalledWith("p1", "codex", "codex");
    expect(created).toEqual(defaultAgent);
    expect(store.projects[0].agents).toHaveLength(1);
    expect(store.projects[0].agents[0].title).toBe("feature/root");
  });

  it("addTerminal()가 IPC로 만든 터미널을 워크스페이스에 붙인다", async () => {
    const term = { id: "t2", agentId: "a1", title: "", kind: "terminal", command: "", position: 1, createdAt: 2 };
    (ipc.listProjects as any).mockResolvedValue([sampleProject]);
    (ipc.createAgentTerminal as any).mockResolvedValue(term);
    const store = createProjectStore();
    await store.load();

    const created = await store.addTerminal("a1", "terminal", "", "");

    expect(ipc.createAgentTerminal).toHaveBeenCalledWith("a1", "terminal", "", "");
    expect(created).toEqual(term);
    expect(store.projects[0].agents[0].terminals?.map((t) => t.id)).toEqual(["t1", "t2"]);
  });

  it("removeTerminal()가 해당 터미널만 목록에서 제거한다", async () => {
    (ipc.listProjects as any).mockResolvedValue([sampleProject]);
    (ipc.deleteAgentTerminal as any).mockResolvedValue(undefined);
    const store = createProjectStore();
    await store.load();

    await store.removeTerminal("a1", "t1");

    expect(ipc.deleteAgentTerminal).toHaveBeenCalledWith("t1");
    expect(store.projects[0].agents[0].terminals).toHaveLength(0);
  });

});
