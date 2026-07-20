<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { Terminal } from "@xterm/xterm";
  import { FitAddon } from "@xterm/addon-fit";
  import "@xterm/xterm/css/xterm.css";
  import { createSession, writeToPty, resizePty, closeSession } from "$lib/ipc/pty";

  interface Props {
    sessionId: string;
    cmd: string;
    cwd: string;
  }

  let { sessionId, cmd, cwd }: Props = $props();

  let el: HTMLDivElement;
  let term: Terminal | undefined;
  let fit: FitAddon | undefined;
  let ro: ResizeObserver | undefined;

  onMount(async () => {
    term = new Terminal({ cursorBlink: true, fontFamily: "monospace", fontSize: 13 });
    fit = new FitAddon();
    term.loadAddon(fit);
    term.open(el);
    fit.fit();

    await createSession({
      sessionId,
      cmd,
      cwd,
      rows: term.rows,
      cols: term.cols,
      onOutput: (o) => term?.write(new Uint8Array(o.bytes)),
    });

    term.onData((data) => {
      writeToPty(sessionId, new TextEncoder().encode(data));
    });

    ro = new ResizeObserver(() => {
      fit?.fit();
      if (term) resizePty(sessionId, term.rows, term.cols);
    });
    ro.observe(el);
  });

  onDestroy(() => {
    ro?.disconnect();
    closeSession(sessionId);
    term?.dispose();
  });
</script>

<div bind:this={el} class="h-full w-full"></div>
