import type { ITerminalAddon, Terminal } from "@xterm/xterm";
import { computePreeditUpdate, isKorean } from "./ime-core";

/**
 * macOS WKWebView(Tauri v2)에서 xterm.js 한글 IME 조합을 우회하는 애드온.
 *
 * WKWebView는 IME 조합 처리에 upstream 버그가 있어 한글 자모가 흘러나온다
 * (xterm.js #5704/#5887/#5894). 이 애드온은 xterm의 숨겨진 `.xterm-helper-textarea`를
 * 직접 가로채 자체 composition 상태 머신을 돌린다.
 *
 * 조합 중 글자는 별도 오버레이 대신 **PTY 에코 방식**으로 보여준다: 조합 중 문자열을
 * 셸로 직접 보내 셸이 그리게 하고, 조합이 갱신될 때마다 이전 문자열을 DEL로 지우고
 * 새 문자열을 보낸다. 음절이 확정되면 지우지 않고 그대로 둔다. 이러면 셸이 커서/폭을
 * 정확히 처리하므로 오버레이 위치 계산이 필요 없다.
 *
 * xterm 코어는 포크하지 않는다. upstream에서 네이티브 수정이 병합되면 제거한다.
 */
export class HangulImeAddon implements ITerminalAddon {
  private textarea: HTMLTextAreaElement | null = null;
  /** xterm 코어의 조합 오버레이(.composition-view). PTY 에코와 겹쳐 중복 표시되므로 숨긴다. */
  private compositionView: HTMLElement | null = null;

  private imeActive = false;
  /** textarea에서 이미 "처리 시작한" 접두사 길이(이 뒤가 현재 조합 대상). */
  private baseLen = 0;
  /** 현재 셸에 에코되어 있는 조합 중 문자열. */
  private preedit = "";

  private readonly emit: (data: string) => void;

  /** @param emit 셸(PTY)로 바이트를 보낼 콜백 (예: writeToPty 래퍼) */
  constructor(emit: (data: string) => void) {
    this.emit = emit;
  }

  /** onData 가드용: 조합 중이면 xterm이 흘리는 자모를 PTY로 보내면 안 된다. */
  isComposing(): boolean {
    return this.imeActive;
  }

  activate(term: Terminal): void {
    const el = term.element;
    this.textarea = el?.querySelector<HTMLTextAreaElement>(".xterm-helper-textarea") ?? null;
    if (!this.textarea) return;

    this.textarea.addEventListener("beforeinput", this.onBeforeInput);
    this.textarea.addEventListener("compositionstart", this.onCompositionStart);
    this.textarea.addEventListener("compositionend", this.onCompositionEnd);
    this.textarea.addEventListener("input", this.onInput);

    // xterm 코어의 CompositionHelper는 조합 중 글자를 커서 위치의 .composition-view
    // 오버레이로 그린다. 이 애드온은 같은 글자를 PTY 에코로 이미 그리므로, 오버레이가
    // 겹쳐 "마지막 글자가 두 번" 보인다. 인라인 display:none은 .composition-view.active의
    // display:block(스타일시트 규칙)보다 우선하므로 조합 내내 오버레이가 숨겨진다.
    this.compositionView = el?.querySelector<HTMLElement>(".composition-view") ?? null;
    if (this.compositionView) this.compositionView.style.display = "none";
  }

  dispose(): void {
    const ta = this.textarea;
    if (ta) {
      ta.removeEventListener("beforeinput", this.onBeforeInput);
      ta.removeEventListener("compositionstart", this.onCompositionStart);
      ta.removeEventListener("compositionend", this.onCompositionEnd);
      ta.removeEventListener("input", this.onInput);
    }
    this.textarea = null;
    if (this.compositionView) {
      this.compositionView.style.removeProperty("display");
      this.compositionView = null;
    }
    this.imeActive = false;
    this.baseLen = 0;
    this.preedit = "";
  }

  /**
   * attachCustomKeyEventHandler에서 호출한다. IME 조합 키를 처리하고,
   * xterm이 그 키를 자체 처리하지 않아야 하면 false를 반환한다.
   */
  handleKeyEvent(event: KeyboardEvent): boolean {
    if (event.type !== "keydown") return true;

    // 조합 중(keyCode 229 또는 isComposing)이면 xterm 처리를 막고 IME가 소유한다.
    if (event.isComposing || event.keyCode === 229) {
      this.imeActive = true;
      return false;
    }

    // 조합 중인데 IME 키가 아니면(Enter, 방향키, backspace 등) 조합을 종료한다.
    if (this.imeActive) {
      const k = event.key;
      // 수정자 키는 조합을 유지한다(쌍자음 ㅆ 등).
      if (k === "Shift" || k === "Control" || k === "Alt" || k === "Meta") {
        return false;
      }
      this.endComposition();
      // 종료 후 이 키(backspace/방향키/Enter 등)는 xterm이 정상 처리하도록 통과시킨다.
    }
    return true;
  }

  // ── 이벤트 핸들러 ──────────────────────────────────────────────

  private onBeforeInput = (e: Event): void => {
    const ie = e as InputEvent;

    // macOS 한글 IME는 음절 갱신을 insertReplacementText로 보낸다(input보다 먼저).
    if (
      ie.inputType === "insertReplacementText" ||
      ie.inputType === "insertCompositionText" ||
      ie.inputType === "insertFromComposition"
    ) {
      this.imeActive = true;
      return;
    }

    if (ie.inputType === "insertText" && ie.data) {
      if (isKorean(ie.data)) {
        if (this.imeActive) {
          // 음절 경계: 현재 조합 글자를 확정하고 새 조합을 시작한다.
          this.commit();
        }
        this.imeActive = true;
        this.baseLen = this.textarea?.value.length ?? 0;
        return;
      }
      // 한글이 아닌 문자가 들어오면 조합을 종료한다(이 문자는 xterm이 정상 처리).
      if (this.imeActive) {
        this.endComposition();
      }
    }
  };

  private onCompositionStart = (): void => {
    this.imeActive = true;
    this.baseLen = this.textarea?.value.length ?? 0;
    this.preedit = "";
  };

  private onCompositionEnd = (): void => {
    // 조합 중 글자는 이미 셸에 에코되어 있으므로, 지우지 않고 확정만 한다.
    this.imeActive = false;
    this.baseLen = 0;
    this.preedit = "";
    if (this.textarea) this.textarea.value = "";
  };

  private onInput = (): void => {
    const ta = this.textarea;
    if (!this.imeActive || !ta) return;

    // baseLen 이후가 현재 조합 중 문자열. (백스페이스로 줄면 clamp)
    if (this.baseLen > ta.value.length) this.baseLen = ta.value.length;
    const composing = ta.value.slice(this.baseLen);

    const { send, preedit } = computePreeditUpdate(this.preedit, composing);
    this.preedit = preedit;
    if (send) this.emit(send);
  };

  // ── 확정 ──────────────────────────────────────────────────────

  /**
   * 음절 경계에서 현재 조합 글자를 확정하되 조합 세션은 계속 이어간다.
   * 조합 글자는 이미 PTY 에코로 셸에 그려져 있으므로 다시 보내지 않고,
   * 다음 글자 조합을 위해 preedit만 비운다. (imeActive는 유지)
   */
  private commit(): void {
    this.preedit = "";
    this.baseLen = this.textarea?.value.length ?? 0;
  }

  /**
   * 조합 세션을 완전히 종료한다. WKWebView는 마지막 글자에 대해 compositionend를
   * 보내지 않는 경우가 있어, IME가 아닌 키(backspace/방향키 등)를 만나면 여기서
   * imeActive를 내려야 이후 키가 onData 가드(isComposing)에 막히지 않는다.
   */
  private endComposition(): void {
    this.imeActive = false;
    this.preedit = "";
    this.baseLen = 0;
    if (this.textarea) this.textarea.value = "";
  }
}
