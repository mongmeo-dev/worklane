import type { Agent, AgentKind, AgentTerminal, Project } from "$lib/types";
import * as ipc from "$lib/ipc/projects";
import type { CreateAgentOptions } from "$lib/ipc/projects";
import { sessionStatus } from "$lib/stores/sessions.svelte";
import { aggregateStatus } from "$lib/shell/derived";
import { cleanupSessionRuntime } from "$lib/terminal/session-runtime";
import { actionErrors } from "$lib/stores/actionErrors.svelte";

export function createProjectStore() {
  let projects = $state<Project[]>([]);
  let mutationEpoch = 0;
  let loadGeneration = 0;
  const deletingAgentIds = new Map<string, number>();
  const titleRequestGenerations = new Map<string, symbol>();

  const commitMutation = (next: Project[]) => {
    mutationEpoch += 1;
    projects = next;
  };
  const cleanupTerminals = (ids: Iterable<string>) => {
    for (const id of new Set(ids)) cleanupSessionRuntime(id);
  };
  const beginAgentDeletion = (id: string) => {
    deletingAgentIds.set(id, (deletingAgentIds.get(id) ?? 0) + 1);
  };
  const endAgentDeletion = (id: string) => {
    const remaining = (deletingAgentIds.get(id) ?? 1) - 1;
    if (remaining > 0) deletingAgentIds.set(id, remaining);
    else deletingAgentIds.delete(id);
  };
  const reconcileProjects = (snapshot: Project[]): Project[] =>
    snapshot.map((project) => ({
      ...project,
      agents: project.agents.map((agent) => {
        const local = projects.flatMap((item) => item.agents).find((item) => item.id === agent.id);
        return local ? { ...agent, terminals: local.terminals } : agent;
      }),
    }));

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
      const generation = ++loadGeneration;
      const epoch = mutationEpoch;
      const snapshot = await ipc.listProjects();
      if (loadGeneration === generation && mutationEpoch === epoch) projects = snapshot;
    },
    async addProject(
      name: string,
      path: string,
      kind: AgentKind,
      command: string,
    ): Promise<Project> {
      const project = await ipc.createProject(name, path, kind, command);
      commitMutation([...projects, project]);
      return project;
    },
    async removeProject(id: string): Promise<void> {
      const project = projects.find((item) => item.id === id);
      const agentIds = project?.agents.map((agent) => agent.id) ?? [];
      const terminalIds = project?.agents.flatMap((agent) => agent.terminals ?? []).map((terminal) => terminal.id) ?? [];
      agentIds.forEach(beginAgentDeletion);
      try {
        const deletedTerminalIds = await ipc.deleteProject(id);
        cleanupTerminals([...terminalIds, ...deletedTerminalIds]);
        commitMutation(projects.filter((project) => project.id !== id));
      } finally {
        agentIds.forEach(endAgentDeletion);
      }
    },
    async addAgent(opts: CreateAgentOptions): Promise<Agent> {
      const agent = await ipc.createAgent(opts);
      commitMutation(projects.map((p) =>
        p.id === opts.projectId ? { ...p, agents: [...p.agents, agent] } : p,
      ));
      return agent;
    },
    async addDefaultWorkspace(
      projectId: string,
      kind: AgentKind,
      command: string,
    ): Promise<Agent> {
      const agent = await ipc.createDefaultAgent(projectId, kind, command);
      commitMutation(projects.map((p) =>
        p.id === projectId ? { ...p, agents: [...p.agents, agent] } : p,
      ));
      return agent;
    },
    async patchAgentTitle(id: string, title: string): Promise<void> {
      const requestToken = Symbol(id);
      titleRequestGenerations.set(id, requestToken);
      try {
        const patch = await ipc.patchAgentTitle(id, title);
        if (titleRequestGenerations.get(id) !== requestToken) return;
        commitMutation(projects.map((project) => ({
          ...project,
          agents: project.agents.map((agent) =>
            agent.id === patch.id
              ? { ...agent, title: patch.title, updatedAt: patch.updatedAt }
              : agent,
          ),
        })));
      } catch (error) {
        if (titleRequestGenerations.get(id) !== requestToken) throw error;
        const epoch = mutationEpoch;
        try {
          const snapshot = await ipc.listProjects();
          if (titleRequestGenerations.get(id) === requestToken && mutationEpoch === epoch) {
            commitMutation(reconcileProjects(snapshot));
          }
        } catch (reconciliationError) {
          actionErrors.report(reconciliationError);
        }
        throw error;
      } finally {
        if (titleRequestGenerations.get(id) === requestToken) titleRequestGenerations.delete(id);
      }
    },
    async removeAgent(id: string, removeWorktree: boolean, force: boolean): Promise<void> {
      const agent = projects.flatMap((p) => p.agents).find((item) => item.id === id);
      const terminalIds = agent?.terminals?.map((terminal) => terminal.id) ?? [];
      beginAgentDeletion(id);
      try {
        const deletedTerminalIds = await ipc.deleteAgent(id, removeWorktree, force);
        cleanupTerminals([...terminalIds, ...deletedTerminalIds]);
        commitMutation(projects.map((p) => ({
          ...p,
          agents: p.agents.filter((agent) => agent.id !== id),
        })));
      } finally {
        endAgentDeletion(id);
      }
    },
    /** 워크스페이스에 새 터미널 탭을 추가한다. */
    async addTerminal(
      agentId: string,
      kind: AgentKind,
      command: string,
      title: string,
    ): Promise<AgentTerminal> {
      const terminal = await ipc.createAgentTerminal(agentId, kind, command, title);
      const ownerExists = projects.some((project) => project.agents.some((agent) => agent.id === agentId));
      if (!ownerExists) {
        cleanupSessionRuntime(terminal.id);
        return terminal;
      }
      commitMutation(projects.map((p) => ({
        ...p,
        agents: p.agents.map((agent) =>
          agent.id === agentId ? { ...agent, terminals: [...(agent.terminals ?? []), terminal] } : agent,
        ),
      })));
      return terminal;
    },
    /** 워크스페이스의 터미널 탭을 삭제하고 그 PTY 세션을 정리한다. */
    async removeTerminal(_agentId: string, terminalId: string): Promise<void> {
      const ownerId = projects
        .flatMap((project) => project.agents)
        .find((agent) => agent.terminals?.some((terminal) => terminal.id === terminalId))
        ?.id;
      await ipc.deleteAgentTerminal(terminalId);
      cleanupSessionRuntime(terminalId);
      if (!ownerId) return;
      commitMutation(projects.map((project) => ({
        ...project,
        agents: project.agents.map((agent) =>
          agent.id === ownerId
            ? { ...agent, terminals: (agent.terminals ?? []).filter((terminal) => terminal.id !== terminalId) }
            : agent,
        ),
      })));
    },
  };
}

export const projectStore = createProjectStore();
