# 프로젝트/에이전트 영속 저장소 및 worktree 격리 설계

작성일: 2026-07-22

## 배경 및 목표

현재 앱의 프로젝트/에이전트 목록은 `src/lib/data/mock.ts`의 `mockProjects` 정적 목데이터로 채워져 있다. 이 목데이터를 제거하고, 앱의 핵심 도메인인 **여러 프로젝트 × 여러 CLI 에이전트 관리**를 실제 기능으로 구현한다.

목표는 다음과 같다.

- 목데이터(`mockProjects`) 완전 제거
- 사용자가 프로젝트/에이전트를 직접 등록하고 앱이 이를 로컬에 영속화
- 에이전트 생성 시 격리된 git worktree를 자동 생성
- 에이전트를 실제 PTY 세션으로 실행(각 에이전트가 자신의 실행 커맨드와 worktree에서 동작)

## 확정된 설계 결정

| 항목 | 결정 |
|------|------|
| 데이터 진실 원천 | 사용자 등록 + 앱이 영속화 |
| 저장소 | 로컬 SQLite (rusqlite, bundled) — 향후 멀티머신 sync 대비 스키마 |
| 에이전트 실행 범위 | PTY 실행까지 연결 |
| 실행 커맨드 | 에이전트별 `command` 필드 저장 (kind별 기본값 자동 채움 + 편집 가능) |
| worktree 위치 | 기본 app_data_dir 자동 생성, 사용자 커스텀 경로도 허용 |
| 브랜치 처리 | 새 브랜치 생성(입력 branch명이 이미 있으면 체크아웃), start-point는 사용자 지정 |
| 삭제 정책 | 확인 팝업으로 질의 + "묻지 않기" 체크박스(안전 제거 자동화) |
| 라벨 상수 | `mock.ts`에서 `labels.ts`로 분리 |

### 범위 밖 (후속)

- 멀티머신 sync 실구현 (이번엔 스키마 대비만: `updated_at`, UUID 기반 id)
- 실제 에이전트 sync 서버/인증/충돌 해결

## 데이터 모델

### 타입 (`src/lib/types.ts`)

`Agent`에 다음을 반영한다.

- `command: string` 추가 — 실행 커맨드 (예: `"claude"`, `"codex --model o3"`)
- `status`, `lastActivity`는 **런타임 파생값**이므로 DB에 저장하지 않는다. `status`는 `sessionStatus` 스토어(3계층 트래킹)에서 파생하며, 미실행 시 기본 `idle`.

정적 정의(무엇을 실행할지)와 런타임 상태(지금 어떤 상태인지)를 분리한다. DB에는 정적 정의만 저장하고, 동적 상태는 세션 스토어가 담당한다. sync 관점에서도 정적 정의만 동기화하면 되므로 이 분리가 유리하다.

### SQLite 스키마

DB 파일: `app_data_dir/workspace.db` (기존 `hooks/` 디렉토리와 동일한 app_data_dir 패턴). 앱 시작 시 스키마 마이그레이션(테이블 없으면 생성), `user_version` PRAGMA로 버전 관리.

```sql
CREATE TABLE projects (
  id          TEXT PRIMARY KEY,   -- UUID
  name        TEXT NOT NULL,
  path        TEXT NOT NULL,
  created_at  INTEGER NOT NULL,   -- epoch ms
  updated_at  INTEGER NOT NULL    -- sync 충돌해결 대비
);

CREATE TABLE agents (
  id                TEXT PRIMARY KEY,   -- UUID
  project_id        TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title             TEXT NOT NULL,
  kind              TEXT NOT NULL,      -- claude-code | codex | cursor | gemini
  command           TEXT NOT NULL,      -- 실행 커맨드
  branch            TEXT NOT NULL,
  worktree_path     TEXT NOT NULL,
  worktree_managed  INTEGER NOT NULL,   -- 1이면 앱이 자동 생성한 worktree(정리 대상), 0이면 사용자 지정
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL
);
```

- 같은 `kind`로 여러 에이전트를 만들 수 있다(각자 다른 command/title/branch). 예: 실행 커맨드가 다른 codex 에이전트 두 개.
- `worktree_managed`로 앱이 생성한 worktree만 삭제 시 정리 대상으로 판단한다.

## 백엔드 (Rust)

### 저장소 계층 (`src-tauri/src/store/`)

- `rusqlite` 도입 (`bundled` 피처로 SQLite 내장 → 시스템 의존성 없음)
- 앱 시작 시 스키마 마이그레이션
- 모든 DB I/O는 기존 패턴(`git_diff`, `create_session`)대로 `spawn_blocking`으로 별도 스레드에서 처리

### git worktree (`src-tauri/src/git/mod.rs` 확장)

기존 `run_git`/`run_git_allow_fail` 헬퍼를 재사용한다.

- `create_worktree(repo_path, branch, start_point, worktree_path) -> Result<String, String>`
  - `git worktree add -b <branch> <path> <start-point>` 실행. branch가 이미 존재하면 `-b` 없이 붙임. 생성된 절대경로 반환.
- `remove_worktree(repo_path, worktree_path, force: bool) -> Result<(), String>`
  - `git worktree remove [--force]`. `force=false`에서 uncommitted 변경으로 실패하면 프론트가 구분할 수 있는 에러를 반환(강제 여부 재질의용).
- `worktree_has_changes(worktree_path) -> Result<bool, String>`
  - 삭제 전 uncommitted 변경 유무 확인(팝업 문구용).

### Tauri 커맨드 (`commands.rs`)

- `list_projects() -> Vec<Project>` — 프로젝트+에이전트를 조인해 반환
- `create_project(name, path) -> Project`
- `delete_project(id)` — CASCADE로 하위 에이전트 삭제. 각 에이전트의 managed worktree 정리 포함. 프로젝트 삭제도 확인 다이얼로그를 거치며, 하위 에이전트 중 uncommitted 변경이 있는 worktree가 있으면 그 사실을 표시한다(개별 재질의 없이 일괄 처리하되, 변경 존재 여부는 사용자에게 고지).
- `create_agent(project_id, title, kind, command, branch, start_point, worktree_path?) -> Agent`
  - **원자적 수행**: (1) worktree 생성 → (2) DB insert. worktree_path 미지정 시 `app_data_dir/worktrees/<project>/<branch>` 기본 경로 계산(`worktree_managed=1`), 지정 시 그 경로 사용(`worktree_managed=0`).
- `update_agent(...)` / `delete_agent(id, remove_worktree, force)` — worktree 정리 파라미터 수신

## 프론트엔드

### IPC 레이어 (`src/lib/ipc/projects.ts` 신규)

백엔드 커맨드를 감싸는 타입 안전 래퍼: `listProjects()`, `createProject()`, `deleteProject()`, `createAgent()`, `updateAgent()`, `deleteAgent()`. 기존 `pty.ts`/`git.ts` 패턴을 따른다.

### 스토어 (`src/lib/stores/projects.svelte.ts` 신규)

- Svelte 5 룬 기반 반응형 스토어. `mockProjects`를 대체하는 실제 데이터 소스.
- `projects = $state<Project[]>([])`, 앱 마운트 시 `load()`로 `listProjects()` 호출.
- `addProject`/`removeProject`/`addAgent`/`removeAgent` 메서드 — 백엔드 호출 후 로컬 상태 갱신.
- `sessionStatus`(런타임 상태)와 병합해 각 에이전트의 표시용 `status`를 파생.

### 상수 분리 (`src/lib/data/labels.ts` 신규)

- `agentKindLabels`, `statusLabels`를 `mock.ts`에서 이동.
- `agentKindDefaults: Record<AgentKind, string>` 추가 (kind → 기본 실행 커맨드). 에이전트 추가 UI에서 kind 선택 시 command를 이 기본값으로 자동 채우고, 사용자가 편집 가능.
- **`mock.ts` 삭제**, 4개 컴포넌트(`Sidebar`, `MainPanel`, `StatusDot`)의 import 경로를 `labels.ts`로 갱신.

### App.svelte

- `const projects = mockProjects` 제거 → `projectStore`에서 로드.
- 빈 상태(프로젝트 0개): 사이드바에 "프로젝트 추가" 안내.

### UI 컴포넌트 (신규)

- **프로젝트 추가 다이얼로그**: name, path 입력. path는 네이티브 디렉토리 선택(`@tauri-apps/plugin-dialog`).
- **에이전트 추가 다이얼로그**: title, kind 선택(→ command 자동 채움+편집), branch, start-point(분기 기준) 입력. `worktreePath`는 선택적(비우면 app_data_dir 자동 생성).
- **에이전트 삭제 확인 다이얼로그**: worktree 변경 유무 표시 + "묻지 않기" 체크박스.
- 사이드바에 추가/삭제 진입점.

### 설정 스토어

- `skipWorktreeDeletePrompt` 플래그를 기존 설정 패턴(localStorage 기반, `terminalSettings`/`theme` 스토어와 동일)으로 추가. 체크 시 이후 삭제는 팝업 없이 안전 제거로 진행.

### MainPanel — PTY 실행 연결

- 현재 하드코딩된 `cmd={defaultShell()}` `cwd="."` → `cmd={agent.command}` `cwd={agent.worktreePath}`로 교체.
- PTY 생성/쓰기/리사이즈/종료, 상태 이벤트 인프라는 이미 완성되어 있으므로, 목데이터 대신 실제 에이전트의 command/worktreePath를 연결하는 것이 핵심.

## 에러 처리

- **커맨드 원자성**: `create_agent`는 worktree 생성 → DB insert 순서로 진행. worktree 생성 실패 시 DB에 아무것도 안 남긴다. DB insert 실패 시 이미 만든 worktree를 롤백(`remove_worktree --force`)해 고아 디렉토리를 방지한다.
- **IPC 에러 전파**: 백엔드는 `Result<_, String>` 반환. 파괴적 작업(생성/삭제)은 폰트 열거처럼 조용히 폴백하지 않고 반드시 UI(토스트/다이얼로그)에 노출한다.
- **worktree 삭제 실패**: `force=false`에서 uncommitted 변경으로 실패하면 프론트가 감지해 "변경사항이 있습니다. 강제 삭제할까요?" 재확인. 그 외 실패는 에러 메시지를 노출하고 DB 삭제도 중단(worktree와 레코드 불일치 방지).
- **빈 상태**: 프로젝트/에이전트 0개일 때 크래시 없이 안내 UI.

## 테스트

- **Rust 단위 테스트** (`git/mod.rs`): 임시 git 저장소로 `create_worktree`/`remove_worktree`/`worktree_has_changes` 검증. 새 브랜치 생성, 기존 브랜치 붙이기, uncommitted 변경 시 remove 거부 케이스.
- **Rust 저장소 테스트** (`store/`): in-memory SQLite(`:memory:`)로 CRUD·CASCADE 삭제·마이그레이션 검증.
- **프론트 스토어 테스트** (`projects.svelte.test.ts`): IPC를 Vitest로 목킹해 `load`/`addProject`/`addAgent`/`remove` 로직과 `sessionStatus` 병합 파생 검증(기존 `theme.svelte.test.ts`의 `vi.stubGlobal` 패턴 준용).
- **라벨 분리 회귀**: `mock.ts` 삭제 후 4개 컴포넌트가 `labels.ts`를 참조하도록 갱신됐는지 `tsc`/`svelte-check`와 기존 테스트로 커버.
