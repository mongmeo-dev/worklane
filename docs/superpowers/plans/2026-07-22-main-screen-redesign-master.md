# 메인 화면 리디자인 — 마스터 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement each phase plan task-by-task.

**Goal:** Claude Design 프로토타입에 맞춰 메인 화면을 재구현하고, 프로토타입의 모든 기능(오버뷰 그리드, 상태 칩, 공유 worktree, 파일 패널/에디터, 하단 상태 바, 개편 설정)을 실제로 동작하게 만든다.

**Architecture:** 기존 Tauri v2(Rust) + Svelte 5 + Tailwind v4 + shadcn-svelte 구조를 유지한다. 색은 `app.css` 시맨틱 토큰으로 승격하고, 백엔드는 기존 `git/store/pty/status` 모듈 패턴을 확장하며, 프론트는 shell store로 화면 상태를 중앙화한다.

**Tech Stack:** Svelte 5 룬, Tailwind CSS v4, shadcn-svelte(bits-ui/paneforge), xterm.js, Rust(rusqlite/portable-pty/sysinfo), Vitest, cargo test.

## Global Constraints

- **언어**: 모든 문서·주석·UI 텍스트는 한글(코드/고유명사 제외). 사용자 인터랙션은 경어체.
- **커밋**: 기능 단위, 한 커밋에 한 기능, 한글 메시지, **Co-Author 없음**. 코드 수정 커밋에는 `[ci skip]` 미사용(문서-only만 사용).
- **브랜치**: `feature/main-screen-redesign`에서 작업.
- **색상**: 컴포넌트에 hex 직접 사용 금지 — `app.css` 시맨틱 토큰만 사용.
- **폰트**: JetBrains Mono는 **번들 폰트**(`src/assets/fonts/`)로 등록, Google Fonts 링크 금지(오프라인 데스크톱 앱).
- **애니메이션**: `prefers-reduced-motion` 시 모두 정지.
- **터미널/에디터**: 라이트 모드에서도 항상 다크 배경(`--terminal-bg`/`--editor-bg` 고정).
- **환경변수 필요한 커맨드**: `mise exec --` 프리픽스 사용.
- **검증 커맨드**: 프론트 `pnpm check` + `pnpm test`, 백엔드 `cargo test`(src-tauri에서). 실제로는 `mise exec -- pnpm ...` 형태일 수 있음.

---

## Phase 구성과 의존성

각 Phase는 별도 계획 파일이며, 아래 순서로 실행한다. Phase A/B는 서로 독립(병렬 가능), C는 A+B에 의존, D는 C에 의존, E는 C+B에 의존.

| Phase | 파일 | 내용 | 의존 |
|-------|------|------|------|
| **A** | `2026-07-22-redesign-phase-a-tokens.md` | 디자인 토큰 + JetBrains Mono 번들 + StatusDot/StatusBadge 토큰화 | 없음 |
| **B** | `2026-07-22-redesign-phase-b-backend.md` | sysinfo/Codex사용량/Claude훅/파일3종/공유worktree 백엔드 | 없음 |
| **C** | `2026-07-22-redesign-phase-c-shell.md` | shell store + TitleBar/StatusChips + Sidebar 개편 | A, B |
| **D** | `2026-07-22-redesign-phase-d-content.md` | OverviewGrid + AgentDetail + FilePanel/FileViewer | C |
| **E** | `2026-07-22-redesign-phase-e-statusbar-settings.md` | StatusBar/UsagePopover + Settings개편 + AgentDialog | C, B |

> Phase C~E의 상세 태스크는 A/B 완료 후 확정된 백엔드 인터페이스/타입에 맞춰 작성한다(타입 일관성 보장). 마스터 계획은 각 Phase의 산출물과 인터페이스 계약만 고정한다.

---

## Phase 간 인터페이스 계약 (고정)

이 계약은 각 Phase 계획이 준수해야 하는 경계다.

### A가 제공 (토큰)

`app.css`에 등록되어 Tailwind 유틸로 노출되는 색:
- `text-status-running` / `bg-status-running` / `text-status-running-fg`
- `text-status-idle` / `bg-status-idle`
- `text-status-blocked` / `bg-status-blocked` / `text-status-blocked-fg` / `text-status-blocked-on`
- `text-status-done` / `bg-status-done` / `text-status-done-fg`
- `text-diff-add` / `bg-diff-add` / `text-diff-remove` / `bg-diff-remove`
- `text-accent-share` / `bg-accent-share`
- `bg-terminal` / `bg-editor` / `bg-editor-chrome`

컴포넌트: `StatusDot`(status prop, 크기 prop), `StatusBadge`(status prop → pill, blocked만 솔리드).

### B가 제공 (백엔드 IPC — TypeScript 시그니처)

`src/lib/ipc/system.ts`:
```ts
export interface SystemResources { cpuPercent: number; ramUsedGb: number; ramTotalGb: number; }
export function readSystemResources(): Promise<SystemResources>;
```

`src/lib/ipc/usage.ts`:
```ts
export interface UsageMetric { label: string; percent: number; valueText: string; resetNote: string; }
export interface UsageInfo {
  provider: 'claude-code' | 'codex' | 'cursor' | 'gemini';
  fullName: string;   // "Claude Code"
  plan: string | null; // "Max 5x" | "Pro" | null(미확인)
  account: string | null;
  tier: string | null; // "Anthropic 계정"
  primaryPercent: number | null; // 하단 바 게이지용 (null=연동 안 됨)
  primaryReset: string | null;
  metrics: UsageMetric[]; // 팝오버 상세
  connected: boolean; // false면 "연동 안 됨" 배지
}
export function readCodexUsage(): Promise<UsageInfo>;
export function readClaudeUsage(): Promise<UsageInfo>;
export function installClaudeStatusline(): Promise<void>;
// cursor/gemini는 프론트 상수로 connected:false UsageInfo 생성(백엔드 호출 없음)
```

`src/lib/ipc/files.ts`:
```ts
export type FileChange = 'none' | 'modified' | 'new' | 'deleted';
export interface FileEntry { path: string; dir: string; name: string; change: FileChange; add: number; del: number; }
export interface FileContent { content: string; isBinary: boolean; }
export type DiffLineKind = 'add' | 'del' | 'ctx';
export interface DiffLine { kind: DiffLineKind; oldNo: number | null; newNo: number | null; text: string; }
export function listWorktreeFiles(worktreePath: string): Promise<FileEntry[]>;
export function readWorktreeFile(worktreePath: string, relPath: string): Promise<FileContent>;
export function gitFileDiff(worktreePath: string, relPath: string): Promise<DiffLine[]>;
```

`src/lib/ipc/projects.ts` (확장):
```ts
// CreateAgentOptions에 shareWorktree?: boolean 추가 의미 명확화
// worktreePath가 다른 에이전트와 같으면 백엔드가 재사용(생성 스킵)
```

### C가 제공 (shell store)

`src/lib/stores/shell.svelte.ts`:
```ts
class ShellStore {
  selectedAgentId: string | null;  // null = 오버뷰
  overviewFilter: 'all' | 'running' | 'blocked' | 'done';
  openFilePath: string | null;
  showEditor: boolean;
  leftPanelOpen: boolean;   // localStorage 'shell:left-open'
  rightPanelOpen: boolean;  // localStorage 'shell:right-open'
  usagePopover: string | null;
  selectAgent(id: string): void;   // showEditor=false, openFile=null
  goOverview(): void;
  openFile(path: string): void;     // showEditor=true
  closeFile(): void;
  setFilter(f): void;               // + goOverview
}
```

파생 헬퍼(`src/lib/stores/derived.ts` 또는 컴포넌트 내):
- `statusCounts(projects)` → `{ running, idle, blocked, done }`
- `worktreeGroups(project)` → 같은 `worktreePath` 에이전트 묶음
- `worktreeStat(agents)` → 합산 `{ files, add, del }`

---

## 실행 순서 요약

1. **Phase A** 실행 → 토큰·StatusDot 검증 → 커밋들
2. **Phase B** 실행 → 백엔드 IPC 검증(cargo test) → 커밋들
3. A/B 완료 후 **Phase C 상세 계획 작성** → 실행
4. **Phase D 상세 계획 작성** → 실행
5. **Phase E 상세 계획 작성** → 실행
6. 전체 브랜치 통합 리뷰 → PR

각 Phase 종료 시 `code-reviewer`/`verifier`로 별도 리뷰 레인을 돌린다(자기 승인 금지).
