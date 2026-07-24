import { BLANK_TERMINAL_KIND } from "$lib/data/labels";
import { t } from "$lib/i18n";

/** 사용자가 추가·수정·삭제할 수 있는 CLI 에이전트 종류 정의. */
export interface AgentKindDef {
  /** 고유 식별자. agent.kind로 백엔드에 그대로 저장된다. */
  id: string;
  /** 화면 표시명 */
  label: string;
  /** 종류 선택 시 실행 커맨드 입력란에 자동으로 채워지는 기본값 */
  defaultCommand: string;
  /** 앱이 기본 제공하는 종류 여부(사용자 추가분과 구분). 삭제·수정은 둘 다 가능. */
  builtin: boolean;
}

const STORAGE_KEY = "settings:agent-kinds";

/** 앱이 기본 제공하는 CLI 에이전트 종류. 사용자가 삭제·수정할 수 있다. */
const BUILTIN_KINDS: readonly AgentKindDef[] = [
  { id: "claude-code", label: "Claude Code", defaultCommand: "claude", builtin: true },
  { id: "codex", label: "Codex", defaultCommand: "codex", builtin: true },
  { id: "cursor", label: "Cursor", defaultCommand: "cursor-agent", builtin: true },
  { id: "gemini", label: "Gemini", defaultCommand: "gemini", builtin: true },
];

/** 표시명에서 id로 쓸 slug를 만든다. 영숫자만 남기고 나머지는 하이픈으로. */
function slugifyKindId(label: string): string {
  const base = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || `custom-${Date.now().toString(36)}`;
}

function isAgentKindDef(v: unknown): v is AgentKindDef {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    o.id.trim() !== "" &&
    o.id !== BLANK_TERMINAL_KIND &&
    typeof o.label === "string" &&
    typeof o.defaultCommand === "string"
  );
}

/**
 * 에이전트 종류 레지스트리 store.
 *
 * 기본 4종을 씨앗으로 시작하되 사용자가 자유롭게 추가·수정·삭제할 수 있으며,
 * 전체 목록을 localStorage에 그대로 저장해 삭제/수정이 재시작 후에도 유지된다.
 * 빈 터미널(`terminal`)은 구조적 종류라 이 목록에 포함하지 않고 항상 선택 가능하다.
 */
class AgentKindStore {
  #kinds = $state<AgentKindDef[]>(BUILTIN_KINDS.map((k) => ({ ...k })));

  /** 관리·팬아웃에서 쓰는 CLI 에이전트 종류(빈 터미널 제외). */
  get cliKinds(): AgentKindDef[] {
    return this.#kinds;
  }

  get cliKindIds(): string[] {
    return this.#kinds.map((k) => k.id);
  }

  /** 생성 다이얼로그에서 고를 수 있는 전체 종류 id(빈 터미널을 목록 맨 뒤에 배치). */
  get selectableKindIds(): string[] {
    return [...this.cliKindIds, BLANK_TERMINAL_KIND];
  }

  labelOf(id: string): string {
    if (id === BLANK_TERMINAL_KIND) return t("agentKind.terminal");
    return this.#kinds.find((k) => k.id === id)?.label ?? id;
  }

  defaultCommandOf(id: string): string {
    if (id === BLANK_TERMINAL_KIND) return "";
    return this.#kinds.find((k) => k.id === id)?.defaultCommand ?? "";
  }

  /** 새 종류 추가. id는 label에서 파생하며 중복 시 접미사를 붙인다. */
  add(label: string, defaultCommand: string): AgentKindDef {
    const trimmed = label.trim();
    if (!trimmed) throw new Error(t("agentKind.nameRequired"));
    const def: AgentKindDef = {
      id: this.#uniqueId(slugifyKindId(trimmed)),
      label: trimmed,
      defaultCommand: defaultCommand.trim(),
      builtin: false,
    };
    this.#kinds = [...this.#kinds, def];
    this.#persist();
    return def;
  }

  /** 기존 종류의 표시명·기본 커맨드를 수정한다(기본 제공 종류 포함). id는 바꾸지 않는다. */
  update(id: string, patch: { label?: string; defaultCommand?: string }): void {
    let changed = false;
    this.#kinds = this.#kinds.map((k) => {
      if (k.id !== id) return k;
      changed = true;
      const label = patch.label !== undefined ? patch.label.trim() : k.label;
      const defaultCommand =
        patch.defaultCommand !== undefined ? patch.defaultCommand.trim() : k.defaultCommand;
      return { ...k, label: label || k.label, defaultCommand };
    });
    if (changed) this.#persist();
  }

  remove(id: string): void {
    const next = this.#kinds.filter((k) => k.id !== id);
    if (next.length === this.#kinds.length) return;
    this.#kinds = next;
    this.#persist();
  }

  /** 표시 순서에서 fromIndex 항목을 빼내 toIndex 위치에 끼워 넣고 저장한다. 범위를 벗어나면 무시. */
  reorder(fromIndex: number, toIndex: number): void {
    const n = this.#kinds.length;
    if (fromIndex < 0 || fromIndex >= n) return;
    if (toIndex < 0 || toIndex >= n) return;
    if (fromIndex === toIndex) return;
    const next = [...this.#kinds];
    const [item] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, item);
    this.#kinds = next;
    this.#persist();
  }

  #uniqueId(base: string): string {
    const taken = (id: string) => id === BLANK_TERMINAL_KIND || this.#kinds.some((k) => k.id === id);
    if (!taken(base)) return base;
    let n = 2;
    while (taken(`${base}-${n}`)) n += 1;
    return `${base}-${n}`;
  }

  #persist(): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.#kinds));
  }

  init(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return;
      const valid = parsed.filter(isAgentKindDef).map((k) => ({
        id: k.id,
        label: k.label,
        defaultCommand: k.defaultCommand,
        builtin: Boolean(k.builtin),
      }));
      // 저장값이 통째로 손상된 경우(비지 않은 배열인데 유효 항목 0개)에만 기본값을 유지한다.
      // 빈 배열은 사용자가 전부 삭제한 정상 상태이므로 그대로 반영한다.
      if (parsed.length > 0 && valid.length === 0) return;
      this.#kinds = valid;
    } catch {
      // 손상값은 기본값 유지
    }
  }
}

export const agentKindStore = new AgentKindStore();
