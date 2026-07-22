const KEY = "ui:skip-worktree-delete-prompt";

class UiSettings {
  #skip = $state(false);

  constructor() {
    if (typeof localStorage !== "undefined") {
      this.#skip = localStorage.getItem(KEY) === "true";
    }
  }

  get skipWorktreeDeletePrompt(): boolean {
    return this.#skip;
  }

  set skipWorktreeDeletePrompt(v: boolean) {
    this.#skip = v;
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(KEY, String(v));
    }
  }
}

export const uiSettings = new UiSettings();
