import { invoke } from "@tauri-apps/api/core";

export interface Prompt {
  id: string;
  title: string;
  body: string;
  createdAt: number;
  updatedAt: number;
}

export function listPrompts(): Promise<Prompt[]> {
  return invoke<Prompt[]>("list_prompts");
}

export function createPrompt(title: string, body: string): Promise<Prompt> {
  return invoke<Prompt>("create_prompt", { title, body });
}

export function updatePrompt(id: string, title: string, body: string): Promise<void> {
  return invoke("update_prompt", { id, title, body });
}

export function deletePrompt(id: string): Promise<void> {
  return invoke("delete_prompt", { id });
}
