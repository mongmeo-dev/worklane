import type { Prompt } from "$lib/ipc/prompts";
import * as ipc from "$lib/ipc/prompts";

/** 재사용 프롬프트/플레이북 라이브러리. 프로젝트 경계를 넘어 공유된다. */
class PromptStore {
  #prompts = $state<Prompt[]>([]);

  get prompts(): Prompt[] {
    return this.#prompts;
  }

  async load(): Promise<void> {
    this.#prompts = await ipc.listPrompts();
  }

  async add(title: string, body: string): Promise<Prompt> {
    const prompt = await ipc.createPrompt(title, body);
    this.#prompts = [prompt, ...this.#prompts];
    return prompt;
  }

  async update(id: string, title: string, body: string): Promise<void> {
    await ipc.updatePrompt(id, title, body);
    const now = Date.now();
    this.#prompts = this.#prompts
      .map((p) => (p.id === id ? { ...p, title, body, updatedAt: now } : p))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async remove(id: string): Promise<void> {
    await ipc.deletePrompt(id);
    this.#prompts = this.#prompts.filter((p) => p.id !== id);
  }
}

export const promptStore = new PromptStore();
