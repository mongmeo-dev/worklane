# 프로젝트 기본 작업환경 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 프로젝트 등록 시 선택한 CLI 에이전트가 기존 프로젝트 디렉터리와 현재 checkout 브랜치를 사용하는 첫 작업환경을 함께 생성한다.

**Architecture:** Rust Git 계층이 기존 작업 디렉터리의 정규 경로와 현재 브랜치를 읽고, 저장소 계층이 프로젝트와 unmanaged 기본 에이전트를 하나의 SQLite 트랜잭션으로 저장한다. Svelte 프로젝트 추가 창은 에이전트 종류를 받아 새 IPC를 호출하고, 반환된 기본 작업환경을 즉시 선택한다.

**Tech Stack:** Tauri v2, Rust 2021, rusqlite 0.32, Svelte 5, TypeScript 5.6, Vitest 4

## Global Constraints

- 새 의존성을 추가하지 않는다.
- 프로젝트 등록 과정에서 branch checkout, worktree 생성, 파일 수정을 수행하지 않는다.
- 기본 작업환경의 `worktreeManaged`는 반드시 `false`이다.
- Git 검증 또는 DB 저장이 실패하면 프로젝트와 에이전트가 모두 생성되지 않아야 한다.
- 기존 새 worktree 생성, 공유, 삭제 동작을 변경하지 않는다.
- 사용자에게 표시하는 새 문구와 문서는 한글로 작성한다.

---

## 파일 구조

- `src-tauri/src/git/mod.rs`: 기존 Git 작업 디렉터리의 루트 경로와 checkout 브랜치 조회.
- `src-tauri/src/store/repo.rs`: 프로젝트와 기본 작업환경의 원자적 생성.
- `src-tauri/src/commands.rs`: Git 조회와 저장소 트랜잭션을 조합하는 Tauri 명령.
- `src-tauri/src/lib.rs`: 새 Tauri 명령 등록.
- `src/lib/ipc/projects.ts`: 원자적 프로젝트 생성 IPC 타입과 호출.
- `src/lib/stores/projects.svelte.ts`: 생성된 프로젝트를 반응형 목록에 반영하고 호출자에게 반환.
- `src/lib/stores/projects.svelte.test.ts`: IPC 인수와 기본 작업환경 반영 회귀 테스트.
- `src/lib/components/shell/ProjectDialog.svelte`: 에이전트 종류 선택, 제출 잠금, 생성된 작업환경 선택.

### Task 1: 기존 프로젝트 작업 디렉터리 판별

**Files:**
- Modify: `src-tauri/src/git/mod.rs`
- Test: `src-tauri/src/git/mod.rs`

**Interfaces:**
- Consumes: 로컬 디렉터리 경로
- Produces: `ExistingWorkspace { path: String, branch: String }`, `inspect_existing_workspace(path: &str) -> Result<ExistingWorkspace, String>`

- [ ] **Step 1: 정상 저장소, 비Git 경로, detached HEAD 테스트를 작성한다**

```rust
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExistingWorkspace {
    pub path: String,
    pub branch: String,
}

#[test]
fn 기존_작업환경의_루트와_현재_브랜치를_반환한다() {
    let repo = temp_repo();
    let nested = repo.join("src");
    std::fs::create_dir_all(&nested).unwrap();

    let workspace = inspect_existing_workspace(nested.to_str().unwrap()).unwrap();

    assert_eq!(
        workspace.path,
        std::fs::canonicalize(&repo).unwrap().to_string_lossy().into_owned(),
    );
    assert_eq!(workspace.branch, "main");
}

#[test]
fn git_저장소가_아닌_경로는_거부한다() {
    let directory = std::env::temp_dir()
        .join(format!("not-git-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&directory).unwrap();
    let error = inspect_existing_workspace(directory.to_str().unwrap()).unwrap_err();
    assert!(error.contains("Git 저장소"));
    std::fs::remove_dir_all(directory).unwrap();
}

#[test]
fn detached_head는_거부한다() {
    let repo = temp_repo();
    let status = Command::new("git")
        .args(["checkout", "--detach"])
        .current_dir(&repo)
        .status()
        .unwrap();
    assert!(status.success());
    let error = inspect_existing_workspace(repo.to_str().unwrap()).unwrap_err();
    assert!(error.contains("브랜치"));
}
```

- [ ] **Step 2: Rust 대상 테스트를 실행해 실패를 확인한다**

Run: `cd src-tauri && cargo test git::worktree_tests -- --nocapture`

Expected: `inspect_existing_workspace` 또는 `ExistingWorkspace`가 없어 컴파일 실패.

- [ ] **Step 3: Git 조회 함수를 최소 구현한다**

```rust
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExistingWorkspace {
    pub path: String,
    pub branch: String,
}

pub fn inspect_existing_workspace(path: &str) -> Result<ExistingWorkspace, String> {
    let root = run_git(path, &["rev-parse", "--show-toplevel"])
        .map_err(|_| "선택한 경로는 Git 저장소가 아닙니다.".to_string())?;
    let root = root.trim();
    if root.is_empty() {
        return Err("선택한 경로는 Git 저장소가 아닙니다.".into());
    }
    let canonical = std::fs::canonicalize(root)
        .map_err(|error| format!("프로젝트 경로 확인 실패: {error}"))?;
    let branch = run_git(root, &["symbolic-ref", "--quiet", "--short", "HEAD"])
        .map_err(|_| "현재 checkout이 브랜치를 가리키지 않습니다. 브랜치를 checkout한 뒤 다시 시도해 주세요.".to_string())?;
    let branch = branch.trim();
    if branch.is_empty() {
        return Err("현재 checkout 브랜치를 확인할 수 없습니다.".into());
    }
    Ok(ExistingWorkspace {
        path: canonical.to_string_lossy().into_owned(),
        branch: branch.to_string(),
    })
}
```

- [ ] **Step 4: 대상 테스트를 다시 실행한다**

Run: `cd src-tauri && cargo test git::worktree_tests -- --nocapture`

Expected: 새 테스트 3개와 기존 worktree 테스트가 모두 PASS.

- [ ] **Step 5: Git 판별 기능을 커밋한다**

```bash
git add src-tauri/src/git/mod.rs
git commit -m "feat: 기존 프로젝트 작업환경 판별 추가"
```

### Task 2: 프로젝트와 기본 에이전트 원자 저장

**Files:**
- Modify: `src-tauri/src/store/repo.rs`
- Test: `src-tauri/src/store/repo.rs`

**Interfaces:**
- Consumes: `name`, 정규 프로젝트 `path`, `kind`, `command`, checkout `branch`, `now`
- Produces: `insert_project_with_default_agent(conn: &mut Connection, name: &str, path: &str, kind: &str, command: &str, branch: &str, now: i64) -> rusqlite::Result<Project>`

- [ ] **Step 1: 성공과 롤백 테스트를 작성한다**

```rust
#[test]
fn 프로젝트와_기본_작업환경을_함께_저장한다() {
    let mut conn = mem();
    let project = insert_project_with_default_agent(
        &mut conn, "proj", "/tmp/proj", "codex", "codex", "main", 10,
    ).unwrap();

    assert_eq!(project.agents.len(), 1);
    let agent = &project.agents[0];
    assert_eq!(agent.title, "기본 작업환경");
    assert_eq!(agent.branch, "main");
    assert_eq!(agent.worktree_path, "/tmp/proj");
    assert!(!agent.worktree_managed);
}

#[test]
fn 에이전트_저장_실패시_프로젝트도_롤백한다() {
    let mut conn = mem();
    conn.execute_batch(
        "CREATE TRIGGER reject_default_agent
         BEFORE INSERT ON agents BEGIN SELECT RAISE(ABORT, 'reject'); END;",
    ).unwrap();

    assert!(insert_project_with_default_agent(
        &mut conn, "proj", "/tmp/proj", "codex", "codex", "main", 10,
    ).is_err());
    assert!(list_projects(&conn).unwrap().is_empty());
}
```

- [ ] **Step 2: 저장소 대상 테스트를 실행해 실패를 확인한다**

Run: `cd src-tauri && cargo test store::repo::tests -- --nocapture`

Expected: `insert_project_with_default_agent`가 없어 컴파일 실패.

- [ ] **Step 3: 트랜잭션 기반 생성 함수를 구현한다**

```rust
pub fn insert_project_with_default_agent(
    conn: &mut Connection,
    name: &str,
    path: &str,
    kind: &str,
    command: &str,
    branch: &str,
    now: i64,
) -> rusqlite::Result<Project> {
    let transaction = conn.transaction()?;
    let mut project = insert_project(&transaction, name, path, now)?;
    let agent = Agent {
        id: uuid::Uuid::new_v4().to_string(),
        project_id: project.id.clone(),
        title: "기본 작업환경".into(),
        kind: kind.into(),
        command: command.into(),
        branch: branch.into(),
        worktree_path: path.into(),
        worktree_managed: false,
        created_at: now,
        updated_at: now,
    };
    insert_agent(&transaction, &agent)?;
    transaction.commit()?;
    project.agents.push(agent);
    Ok(project)
}
```

- [ ] **Step 4: 저장소 테스트를 다시 실행한다**

Run: `cd src-tauri && cargo test store::repo::tests -- --nocapture`

Expected: 새 테스트 2개와 기존 저장소 테스트가 모두 PASS.

- [ ] **Step 5: 원자 저장 기능을 커밋한다**

```bash
git add src-tauri/src/store/repo.rs
git commit -m "feat: 프로젝트 기본 작업환경 원자 저장"
```

### Task 3: Tauri 프로젝트 생성 명령 연결

**Files:**
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs`
- Test: `src-tauri/src/commands.rs`

**Interfaces:**
- Consumes: `git::inspect_existing_workspace`, `store::repo::insert_project_with_default_agent`
- Produces: `create_project_with_default_agent(store, name, path, kind, command) -> Result<Project, String>`

- [ ] **Step 1: 명령이 사용할 입력 검증 순수 함수 테스트를 작성한다**

```rust
#[test]
fn 기본_작업환경_입력은_빈_값을_거부한다() {
    assert!(validate_default_workspace_input("", "codex", "codex").is_err());
    assert!(validate_default_workspace_input("프로젝트", "", "codex").is_err());
    assert!(validate_default_workspace_input("프로젝트", "codex", "").is_err());
    assert!(validate_default_workspace_input("프로젝트", "codex", "codex").is_ok());
}
```

- [ ] **Step 2: 명령 테스트를 실행해 실패를 확인한다**

Run: `cd src-tauri && cargo test commands::shared_worktree_tests -- --nocapture`

Expected: `validate_default_workspace_input`가 없어 컴파일 실패.

- [ ] **Step 3: 입력 검증과 Tauri 명령을 구현한다**

```rust
fn validate_default_workspace_input(name: &str, kind: &str, command: &str) -> Result<(), String> {
    if name.trim().is_empty() {
        return Err("프로젝트 이름을 입력해 주세요.".into());
    }
    if kind.trim().is_empty() || command.trim().is_empty() {
        return Err("에이전트 종류와 실행 명령을 확인해 주세요.".into());
    }
    Ok(())
}

#[tauri::command]
pub fn create_project_with_default_agent(
    store: tauri::State<'_, StoreState>,
    name: String,
    path: String,
    kind: String,
    command: String,
) -> Result<Project, String> {
    validate_default_workspace_input(&name, &kind, &command)?;
    let workspace = git::inspect_existing_workspace(&path)?;
    let mut conn = store.0.lock().map_err(|error| error.to_string())?;
    store::repo::insert_project_with_default_agent(
        &mut conn,
        name.trim(),
        &workspace.path,
        kind.trim(),
        command.trim(),
        &workspace.branch,
        now_ms() as i64,
    )
    .map_err(|error| error.to_string())
}
```

`src-tauri/src/lib.rs`의 handler에 다음 항목을 추가한다.

```rust
commands::create_project_with_default_agent,
```

- [ ] **Step 4: Rust 전체 테스트와 정적 분석을 실행한다**

Run: `cd src-tauri && cargo test`

Expected: 전체 PASS.

Run: `cd src-tauri && cargo clippy --all-targets --all-features -- -D warnings`

Expected: 경고 없이 종료 코드 0.

- [ ] **Step 5: Tauri 연결을 커밋한다**

```bash
git add src-tauri/src/commands.rs src-tauri/src/lib.rs
git commit -m "feat: 기본 작업환경 프로젝트 생성 명령 연결"
```

### Task 4: 프런트엔드 생성 상태와 IPC 갱신

**Files:**
- Modify: `src/lib/ipc/projects.ts`
- Modify: `src/lib/stores/projects.svelte.ts`
- Modify: `src/lib/stores/projects.svelte.test.ts`

**Interfaces:**
- Consumes: Tauri `create_project_with_default_agent`
- Produces: `createProject(name: string, path: string, kind: AgentKind, command: string): Promise<Project>`, `projectStore.addProject(...): Promise<Project>`

- [ ] **Step 1: 프로젝트 저장소가 에이전트 설정을 전달하고 결과를 반환하는 테스트로 바꾼다**

```ts
vi.mock("$lib/ipc/projects", () => ({
  listProjects: vi.fn(),
  createProject: vi.fn(),
  deleteProject: vi.fn(),
  createAgent: vi.fn(),
  deleteAgent: vi.fn(),
  agentWorktreeHasChanges: vi.fn(),
}));

it("addProject()가 기본 작업환경 설정을 전달하고 생성 결과를 반환한다", async () => {
  (ipc.listProjects as any).mockResolvedValue([]);
  (ipc.createProject as any).mockResolvedValue(sampleProject);
  const store = createProjectStore();
  await store.load();

  const created = await store.addProject("proj", "/tmp/p", "codex", "codex");

  expect(ipc.createProject).toHaveBeenCalledWith("proj", "/tmp/p", "codex", "codex");
  expect(created).toEqual(sampleProject);
  expect(store.projects[0].agents).toHaveLength(1);
});
```

- [ ] **Step 2: Vitest 대상 테스트를 실행해 실패를 확인한다**

Run: `pnpm test -- src/lib/stores/projects.svelte.test.ts`

Expected: `addProject` 인수 또는 반환값 불일치로 FAIL.

- [ ] **Step 3: IPC와 저장소 시그니처를 구현한다**

```ts
export function createProject(
  name: string,
  path: string,
  kind: AgentKind,
  command: string,
): Promise<Project> {
  return invoke<Project>("create_project_with_default_agent", { name, path, kind, command });
}
```

```ts
async addProject(
  name: string,
  path: string,
  kind: AgentKind,
  command: string,
): Promise<Project> {
  const project = await ipc.createProject(name, path, kind, command);
  projects = [...projects, project];
  return project;
},
```

`projects.svelte.ts`에 `AgentKind` 타입 import를 추가한다.

- [ ] **Step 4: 프로젝트 저장소 테스트를 다시 실행한다**

Run: `pnpm test -- src/lib/stores/projects.svelte.test.ts`

Expected: 전체 PASS.

- [ ] **Step 5: 프런트 상태 연결을 커밋한다**

```bash
git add src/lib/ipc/projects.ts src/lib/stores/projects.svelte.ts src/lib/stores/projects.svelte.test.ts
git commit -m "feat: 기본 작업환경 프로젝트 IPC 연결"
```

### Task 5: 프로젝트 추가 창에서 첫 에이전트 선택

**Files:**
- Modify: `src/lib/components/shell/ProjectDialog.svelte`

**Interfaces:**
- Consumes: `agentKindLabels`, `agentKindDefaults`, `projectStore.addProject`, `shell.selectAgent`
- Produces: 에이전트 종류 선택과 기본 작업환경 자동 진입 UI

- [ ] **Step 1: 프로젝트 다이얼로그 상태와 제출 흐름을 구현한다**

```ts
import * as Select from "$lib/components/ui/select";
import type { AgentKind } from "$lib/types";
import { agentKindDefaults, agentKindLabels } from "$lib/data/labels";
import { shell } from "$lib/stores/shell.svelte";

let kind = $state<AgentKind>("claude-code");
let submitting = $state(false);

async function submit() {
  if (submitting) return;
  error = "";
  submitting = true;
  try {
    const project = await projectStore.addProject(
      name.trim(),
      path.trim(),
      kind,
      agentKindDefaults[kind],
    );
    const defaultAgent = project.agents[0];
    if (defaultAgent) shell.selectAgent(defaultAgent.id);
    open = false;
    name = "";
    path = "";
    kind = "claude-code";
  } catch (e) {
    error = String(e);
  } finally {
    submitting = false;
  }
}
```

이름과 경로 입력 사이에 다음 선택 UI를 추가한다.

```svelte
<div class="flex flex-col gap-1.5">
  <Label>첫 작업환경 에이전트</Label>
  <Select.Root
    type="single"
    value={kind}
    onValueChange={(value) => (kind = value as AgentKind)}
  >
    <Select.Trigger>{agentKindLabels[kind]}</Select.Trigger>
    <Select.Content>
      {#each Object.keys(agentKindLabels) as value (value)}
        <Select.Item value={value}>{agentKindLabels[value as AgentKind]}</Select.Item>
      {/each}
    </Select.Content>
  </Select.Root>
  <p class="text-[10px] text-muted-foreground">
    기존 프로젝트 디렉터리와 현재 checkout 브랜치를 그대로 사용합니다.
  </p>
</div>
```

제출 버튼은 중복 제출을 막는다.

```svelte
<Button onclick={submit} disabled={submitting || !name.trim() || !path.trim()}>
  {submitting ? "추가 중…" : "추가"}
</Button>
```

- [ ] **Step 2: TypeScript/Svelte 정적 검사를 실행한다**

Run: `pnpm check`

Expected: 오류 0개, 경고 0개.

- [ ] **Step 3: 전체 프런트엔드 테스트와 빌드를 실행한다**

Run: `pnpm test`

Expected: 전체 PASS.

Run: `pnpm build`

Expected: Vite 프로덕션 빌드 성공.

- [ ] **Step 4: 프로젝트 추가 UI를 커밋한다**

```bash
git add src/lib/components/shell/ProjectDialog.svelte
git commit -m "feat: 프로젝트 추가 시 기본 작업환경 생성"
```

### Task 6: 전체 회귀 검증

**Files:**
- Verify only

**Interfaces:**
- Consumes: Tasks 1–5 전체 결과
- Produces: 완료 근거

- [ ] **Step 1: 전체 프런트엔드 검증을 실행한다**

Run: `pnpm test && pnpm check && pnpm build`

Expected: 모든 명령 종료 코드 0.

- [ ] **Step 2: 전체 Rust 검증을 실행한다**

Run: `cd src-tauri && cargo test && cargo clippy --all-targets --all-features -- -D warnings`

Expected: 전체 테스트 PASS, Clippy 경고 0개.

- [ ] **Step 3: 변경 범위와 커밋 상태를 확인한다**

Run: `git status --short && git log --oneline -7`

Expected: 작업 트리가 깨끗하고 설계 문서부터 기능 구현까지 기능 단위 커밋이 표시된다.
