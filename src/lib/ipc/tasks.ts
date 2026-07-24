import { invoke } from "@tauri-apps/api/core";

export type TaskStatus = "todo" | "doing" | "done";

export interface Task {
  id: string;
  projectId: string | null;
  title: string;
  notes: string;
  status: TaskStatus;
  createdAt: number;
  updatedAt: number;
}

export function listTasks(): Promise<Task[]> {
  return invoke<Task[]>("list_tasks");
}

export function createTask(
  projectId: string | null,
  title: string,
  notes: string,
): Promise<Task> {
  return invoke<Task>("create_task", { projectId, title, notes });
}

export function updateTask(id: string, title: string, notes: string): Promise<void> {
  return invoke("update_task", { id, title, notes });
}

export function setTaskStatus(id: string, status: TaskStatus): Promise<void> {
  return invoke("set_task_status", { id, status });
}

export function deleteTask(id: string): Promise<void> {
  return invoke("delete_task", { id });
}
