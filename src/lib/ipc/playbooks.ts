import { invoke } from "@tauri-apps/api/core";
import type { AgentKind } from "$lib/types";

export interface PlaybookMember {
  kind: AgentKind;
  command: string;
}

export interface Playbook {
  id: string;
  name: string;
  prompt: string;
  base: string;
  members: PlaybookMember[];
  createdAt: number;
  updatedAt: number;
}

interface RawPlaybook {
  id: string;
  name: string;
  prompt: string;
  base: string;
  members: string;
  createdAt: number;
  updatedAt: number;
}

// 에이전트 종류는 사용자가 자유롭게 추가·삭제할 수 있으므로 특정 목록으로 제한하지 않고
// 비어 있지 않은 문자열이면 유효한 것으로 본다.
function isValidKind(kind: unknown): kind is string {
  return typeof kind === "string" && kind.trim() !== "";
}

function parseMembers(json: string): PlaybookMember[] {
  try {
    const parsed = JSON.parse(json) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (m): m is PlaybookMember =>
          typeof m === "object" &&
          m !== null &&
          isValidKind((m as PlaybookMember).kind) &&
          typeof (m as PlaybookMember).command === "string",
      )
      .map((m) => ({ kind: m.kind, command: m.command }));
  } catch {
    return [];
  }
}

function toPlaybook(raw: RawPlaybook): Playbook {
  return { ...raw, members: parseMembers(raw.members) };
}

export async function listPlaybooks(): Promise<Playbook[]> {
  const raw = await invoke<RawPlaybook[]>("list_playbooks");
  return raw.map(toPlaybook);
}

export async function createPlaybook(
  name: string,
  prompt: string,
  base: string,
  members: PlaybookMember[],
): Promise<Playbook> {
  const raw = await invoke<RawPlaybook>("create_playbook", {
    name,
    prompt,
    base,
    members: JSON.stringify(members),
  });
  return toPlaybook(raw);
}

export function deletePlaybook(id: string): Promise<void> {
  return invoke("delete_playbook", { id });
}
