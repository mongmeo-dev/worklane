import type { Task, TaskStatus } from "$lib/ipc/tasks";
import * as ipc from "$lib/ipc/tasks";

/** 크로스 프로젝트 태스크 보드 store. */
class TaskStore {
  #tasks = $state<Task[]>([]);

  get tasks(): Task[] {
    return this.#tasks;
  }

  async load(): Promise<void> {
    this.#tasks = await ipc.listTasks();
  }

  async add(projectId: string | null, title: string, notes: string): Promise<Task> {
    const task = await ipc.createTask(projectId, title, notes);
    this.#tasks = [...this.#tasks, task];
    return task;
  }

  async edit(id: string, title: string, notes: string): Promise<void> {
    await ipc.updateTask(id, title, notes);
    this.#tasks = this.#tasks.map((t) => (t.id === id ? { ...t, title, notes } : t));
  }

  async setStatus(id: string, status: TaskStatus): Promise<void> {
    await ipc.setTaskStatus(id, status);
    this.#tasks = this.#tasks.map((t) => (t.id === id ? { ...t, status } : t));
  }

  async remove(id: string): Promise<void> {
    await ipc.deleteTask(id);
    this.#tasks = this.#tasks.filter((t) => t.id !== id);
  }
}

export const taskStore = new TaskStore();
