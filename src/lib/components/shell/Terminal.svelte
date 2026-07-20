<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { Terminal } from "@xterm/xterm";
  import { FitAddon } from "@xterm/addon-fit";
  import { Unicode11Addon } from "@xterm/addon-unicode11";
  import "@xterm/xterm/css/xterm.css";
  import { createSession, writeToPty, resizePty, closeSession } from "$lib/ipc/pty";
  import { HangulImeAddon } from "$lib/terminal/HangulImeAddon";

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
  let ime: HangulImeAddon | undefined;
  let settleTimer: ReturnType<typeof setTimeout> | undefined;
  // 마지막으로 PTY에 통지한 크기. 값이 실제로 바뀔 때만 resize를 보낸다.
  let lastRows = 0;
  let lastCols = 0;

  // fit()은 xterm 버퍼를 새 폭으로 reflow하고, 이어지는 PTY resize는 zsh가
  // SIGWINCH로 프롬프트를 다시 그리게 한다. 드래그처럼 크기가 연속으로 바뀌면
  // 이 재배치가 매 프레임 반복되어 프롬프트가 여러 번 출력된다.
  // 따라서 드래그 중에는 아무것도 하지 않고, 크기가 멈춘 뒤 한 번만 fit()과
  // PTY resize를 수행한다(VS Code 터미널 등이 쓰는 트레일링 방식).
  const SETTLE_MS = 120;

  function applyResize() {
    if (!term || !fit) return;
    fit.fit();
    if (term.rows === lastRows && term.cols === lastCols) return;
    lastRows = term.rows;
    lastCols = term.cols;
    resizePty(sessionId, term.rows, term.cols);
  }

  function scheduleResize() {
    clearTimeout(settleTimer);
    settleTimer = setTimeout(applyResize, SETTLE_MS);
  }

  function writeBytes(data: string) {
    writeToPty(sessionId, new TextEncoder().encode(data));
  }

  onMount(async () => {
    term = new Terminal({
      cursorBlink: true,
      fontFamily: "monospace",
      fontSize: 13,
      allowProposedApi: true,
    });
    fit = new FitAddon();
    term.loadAddon(fit);

    // 한글 폭(전각) 정렬을 위한 Unicode11.
    const unicode11 = new Unicode11Addon();
    term.loadAddon(unicode11);
    term.unicode.activeVersion = "11";

    // open()이 textarea/screen DOM을 생성하므로, IME 애드온은 open() 이후 로드한다.
    term.open(el);
    fit.fit();

    // 한글 IME 우회 애드온(Kova 방식): 확정된 텍스트만 PTY로 보낸다.
    ime = new HangulImeAddon(writeBytes);
    term.loadAddon(ime);

    await createSession({
      sessionId,
      cmd,
      cwd,
      rows: term.rows,
      cols: term.cols,
      onOutput: (o) => term?.write(new Uint8Array(o.bytes)),
    });

    // PTY는 이 크기로 생성됐으므로 기준값으로 기록한다.
    lastRows = term.rows;
    lastCols = term.cols;

    // IME 조합 키는 애드온이 소유한다.
    term.attachCustomKeyEventHandler((ev) => ime?.handleKeyEvent(ev) ?? true);

    term.onData((data) => {
      // 조합 중 xterm이 흘리는 자모는 무시한다. 확정 문자는 애드온이 전송한다.
      if (ime?.isComposing()) return;
      writeBytes(data);
    });

    ro = new ResizeObserver(scheduleResize);
    ro.observe(el);
  });

  onDestroy(() => {
    ro?.disconnect();
    clearTimeout(settleTimer);
    closeSession(sessionId).catch(() => {});
    term?.dispose();
  });
</script>

<div bind:this={el} class="h-full w-full"></div>
