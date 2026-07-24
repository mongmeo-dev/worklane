import type { Agent, AgentKind, Project } from "$lib/types";
import * as ipc from "$lib/ipc/projects";
import type { CreateAgentOptions } from "$lib/ipc/projects";
import { sessionStatus } from "$lib/stores/sessions.svelte";

export function createProjectStore() {
  let projects = $state<Project[]>([]);

  // sessionStatus(런타임)를 병합해 표시용 status를 채운 목록.
  const withStatus = (): Project[] =>
    projects.map((p) => ({
      ...p,
      agents: p.agents.map((a) => ({
        ...a,
        status: sessionStatus.get(a.id) ?? a.status ?? "idle",
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
      projects = projects.map((p) => ({
        ...p,
        agents: p.agents.filter((a) => a.id !== id),
      }));
    },
  };
}

export const projectStore = createProjectStore();
