import type { Agent, AgentKind, AgentTerminal, Project } from "$lib/types";
import * as ipc from "$lib/ipc/projects";
import type { CreateAgentOptions } from "$lib/ipc/projects";
import { sessionStatus } from "$lib/stores/sessions.svelte";
import { aggregateStatus } from "$lib/shell/derived";
import { releaseSession } from "$lib/terminal/session-lifecycle";

export function createProjectStore() {
  let projects = $state<Project[]>([]);

  // sessionStatus(런타임)를 병합해 표시용 status를 채운 목록.
  // 워크스페이스 상태는 소속 터미널들의 상태를 하나로 합쳐 표시한다(주 터미널 개념 없음).
  const withStatus = (): Project[] =>
    projects.map((p) => ({
      ...p,
      agents: p.agents.map((a) => ({
        ...a,
        status: aggregateStatus((a.terminals ?? []).map((t) => sessionStatus.get(t.id))),
      })),
    }));

  return {
    get projects(): Project[] {
      return withStatus();
    },
    async load(): Promise<void> {
      projects = await ipc.listProjects();
    },
    async addProject(
      name: string,
      path: string,
      kind: AgentKind,
      command: string,
    ): Promise<Project> {
      const project = await ipc.createProject(name, path, kind, command);
      projects = [...projects, project];
      return project;
    },
    async removeProject(id: string): Promise<void> {
      await ipc.deleteProject(id);
      projects = projects.filter((p) => p.id !== id);
    },
    async addAgent(opts: CreateAgentOptions): Promise<Agent> {
      const agent = await ipc.createAgent(opts);
      projects = projects.map((p) =>
        p.id === opts.projectId ? { ...p, agents: [...p.agents, agent] } : p,
      );
      return agent;
    },
    async addDefaultWorkspace(
      projectId: string,
      kind: AgentKind,
      command: string,
    ): Promise<Agent> {
      const agent = await ipc.createDefaultAgent(projectId, kind, command);
      projects = projects.map((p) =>
        p.id === projectId ? { ...p, agents: [...p.agents, agent] } : p,
      );
      return agent;
    },
    async removeAgent(id: string, removeWorktree: boolean, force: boolean): Promise<void> {
      await ipc.deleteAgent(id, removeWorktree, force);
      // 워크스페이스에 속한 모든 터미널의 PTY 세션과 xterm 인스턴스를 정리한다.
      const agent = projects.flatMap((p) => p.agents).find((a) => a.id === id);
      for (const terminal of agent?.terminals ?? []) releaseSession(terminal.id);
      projects = projects.map((p) => ({
        ...p,
        agents: p.agents.filter((a) => a.id !== id),
      }));
    },
    /** 워크스페이스에 새 터미널 탭을 추가한다. */
    async addTerminal(
      agentId: string,
      kind: AgentKind,
      command: string,
      title: string,
    ): Promise<AgentTerminal> {
      const terminal = await ipc.createAgentTerminal(agentId, kind, command, title);
      projects = projects.map((p) => ({
        ...p,
        agents: p.agents.map((a) =>
          a.id === agentId ? { ...a, terminals: [...(a.terminals ?? []), terminal] } : a,
        ),
      }));
      return terminal;
    },
    /** 워크스페이스의 터미널 탭을 삭제하고 그 PTY 세션을 정리한다. */
    async removeTerminal(agentId: string, terminalId: string): Promise<void> {
      await ipc.deleteAgentTerminal(terminalId);
      releaseSession(terminalId);
      projects = projects.map((p) => ({
        ...p,
        agents: p.agents.map((a) =>
          a.id === agentId
            ? { ...a, terminals: (a.terminals ?? []).filter((t) => t.id !== terminalId) }
            : a,
        ),
      }));
    },
  };
}

export const projectStore = createProjectStore();
