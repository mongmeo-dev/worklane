import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { WebglAddon } from "@xterm/addon-webgl";
import { createSession, writeToPty, resizePty, closeSession } from "$lib/ipc/pty";
import { HangulImeAddon } from "$lib/terminal/HangulImeAddon";
import { terminalSettings } from "$lib/stores/terminalSettings.svelte";
import { sessionStatus } from "$lib/stores/sessions.svelte";
import { injectionDone, markInjected } from "$lib/terminal/promptInjection";
import { registerSessionDisposer } from "$lib/terminal/session-lifecycle";

// 시드 프롬프트 자동 주입: 출력이 잦아든 뒤(=CLI 입력 대기) 1회 전송한다.
const INJECT_IDLE_MS = 900;

export interface AcquireOptions {
  sessionId: string;
  cmd: string;
  cwd: string;
  /** 세션이 준비되면 자동으로 전송할 시드 프롬프트(팬아웃/태스크). 1회만 주입한다. */
  initialPrompt?: string;
}

// xterm의 문자 폭 측정(CharSizeService)은 Canvas 2D `measureText`를 쓰는데,
// WebKit(WKWebView)의 Canvas는 D2Coding 같은 일부 폰트 폭을 잘못 잰다.
// 이로 인한 자간 오류는 WebGL 렌더러(글리프를 실제 폭으로 그림)로 해소한다.
// 측정 기반 fit()의 열 계산이 어긋나지 않도록 폭 측정에는 monospace 폴백을
// 덧붙여 안정화한다(표시는 앞선 폰트를 우선 사용).
function withFallback(family: string): string {
  return /(^|,)\s*monospace\s*$/.test(family) ? family : `${family}, monospace`;
}

// 웹폰트(JetBrains Mono 등)는 CSS @font-face로 비동기 로드된다. 폰트가 로드되기
// 전에 터미널을 열면 WebGL 글리프 아틀라스와 셀(행·열) 크기가 폴백 폰트 기준으로
// 만들어진 채 고정되어 자간이 어긋난다. 개발 머신에는 폰트가 시스템에 설치돼 있어
// 문제가 드러나지 않지만, 앱을 설치한 사용자 머신에는 없어 번들 웹폰트에 의존하므로
// 렌더가 깨진다. 따라서 open()/fit() 전에 사용 폰트의 로드를 보장한다.
async function ensureFontLoaded(family: string, size: number): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return;
  const face = family.split(",")[0].trim().replace(/^["']|["']$/g, "");
  if (!face) return;
  try {
    await Promise.all([
      document.fonts.load(`${size}px "${face}"`),
      document.fonts.load(`bold ${size}px "${face}"`),
    ]);
    await document.fonts.ready;
  } catch {
    // 폰트 로드 실패 시 폴백 폰트로 진행한다.
  }
}

/**
 * 재마운트 사이에도 살아남는 하나의 터미널 인스턴스.
 *
 * xterm 인스턴스와 PTY 세션 구독을 이 객체가 소유하므로, 뷰포트 컴포넌트가
 * 언마운트돼도 버퍼(스크롤백)와 실행 중인 에이전트 프로세스가 그대로 유지된다.
 * 뷰포트는 `container`를 자기 DOM에 append했다가 언마운트 시 detach만 한다.
 */
export class PooledTerminal {
  readonly term: Terminal;
  /** xterm이 open()된 영속 컨테이너. 뷰포트에 append해 표시한다. */
  readonly container: HTMLDivElement;
  private readonly fit: FitAddon;
  private readonly sessionId: string;
  private readonly initialPrompt?: string;
  // 마지막으로 PTY에 통지한 크기. 값이 실제로 바뀔 때만 resize를 보낸다.
  private lastRows = 0;
  private lastCols = 0;
  private injectArmed = false;
  private injectTimer?: ReturnType<typeof setTimeout>;

  private constructor(
    sessionId: string,
    initialPrompt: string | undefined,
    term: Terminal,
    fit: FitAddon,
    container: HTMLDivElement,
  ) {
    this.sessionId = sessionId;
    this.initialPrompt = initialPrompt;
    this.term = term;
    this.fit = fit;
    this.container = container;
  }

  static async create(opts: AcquireOptions): Promise<PooledTerminal> {
    const { sessionId, cmd, cwd, initialPrompt } = opts;

    const term = new Terminal({
      cursorBlink: true,
      fontFamily: withFallback(terminalSettings.fontFamily),
      fontSize: terminalSettings.fontSize,
      allowProposedApi: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);

    // 한글 폭(전각) 정렬을 위한 Unicode11.
    const unicode11 = new Unicode11Addon();
    term.loadAddon(unicode11);
    term.unicode.activeVersion = "11";

    const container = document.createElement("div");
    container.className = "h-full w-full";

    // open()이 textarea/screen DOM을 생성하므로, IME 애드온은 open() 이후 로드한다.
    // 웹폰트 로드를 보장한 뒤 열어 WebGL 아틀라스/셀 크기가 올바른 폰트로 구성되게 한다.
    await ensureFontLoaded(terminalSettings.fontFamily, terminalSettings.fontSize);
    term.open(container);

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

    const instance = new PooledTerminal(sessionId, initialPrompt, term, fit, container);

    // 한글 IME 우회 애드온(Kova 방식): 확정된 텍스트만 PTY로 보낸다.
    const ime = new HangulImeAddon((data) => instance.writeBytes(data));
    term.loadAddon(ime);

    // 시드 프롬프트가 있고 아직 주입 전이면 자동 주입을 무장한다(세션당 1회).
    instance.injectArmed = Boolean(initialPrompt?.trim()) && !injectionDone(sessionId);

    await createSession({
      sessionId,
      cmd,
      cwd,
      rows: term.rows,
      cols: term.cols,
      onOutput: (o) => {
        const bytes = new Uint8Array(o.bytes);
        sessionStatus.appendOutput(sessionId, bytes);
        term.write(bytes);
        instance.scheduleInjection();
      },
    });

    // PTY는 이 크기로 생성됐으므로 기준값으로 기록한다.
    instance.lastRows = term.rows;
    instance.lastCols = term.cols;

    // IME 조합 키는 애드온이 소유한다.
    term.attachCustomKeyEventHandler((ev) => ime.handleKeyEvent(ev) ?? true);

    term.onData((data) => {
      // 조합 중 xterm이 흘리는 자모는 무시한다. 확정 문자는 애드온이 전송한다.
      if (ime.isComposing()) return;
      instance.writeBytes(data);
    });

    return instance;
  }

  private writeBytes(data: string): void {
    writeToPty(this.sessionId, new TextEncoder().encode(data));
  }

  // 출력 이벤트마다 호출: idle이 INJECT_IDLE_MS 지속되면 시드 프롬프트를 1회 전송한다.
  private scheduleInjection(): void {
    if (!this.injectArmed) return;
    clearTimeout(this.injectTimer);
    this.injectTimer = setTimeout(() => {
      if (!this.injectArmed) return;
      this.injectArmed = false;
      markInjected(this.sessionId);
      this.writeBytes(`${this.initialPrompt!.trim()}\r`);
    }, INJECT_IDLE_MS);
  }

  /** 현재 컨테이너 크기에 맞춰 fit하고, 행·열이 바뀐 경우에만 PTY에 통지한다. */
  fitAndResize(): void {
    this.fit.fit();
    if (this.term.rows === this.lastRows && this.term.cols === this.lastCols) return;
    this.lastRows = this.term.rows;
    this.lastCols = this.term.cols;
    resizePty(this.sessionId, this.term.rows, this.term.cols);
  }

  /**
   * 뷰포트에 다시 부착됐을 때 호출한다. 크기를 맞추고 버퍼를 강제로 리페인트해,
   * detach 중 WebGL 컨텍스트 소실로 DOM 렌더러로 폴백된 경우에도 내용이 보이게 한다.
   */
  remount(): void {
    this.fitAndResize();
    if (this.term.rows > 0) this.term.refresh(0, this.term.rows - 1);
  }

  /**
   * 폰트 옵션 변경을 실행 중인 터미널에 즉시 반영한다.
   * 새 폰트의 셀 폭 재측정이 반영된 다음 프레임에 fit/resize 해 행·열을 다시 계산한다.
   */
  async applyFont(family: string, size: number): Promise<void> {
    this.term.options.fontFamily = withFallback(family);
    this.term.options.fontSize = size;
    await ensureFontLoaded(family, size);
    requestAnimationFrame(() => this.fitAndResize());
  }

  /** 세션을 완전히 종료한다(에이전트 삭제 시). PTY를 죽이고 xterm을 파괴한다. */
  dispose(): void {
    clearTimeout(this.injectTimer);
    closeSession(this.sessionId).catch(() => {});
    this.term.dispose();
    this.container.remove();
  }
}

/**
 * 세션 ID → 살아있는 터미널 인스턴스 풀.
 *
 * 뷰포트 컴포넌트의 마운트/언마운트와 무관하게 인스턴스를 유지해, 탭 전환이나
 * `{#key}` 재마운트 후에도 터미널 내용과 실행 중인 프로세스가 보존되게 한다.
 */
class TerminalPool {
  private instances = new Map<string, PooledTerminal>();
  private pending = new Map<string, Promise<PooledTerminal>>();

  /** 세션의 터미널을 얻는다. 없으면 생성하고, 생성 중이면 그 Promise를 공유한다. */
  async acquire(opts: AcquireOptions): Promise<PooledTerminal> {
    const existing = this.instances.get(opts.sessionId);
    if (existing) return existing;
    const inflight = this.pending.get(opts.sessionId);
    if (inflight) return inflight;

    const p = PooledTerminal.create(opts);
    this.pending.set(opts.sessionId, p);
    try {
      const instance = await p;
      this.instances.set(opts.sessionId, instance);
      // 에이전트 삭제 시(releaseSession) 세션을 종료하도록 등록한다.
      registerSessionDisposer(opts.sessionId, () => {
        this.instances.delete(opts.sessionId);
        instance.dispose();
      });
      return instance;
    } finally {
      this.pending.delete(opts.sessionId);
    }
  }
}

export const terminalPool = new TerminalPool();
