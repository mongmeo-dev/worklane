<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { Terminal } from "@xterm/xterm";
  import { FitAddon } from "@xterm/addon-fit";
  import { Unicode11Addon } from "@xterm/addon-unicode11";
  import { WebglAddon } from "@xterm/addon-webgl";
  import "@xterm/xterm/css/xterm.css";
  import { createSession, writeToPty, resizePty, closeSession } from "$lib/ipc/pty";
  import { HangulImeAddon } from "$lib/terminal/HangulImeAddon";
  import { terminalSettings } from "$lib/stores/terminalSettings.svelte";

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

  function writeBytes(data: string) {
    writeToPty(sessionId, new TextEncoder().encode(data));
  }

  // xterm의 문자 폭 측정(CharSizeService)은 Canvas 2D `measureText`를 쓰는데,
  // WebKit(WKWebView)의 Canvas는 D2Coding 같은 일부 폰트 폭을 잘못 잰다.
  // 이로 인한 자간 오류는 WebGL 렌더러(글리프를 실제 폭으로 그림)로 해소한다.
  // 측정 기반 fit()의 열 계산이 어긋나지 않도록 폭 측정에는 monospace 폴백을
  // 덧붙여 안정화한다(표시는 앞선 폰트를 우선 사용).
  function withFallback(family: string): string {
    return /(^|,)\s*monospace\s*$/.test(family) ? family : `${family}, monospace`;
  }

  onMount(async () => {
    term = new Terminal({
      cursorBlink: true,
      fontFamily: withFallback(terminalSettings.fontFamily),
      fontSize: terminalSettings.fontSize,
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

    // WebGL 렌더러: 글리프를 GPU 텍스처로 직접 그린다. WebKit(WKWebView)의
    // Canvas measureText가 일부 폰트(D2Coding 등) 폭을 잘못 재는 문제와 무관하게
    // 실제 글리프 폭으로 렌더되어 자간이 정확해진다. 컨텍스트 소실 시 DOM 렌더러로 폴백.
    try {
      const webgl = new WebglAddon();
      webgl.onContextLoss(() => webgl.dispose());
      term.loadAddon(webgl);
    } catch {
      // WebGL 미지원 환경은 기본 DOM 렌더러를 그대로 사용한다.
    }

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

    // IME 조합 키는 애드온이 소유한다.
    term.attachCustomKeyEventHandler((ev) => ime?.handleKeyEvent(ev) ?? true);

    term.onData((data) => {
      // 조합 중 xterm이 흘리는 자모는 무시한다. 확정 문자는 애드온이 전송한다.
      if (ime?.isComposing()) return;
      writeBytes(data);
    });

    ro = new ResizeObserver(() => {
      fit?.fit();
      if (term) resizePty(sessionId, term.rows, term.cols);
    });
    ro.observe(el);
  });

  // 설정 store 변경 시 실행 중인 터미널에 즉시 반영한다.
  // 폰트 옵션 변경 후에는 새 폰트의 셀 폭 재측정이 반영된 다음 프레임에
  // fit()/resizePty()를 수행해 컨테이너에 맞는 행·열을 다시 계산한다.
  $effect(() => {
    const family = withFallback(terminalSettings.fontFamily);
    const size = terminalSettings.fontSize;
    if (!term) return;
    term.options.fontFamily = family;
    term.options.fontSize = size;
    const raf = requestAnimationFrame(() => {
      if (!term) return;
      fit?.fit();
      resizePty(sessionId, term.rows, term.cols);
    });
    return () => cancelAnimationFrame(raf);
  });

  onDestroy(() => {
    ro?.disconnect();
    closeSession(sessionId).catch(() => {});
    term?.dispose();
  });
</script>

<div bind:this={el} class="h-full w-full"></div>
