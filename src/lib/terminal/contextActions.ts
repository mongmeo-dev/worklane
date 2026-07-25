import type { Terminal } from "@xterm/xterm";
import { actionErrors } from "$lib/stores/actionErrors.svelte";

/**
 * A context-menu action set bound to the terminal that was mounted when the
 * menu opened. It deliberately never resolves a replacement terminal.
 */
export class TerminalContextActions {
  readonly selection: string;

  constructor(
    private readonly terminal: Terminal,
    private readonly resolveTerminal: () => Terminal | undefined,
    private readonly beforePaste?: () => void,
  ) {
    this.selection = terminal.hasSelection() ? terminal.getSelection() : "";
  }

  get hasSelection(): boolean {
    return this.selection.length > 0;
  }

  async copy(): Promise<void> {
    if (!this.hasSelection || !this.currentTerminal()) return;
    await navigator.clipboard.writeText(this.selection);
  }

  async paste(): Promise<void> {
    if (!this.currentTerminal()) return;
    this.beforePaste?.();
    const text = await navigator.clipboard.readText();
    if (!text) return;
    const terminal = this.currentTerminal();
    if (!terminal) return;
    terminal.paste(text);
  }

  selectAll(): void {
    const terminal = this.currentTerminal();
    if (!terminal) return;
    terminal.focus();
    terminal.selectAll();
  }

  focus(): void {
    this.currentTerminal()?.focus();
  }

  private currentTerminal(): Terminal | undefined {
    if (this.resolveTerminal() === this.terminal) return this.terminal;
    actionErrors.report(new Error("Terminal is unavailable."));
    return undefined;
  }
}
