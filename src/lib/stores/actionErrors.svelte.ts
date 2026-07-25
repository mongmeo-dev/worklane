class ActionErrorStore {
  event = $state<{ id: number } | null>(null);
  #nextId = 0;

  report(_reason: unknown): void {
    this.event = { id: ++this.#nextId };
  }

  dismiss(): void {
    this.event = null;
  }
}

export const actionErrors = new ActionErrorStore();
