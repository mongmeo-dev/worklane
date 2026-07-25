import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("$lib/ipc/projects", () => ({
  listProjects: vi.fn(),
  createProject: vi.fn(),
  createDefaultAgent: vi.fn(),
  deleteProject: vi.fn(),
  createAgent: vi.fn(),
  deleteAgent: vi.fn(),
  patchAgentTitle: vi.fn(),
  agentWorktreeHasChanges: vi.fn(),
  createAgentTerminal: vi.fn(),
  deleteAgentTerminal: vi.fn(),
}));

vi.mock("$lib/terminal/session-runtime", () => ({
  cleanupSessionRuntime: vi.fn(),
}));

vi.mock("$lib/stores/actionErrors.svelte", () => ({
  actionErrors: { report: vi.fn() },
}));

import * as ipc from "$lib/ipc/projects";
import * as runtime from "$lib/terminal/session-runtime";
import { actionErrors } from "$lib/stores/actionErrors.svelte";
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
    (ipc.deleteAgent as any).mockResolvedValue(["t1"]);
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
  it("patchAgentTitle()는 terminal을 보존한 narrow patch만 적용한다", async () => {
    (ipc.listProjects as any).mockResolvedValue([{
      ...sampleProject,
      agents: [{
        ...sampleProject.agents[0],
        terminals: [
          sampleProject.agents[0].terminals[0],
          { id: "t2", agentId: "a1", title: "shell", kind: "terminal", command: "", position: 1, createdAt: 2 },
        ],
      }],
    }]);
    (ipc.patchAgentTitle as any).mockResolvedValue({ id: "a1", title: "renamed", updatedAt: 2 });
    const store = createProjectStore();
    await store.load();

    await store.patchAgentTitle("a1", "renamed");

    expect(store.projects[0].agents[0]).toMatchObject({ title: "renamed", updatedAt: 2 });
    expect(store.projects[0].agents[0].terminals?.map((terminal) => terminal.id)).toEqual(["t1", "t2"]);
  });

  it("patchAgentTitle()의 out-of-order 응답에서는 마지막 요청만 적용한다", async () => {
    let resolveFirst!: (patch: { id: string; title: string; updatedAt: number }) => void;
    let resolveSecond!: (patch: { id: string; title: string; updatedAt: number }) => void;
    (ipc.listProjects as any).mockResolvedValue([sampleProject]);
    (ipc.patchAgentTitle as any)
      .mockImplementationOnce(() => new Promise<{ id: string; title: string; updatedAt: number }>((resolve) => { resolveFirst = resolve; }))
      .mockImplementationOnce(() => new Promise<{ id: string; title: string; updatedAt: number }>((resolve) => { resolveSecond = resolve; }));
    const store = createProjectStore();
    await store.load();

    const first = store.patchAgentTitle("a1", "first");
    const second = store.patchAgentTitle("a1", "second");
    resolveSecond({ id: "a1", title: "second", updatedAt: 3 });
    await second;
    resolveFirst({ id: "a1", title: "first", updatedAt: 2 });
    await first;

    expect(store.projects[0].agents[0]).toMatchObject({ title: "second", updatedAt: 3 });
  });
  it("patchAgentTitle() does not let an A/B/C token reuse overwrite the active request", async () => {
    let resolveFirst!: (patch: { id: string; title: string; updatedAt: number }) => void;
    let resolveThird!: (patch: { id: string; title: string; updatedAt: number }) => void;
    (ipc.listProjects as any).mockResolvedValue([sampleProject]);
    (ipc.patchAgentTitle as any)
      .mockImplementationOnce(() => new Promise<{ id: string; title: string; updatedAt: number }>((resolve) => { resolveFirst = resolve; }))
      .mockResolvedValueOnce({ id: "a1", title: "second", updatedAt: 3 })
      .mockImplementationOnce(() => new Promise<{ id: string; title: string; updatedAt: number }>((resolve) => { resolveThird = resolve; }));
    const store = createProjectStore();
    await store.load();

    const first = store.patchAgentTitle("a1", "first");
    await store.patchAgentTitle("a1", "second");
    const third = store.patchAgentTitle("a1", "third");
    resolveFirst({ id: "a1", title: "first", updatedAt: 2 });
    await first;

    expect(store.projects[0].agents[0]).toMatchObject({ title: "second", updatedAt: 3 });
    resolveThird({ id: "a1", title: "third", updatedAt: 4 });
    await third;
    expect(store.projects[0].agents[0]).toMatchObject({ title: "third", updatedAt: 4 });
  });

  it("patchAgentTitle()는 진행 중 terminal 추가를 덮어쓰지 않는다", async () => {
    let resolveRename!: (patch: { id: string; title: string; updatedAt: number }) => void;
    const terminal = { id: "t2", agentId: "a1", title: "", kind: "terminal", command: "", position: 1, createdAt: 2 };
    (ipc.listProjects as any).mockResolvedValue([sampleProject]);
    (ipc.patchAgentTitle as any).mockImplementation(() => new Promise<{ id: string; title: string; updatedAt: number }>((resolve) => { resolveRename = resolve; }));
    (ipc.createAgentTerminal as any).mockResolvedValue(terminal);
    const store = createProjectStore();
    await store.load();

    const rename = store.patchAgentTitle("a1", "renamed");
    await store.addTerminal("a1", "terminal", "", "");
    resolveRename({ id: "a1", title: "renamed", updatedAt: 2 });
    await rename;

    expect(store.projects[0].agents[0].terminals?.map((item) => item.id)).toEqual(["t1", "t2"]);
  });
  it("최신 rename 실패는 authoritative snapshot으로 reconcile하고 이전 성공을 무시한다", async () => {
    let resolveFirst!: (patch: { id: string; title: string; updatedAt: number }) => void;
    (ipc.listProjects as any)
      .mockResolvedValueOnce([sampleProject])
      .mockResolvedValueOnce([{ ...sampleProject, agents: [{ ...sampleProject.agents[0], title: "first", updatedAt: 2 }] }]);
    (ipc.patchAgentTitle as any)
      .mockImplementationOnce(() => new Promise<{ id: string; title: string; updatedAt: number }>((resolve) => { resolveFirst = resolve; }))
      .mockRejectedValueOnce(new Error("latest failed"));
    const store = createProjectStore();
    await store.load();

    const first = store.patchAgentTitle("a1", "first");
    await expect(store.patchAgentTitle("a1", "second")).rejects.toThrow("latest failed");
    resolveFirst({ id: "a1", title: "first", updatedAt: 2 });
    await first;

    expect(store.projects[0].agents[0]).toMatchObject({ title: "first", updatedAt: 2 });
    expect(store.projects[0].agents[0].terminals?.map((terminal) => terminal.id)).toEqual(["t1"]);
  });
  it("patchAgentTitle()는 reconciliation 실패를 보고하고 원래 rename 오류를 유지한다", async () => {
    const renameError = new Error("rename failed");
    const reconciliationError = new Error("reconciliation failed");
    (ipc.listProjects as any)
      .mockResolvedValueOnce([sampleProject])
      .mockRejectedValueOnce(reconciliationError);
    (ipc.patchAgentTitle as any).mockRejectedValue(renameError);
    const store = createProjectStore();
    await store.load();

    await expect(store.patchAgentTitle("a1", "renamed")).rejects.toBe(renameError);

    expect(ipc.listProjects).toHaveBeenCalledTimes(2);
    expect(actionErrors.report).toHaveBeenCalledWith(reconciliationError);
  });

  it("load()의 stale snapshot은 완료된 delete를 되살리지 않는다", async () => {
    let resolveLoad!: (projects: typeof sampleProject[]) => void;
    (ipc.listProjects as any)
      .mockResolvedValueOnce([sampleProject])
      .mockImplementationOnce(() => new Promise<typeof sampleProject[]>((resolve) => { resolveLoad = resolve; }));
    (ipc.deleteProject as any).mockResolvedValue(["t1"]);
    const store = createProjectStore();
    await store.load();

    const load = store.load();
    await store.removeProject("p1");
    resolveLoad([sampleProject]);
    await load;

    expect(store.projects).toEqual([]);
  });

  it("delete 중 완료된 terminal 추가는 owner를 되살리지 않고 runtime을 정리한다", async () => {
    let resolveDelete!: (ids: string[]) => void;
    const terminal = { id: "t2", agentId: "a1", title: "", kind: "terminal" as const, command: "", position: 1, createdAt: 2 };
    (ipc.listProjects as any).mockResolvedValue([sampleProject]);
    (ipc.deleteAgent as any).mockImplementation(() => new Promise<string[]>((resolve) => { resolveDelete = resolve; }));
    (ipc.createAgentTerminal as any).mockResolvedValue(terminal);
    const store = createProjectStore();
    await store.load();

    const deletion = store.removeAgent("a1", true, false);
    await store.addTerminal("a1", "terminal", "", "");
    resolveDelete(["t1", "t2"]);
    await deletion;

    expect(store.projects[0].agents).toEqual([]);
    expect(runtime.cleanupSessionRuntime).toHaveBeenCalledWith("t2");
  });
  it("keeps the deletion guard until overlapping deletion operations settle", async () => {
    let resolveProjectDelete!: (ids: string[]) => void;
    let rejectAgentDelete!: (reason: Error) => void;
    let resolveTerminal!: (terminal: { id: string; agentId: string; title: string; kind: "terminal"; command: string; position: number; createdAt: number }) => void;
    const terminal = { id: "t2", agentId: "a1", title: "", kind: "terminal" as const, command: "", position: 1, createdAt: 2 };
    (ipc.listProjects as any).mockResolvedValue([sampleProject]);
    (ipc.deleteProject as any).mockImplementation(() => new Promise<string[]>((resolve) => { resolveProjectDelete = resolve; }));
    (ipc.deleteAgent as any).mockImplementation(() => new Promise<string[]>((_resolve, reject) => { rejectAgentDelete = reject; }));
    (ipc.createAgentTerminal as any).mockImplementation(() => new Promise<typeof terminal>((resolve) => { resolveTerminal = resolve; }));
    const store = createProjectStore();
    await store.load();

    const projectDeletion = store.removeProject("p1");
    const agentDeletion = store.removeAgent("a1", true, false);
    const addition = store.addTerminal("a1", "terminal", "", "");
    rejectAgentDelete(new Error("agent delete failed"));
    await expect(agentDeletion).rejects.toThrow("agent delete failed");

    resolveTerminal(terminal);
    await addition;
    expect(runtime.cleanupSessionRuntime).toHaveBeenCalledWith("t2");
    expect(store.projects[0].agents[0].terminals?.map((item) => item.id)).toEqual(["t1"]);

    resolveProjectDelete(["t1", "t2"]);
    await projectDeletion;
  });
  it("삭제 응답의 stale terminal ID도 local snapshot과 함께 정리한다", async () => {
    (ipc.listProjects as any).mockResolvedValue([sampleProject]);
    (ipc.deleteProject as any).mockResolvedValue(["t1", "stale-terminal"]);
    const store = createProjectStore();
    await store.load();

    await store.removeProject("p1");

    expect(runtime.cleanupSessionRuntime).toHaveBeenCalledWith("t1");
    expect(runtime.cleanupSessionRuntime).toHaveBeenCalledWith("stale-terminal");
  });

  it("성공한 project, agent, terminal 삭제는 각 terminal runtime을 정리한다", async () => {
    (ipc.listProjects as any).mockResolvedValue([
      {
        ...sampleProject,
        agents: [{
          ...sampleProject.agents[0],
          terminals: [
            sampleProject.agents[0].terminals[0],
            { id: "t2", agentId: "a1", title: "", kind: "terminal", command: "", position: 1, createdAt: 2 },
          ],
        }],
      },
    ]);
    (ipc.deleteProject as any).mockResolvedValue(["t1", "t2"]);
    (ipc.deleteAgent as any).mockResolvedValue(["t1", "t2"]);
    (ipc.deleteAgentTerminal as any).mockResolvedValue(undefined);

    const projectStore = createProjectStore();
    await projectStore.load();
    await projectStore.removeProject("p1");

    const agentStore = createProjectStore();
    await agentStore.load();
    await agentStore.removeAgent("a1", true, false);

    const terminalStore = createProjectStore();
    await terminalStore.load();
    await terminalStore.removeTerminal("a1", "t1");

    expect(runtime.cleanupSessionRuntime).toHaveBeenCalledTimes(5);
    expect(runtime.cleanupSessionRuntime).toHaveBeenNthCalledWith(1, "t1");
    expect(runtime.cleanupSessionRuntime).toHaveBeenNthCalledWith(2, "t2");
    expect(runtime.cleanupSessionRuntime).toHaveBeenNthCalledWith(3, "t1");
    expect(runtime.cleanupSessionRuntime).toHaveBeenNthCalledWith(4, "t2");
    expect(runtime.cleanupSessionRuntime).toHaveBeenNthCalledWith(5, "t1");
  });

  it("실패한 project, agent, terminal 삭제는 runtime을 정리하지 않는다", async () => {
    (ipc.listProjects as any).mockResolvedValue([sampleProject]);
    (ipc.deleteProject as any).mockRejectedValue(new Error("failed"));
    (ipc.deleteAgent as any).mockRejectedValue(new Error("failed"));
    (ipc.deleteAgentTerminal as any).mockRejectedValue(new Error("failed"));
    const store = createProjectStore();
    await store.load();

    await expect(store.removeProject("p1")).rejects.toThrow("failed");
    await expect(store.removeAgent("a1", true, false)).rejects.toThrow("failed");
    await expect(store.removeTerminal("a1", "t1")).rejects.toThrow("failed");

    expect(runtime.cleanupSessionRuntime).not.toHaveBeenCalled();
  });

});
