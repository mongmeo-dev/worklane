import { invoke, Channel } from "@tauri-apps/api/core";

/** Rust PtyOutput과 대응. bytes는 JSON 직렬화로 number[]로 들어온다. */
export type PtyOutput = { sessionId: string; bytes: number[] };

export interface CreateSessionOptions {
  sessionId: string;
  cmd: string;
  cwd: string;
  rows: number;
  cols: number;
  onOutput: (output: PtyOutput) => void;
}

/** PTY 세션을 생성한다. 출력은 onOutput 콜백으로 스트리밍된다. */
export async function createSession(opts: CreateSessionOptions): Promise<void> {
  const channel = new Channel<PtyOutput>();
  channel.onmessage = opts.onOutput;
  await invoke("create_session", {
    sessionId: opts.sessionId,
    cmd: opts.cmd,
    cwd: opts.cwd,
    rows: opts.rows,
    cols: opts.cols,
    onOutput: channel,
  });
}

export function writeToPty(sessionId: string, data: Uint8Array): Promise<void> {
  return invoke("write_to_pty", { sessionId, data: Array.from(data) });
}

export function resizePty(sessionId: string, rows: number, cols: number): Promise<void> {
  return invoke("resize_pty", { sessionId, rows, cols });
}

export function closeSession(sessionId: string): Promise<void> {
  return invoke("close_session", { sessionId });
}
