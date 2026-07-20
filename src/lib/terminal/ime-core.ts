/**
 * xterm.js 한글 IME 우회를 위한 순수 로직.
 *
 * macOS WKWebView는 IME 조합 처리에 upstream 버그가 있어(xterm.js #5704/#5887/#5894)
 * 한글 입력 시 자모가 흘러나온다. Kova(newExpand/kova)가 검증한 host-side 우회 방식의
 * 순수 계산 부분만 이 모듈로 분리해 단위 테스트한다. DOM/이벤트 배선은 HangulImeAddon이 담당.
 */

/** 한글 호환 자모(ㄱ~ㅣ) 또는 한글 음절(가~힣)인가. */
export function isKorean(ch: string): boolean {
  const c = ch.charCodeAt(0);
  return (c >= 0x3131 && c <= 0x3163) || (c >= 0xac00 && c <= 0xd7a3);
}

/** 미리보기 지우기용 DEL(0x7f) 문자열. 한글은 셸에서 문자 단위로 삭제된다. */
export const DEL = "\x7f";

/**
 * PTY 에코 미리보기를 갱신하기 위해 셸로 보낼 바이트 시퀀스를 계산한다.
 * 이전에 셸에 에코한 조합 문자열(prevPreedit)을 지우고 새 조합 문자열(next)을 보낸다.
 *
 * @param prevPreedit 현재 셸에 에코되어 있는 조합 중 문자열
 * @param next 새로 표시할 조합 중 문자열
 * @returns 셸로 보낼 문자열(이전 것 삭제 + 새 것)과 갱신된 preedit
 */
export function computePreeditUpdate(
  prevPreedit: string,
  next: string,
): { send: string; preedit: string } {
  if (prevPreedit === next) return { send: "", preedit: next };
  const erase = DEL.repeat([...prevPreedit].length);
  return { send: erase + next, preedit: next };
}
