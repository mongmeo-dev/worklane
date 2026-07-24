import type { Playbook, PlaybookMember } from "$lib/ipc/playbooks";
import * as ipc from "$lib/ipc/playbooks";

/** 팬아웃 플레이북(재사용 레시피) store. */
class PlaybookStore {
  #playbooks = $state<Playbook[]>([]);

  get playbooks(): Playbook[] {
    return this.#playbooks;
  }

  async load(): Promise<void> {
    this.#playbooks = await ipc.listPlaybooks();
  }

  async add(
    name: string,
    prompt: string,
    base: string,
    members: PlaybookMember[],
  ): Promise<Playbook> {
    const playbook = await ipc.createPlaybook(name, prompt, base, members);
    this.#playbooks = [playbook, ...this.#playbooks];
    return playbook;
  }

  async remove(id: string): Promise<void> {
    await ipc.deletePlaybook(id);
    this.#playbooks = this.#playbooks.filter((p) => p.id !== id);
  }
}

export const playbookStore = new PlaybookStore();
