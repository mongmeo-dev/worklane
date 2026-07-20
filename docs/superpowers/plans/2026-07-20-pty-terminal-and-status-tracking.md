# PTY 터미널 · Resizable 패널 · 3계층 상태 트래킹 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 정적 mock 앱 셸에 실제 PTY 터미널(xterm.js + portable-pty), 사이드바↔메인 Resizable 패널, 3계층(프로세스/출력무변화/에이전트훅) 에이전트 상태 트래킹을 연동한다.

**Architecture:** Rust 백엔드가 PTY 세션을 소유(portable-pty + DashMap)하고, 출력 펌프 스레드가 바이트를 xterm용 Channel과 상태 엔진으로 분기한다. 세 신호(①프로세스 종료 ②출력 무변화 타이머 ③상태파일 감시)를 순수 함수 리듀서 `StatusEngine::reduce()`가 종합해 `AgentStatus`를 확정하고 프론트로 emit한다. 프론트는 Svelte 5 + xterm.js로 터미널을 렌더하고 IPC 래퍼/스토어로 상태를 구독한다.

**Tech Stack:** Tauri v2, Rust(portable-pty, dashmap, serde, serde_json), Svelte 5(runes), TypeScript, @xterm/xterm, @xterm/addon-fit, paneforge(resizable), pnpm, mise.

## Global Constraints

- 모든 터미널 커맨드는 환경변수 주입을 위해 `mise exec -- ` 접두사로 실행한다 (예: `mise exec node@24.18.0 -- pnpm ...`, `mise exec -- cargo ...`).
- 커밋 메시지는 한글로 작성한다. Co-Author를 포함하지 않는다. 한 커밋에 한 기능 변경만 포함한다.
- 코드 수정 커밋에는 `[ci skip]`을 붙이지 않는다. 문서 전용 커밋에만 붙인다.
- 문서/주석은 코드·고유명사를 제외하고 한글로 작성한다.
- main 브랜치에서 작업하는 경우 반드시 사전에 `git pull`한다 (원격이 없으면 생략).
- 출력 바이트는 Rust에서 `String` 변환 없이 `Vec<u8>`로 프론트에 전달한다 (멀티바이트 깨짐 방지).
- 블로킹 `reader.read()`는 반드시 전용 `std::thread`에서 실행한다. PTY open/spawn은 `tauri::async_runtime::spawn_blocking`으로 감싼다.
- 상수: `IDLE_THRESHOLD_MS = 2000`, `HOOK_STALE_MS = 10000`.
- 상태 우선순위: 프로세스 종료(최우선 게이트) > 신선한 훅(③) > 출력 무변화(②).
- Node 버전 `24.18.0`, 패키지 매니저 pnpm. 프론트 검증은 `pnpm check`(svelte-check)와 `pnpm build`.

## File Structure

**Rust 백엔드 (`src-tauri/src/`):**
- `status/mod.rs` — status 모듈 공개 인터페이스
- `status/inputs.rs` — `AgentStatus`, `HookStatus`, `StatusInputs` 타입 + 상수
- `status/engine.rs` — `StatusEngine::reduce()` 순수 함수 + 단위테스트
- `status/poller.rs` — 250ms 주기로 세 신호를 모아 `reduce`하고 변경분을 emit. ③ 상태파일은 이 폴러가 `status.json`의 mtime/내용을 폴링하는 방식으로 처리한다(별도 notify 워처 없이 단일 루프로 단순화).
- `pty/mod.rs` — pty 모듈 공개 인터페이스
- `pty/session.rs` — `Session` 구조체, 세션별 상태 스냅샷 + 출력 타임스탬프
- `pty/manager.rs` — `SessionManager`(DashMap) + create/write/resize/close 로직
- `commands.rs` — `#[tauri::command]` 정의 (프론트 API 표면)
- `lib.rs` — 모듈 선언, Builder에 State manage + 커맨드 등록

**프론트엔드 (`src/lib/`):**
- `ipc/pty.ts` — create/write/resize/close invoke 래퍼 + `PtyOutput` 타입
- `ipc/status.ts` — `status-changed` 이벤트 listen 래퍼
- `stores/sessions.svelte.ts` — 세션별 `AgentStatus` 스토어(`$state` 룬)
- `components/shell/Terminal.svelte` — xterm.js 마운트 + PTY 연동
- `components/shell/MainPanel.svelte` — [수정] placeholder → `<Terminal/>`
- `components/shell/Sidebar.svelte` — [수정] 실시간 상태 스토어 구독
- `App.svelte` — [수정] paneforge Resizable로 사이드바↔메인 래핑 + localStorage

---

## Phase 1 — 상태 엔진 (순수 로직, TDD)

### Task 1: 상태 타입 정의 (status/inputs.rs)

**Files:**
- Create: `src-tauri/src/status/mod.rs`
- Create: `src-tauri/src/status/inputs.rs`
- Modify: `src-tauri/src/lib.rs` (모듈 선언 추가)

**Interfaces:**
- Produces:
  - `enum AgentStatus { Running, Idle, Blocked, Done }` — serde로 `"running"|"idle"|"blocked"|"done"` 직렬화
  - `enum HookStatus { Working, WaitingInput, Done }`
  - `struct StatusInputs { process_alive: bool, exit_code: Option<i32>, ms_since_last_output: u64, hook_status: Option<HookStatus>, hook_fresh: bool }`
  - `const IDLE_THRESHOLD_MS: u64 = 2000;`
  - `const HOOK_STALE_MS: u64 = 10000;`

- [ ] **Step 1: inputs.rs 작성**

`src-tauri/src/status/inputs.rs`:
```rust
use serde::{Deserialize, Serialize};

/// 에이전트의 실행 상태. 프론트의 AgentStatus 문자열과 일치하도록 직렬화된다.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum AgentStatus {
    Running,
    Idle,
    Blocked,
    Done,
}

/// 에이전트 훅(상태파일)이 노출하는 값. 상태파일 JSON의 "status" 필드와 대응.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HookStatus {
    Working,
    WaitingInput,
    Done,
}

/// 상태 판정 리듀서의 입력 스냅샷.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct StatusInputs {
    /// ① 프로세스 생존 여부
    pub process_alive: bool,
    /// ① 종료 시 exit code (살아있으면 None)
    pub exit_code: Option<i32>,
    /// ② 마지막 출력으로부터 경과(ms)
    pub ms_since_last_output: u64,
    /// ③ 상태파일이 알린 값 (없으면 None)
    pub hook_status: Option<HookStatus>,
    /// ③ 상태파일이 최근(HOOK_STALE_MS 이내) 것인가
    pub hook_fresh: bool,
}

/// ② 출력 무변화가 이 값을 넘으면 Idle로 본다.
pub const IDLE_THRESHOLD_MS: u64 = 2000;
/// ③ 상태파일이 이 값보다 오래되면 무시한다.
pub const HOOK_STALE_MS: u64 = 10000;
```

- [ ] **Step 2: mod.rs 작성**

`src-tauri/src/status/mod.rs`:
```rust
pub mod engine;
pub mod inputs;

pub use inputs::{AgentStatus, HookStatus, StatusInputs, HOOK_STALE_MS, IDLE_THRESHOLD_MS};
```

- [ ] **Step 3: lib.rs에 모듈 선언 추가**

`src-tauri/src/lib.rs` 최상단(파일 첫 줄 `// Learn more...` 위)에 추가:
```rust
mod status;
```

- [ ] **Step 4: 컴파일 확인**

Run: `cd src-tauri && mise exec -- cargo check`
Expected: 경고는 있을 수 있으나(미사용 코드) 에러 없이 `Finished`.

- [ ] **Step 5: 커밋**

```bash
git add src-tauri/src/status/mod.rs src-tauri/src/status/inputs.rs src-tauri/src/lib.rs
git commit -m "feat: 에이전트 상태 판정용 타입 정의"
```

### Task 2: StatusEngine::reduce() 순수 함수 + 단위테스트 (status/engine.rs)

**Files:**
- Create: `src-tauri/src/status/engine.rs`
- Modify: `src-tauri/src/status/mod.rs` (이미 `pub mod engine;` 선언됨 — Task 1에서 처리)

**Interfaces:**
- Consumes: `AgentStatus`, `HookStatus`, `StatusInputs`, `IDLE_THRESHOLD_MS` (Task 1)
- Produces: `pub fn reduce(inputs: &StatusInputs) -> AgentStatus`

- [ ] **Step 1: 실패하는 테스트 먼저 작성**

`src-tauri/src/status/engine.rs`:
```rust
use crate::status::inputs::{AgentStatus, HookStatus, StatusInputs, IDLE_THRESHOLD_MS};

// (구현은 Step 3에서 채운다)

#[cfg(test)]
mod tests {
    use super::*;

    fn base() -> StatusInputs {
        StatusInputs {
            process_alive: true,
            exit_code: None,
            ms_since_last_output: 0,
            hook_status: None,
            hook_fresh: false,
        }
    }

    #[test]
    fn 프로세스_죽으면_훅과_출력_무관하게_done() {
        let inputs = StatusInputs {
            process_alive: false,
            exit_code: Some(0),
            hook_status: Some(HookStatus::Working), // 훅이 Working이라 해도
            hook_fresh: true,
            ms_since_last_output: 0, // 출력이 최근이어도
            ..base()
        };
        assert_eq!(reduce(&inputs), AgentStatus::Done);
    }

    #[test]
    fn 신선한_훅_working이면_running() {
        let inputs = StatusInputs {
            hook_status: Some(HookStatus::Working),
            hook_fresh: true,
            ms_since_last_output: 999_999, // 출력이 오래돼도 훅 우선
            ..base()
        };
        assert_eq!(reduce(&inputs), AgentStatus::Running);
    }

    #[test]
    fn 신선한_훅_waiting_input이면_blocked() {
        let inputs = StatusInputs {
            hook_status: Some(HookStatus::WaitingInput),
            hook_fresh: true,
            ms_since_last_output: 999_999,
            ..base()
        };
        assert_eq!(reduce(&inputs), AgentStatus::Blocked);
    }

    #[test]
    fn 신선한_훅_done이면_done() {
        let inputs = StatusInputs {
            hook_status: Some(HookStatus::Done),
            hook_fresh: true,
            ..base()
        };
        assert_eq!(reduce(&inputs), AgentStatus::Done);
    }

    #[test]
    fn 훅없고_최근출력이면_running() {
        let inputs = StatusInputs {
            hook_status: None,
            ms_since_last_output: IDLE_THRESHOLD_MS - 1,
            ..base()
        };
        assert_eq!(reduce(&inputs), AgentStatus::Running);
    }

    #[test]
    fn 훅없고_출력_멈추면_idle() {
        let inputs = StatusInputs {
            hook_status: None,
            ms_since_last_output: IDLE_THRESHOLD_MS,
            ..base()
        };
        assert_eq!(reduce(&inputs), AgentStatus::Idle);
    }

    #[test]
    fn 오래된_훅은_무시하고_출력스트림으로_판정() {
        // 훅이 WaitingInput이지만 오래됨(hook_fresh=false) → 무시하고 ②로 fallback
        let inputs = StatusInputs {
            hook_status: Some(HookStatus::WaitingInput),
            hook_fresh: false,
            ms_since_last_output: 100, // 최근 출력
            ..base()
        };
        assert_eq!(reduce(&inputs), AgentStatus::Running);
    }

    #[test]
    fn tmux_시나리오_프로세스_살아있고_훅없고_출력활발이면_running() {
        // tmux 클라이언트가 살아있고, 훅 없고, 출력이 활발한 상황
        // 유사 도구가 실패하는 케이스를 못박는다.
        let inputs = StatusInputs {
            process_alive: true,
            hook_status: None,
            hook_fresh: false,
            ms_since_last_output: 200,
            ..base()
        };
        assert_eq!(reduce(&inputs), AgentStatus::Running);
    }
}
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd src-tauri && mise exec -- cargo test --lib status::engine`
Expected: 컴파일 에러 — `cannot find function reduce`.

- [ ] **Step 3: reduce() 구현**

`src-tauri/src/status/engine.rs`의 상단(주석 `// (구현은...)` 자리)에 삽입:
```rust
/// 세 신호를 종합해 최종 상태를 판정하는 순수 함수.
/// 우선순위: 프로세스 종료(최우선 게이트) > 신선한 훅 > 출력 무변화.
pub fn reduce(inputs: &StatusInputs) -> AgentStatus {
    // ① 프로세스가 죽었으면 무조건 Done
    if !inputs.process_alive {
        return AgentStatus::Done;
    }

    // ③ 신선한 훅이 있으면 그 값을 신뢰
    if inputs.hook_fresh {
        if let Some(hook) = inputs.hook_status {
            return match hook {
                HookStatus::Working => AgentStatus::Running,
                HookStatus::WaitingInput => AgentStatus::Blocked,
                HookStatus::Done => AgentStatus::Done,
            };
        }
    }

    // ② 훅이 없거나 오래됐으면 출력 스트림으로 판정
    if inputs.ms_since_last_output < IDLE_THRESHOLD_MS {
        AgentStatus::Running
    } else {
        AgentStatus::Idle
    }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd src-tauri && mise exec -- cargo test --lib status::engine`
Expected: 8개 테스트 모두 PASS (`test result: ok. 8 passed`).

- [ ] **Step 5: 커밋**

```bash
git add src-tauri/src/status/engine.rs
git commit -m "feat: 3계층 상태 판정 리듀서 구현 및 단위테스트"
```

## Phase 2 — PTY 매니저 (I/O, 수동 검증)

### Task 3: 의존성 추가 (Cargo.toml)

**Files:**
- Modify: `src-tauri/Cargo.toml`

- [ ] **Step 1: 의존성 추가**

`src-tauri/Cargo.toml`의 `[dependencies]` 섹션에 추가:
```toml
portable-pty = "0.9"
dashmap = "6"
```

(`serde_json`은 이미 존재하므로 추가 불필요. ③ 상태파일은 폴러가 직접 폴링하므로 notify crate는 쓰지 않는다.)

- [ ] **Step 2: 빌드 확인**

Run: `cd src-tauri && mise exec -- cargo build`
Expected: 새 crate들이 컴파일되고 에러 없이 `Finished`. (최초 빌드는 수 분 소요 가능.)

- [ ] **Step 3: 커밋**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "chore: PTY 의존성 추가(portable-pty, dashmap)"
```

### Task 4: Session 구조체 (pty/session.rs)

**Files:**
- Create: `src-tauri/src/pty/mod.rs`
- Create: `src-tauri/src/pty/session.rs`
- Modify: `src-tauri/src/lib.rs` (`mod pty;` 추가)

**Interfaces:**
- Produces:
  - `struct Session` — 필드: `writer: Mutex<Box<dyn Write + Send>>`, `master: Mutex<Box<dyn MasterPty + Send>>`, `child: Mutex<Box<dyn Child + Send + Sync>>`, `last_output_ms: AtomicU64`(UNIX epoch ms), `hook_dir: PathBuf`
  - `impl Session`: `pub fn mark_output(&self, now_ms: u64)` — last_output_ms를 갱신
  - `pub fn now_ms() -> u64` — 현재 시각을 UNIX epoch ms로 반환

- [ ] **Step 1: session.rs 작성**

`src-tauri/src/pty/session.rs`:
```rust
use std::io::Write;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use portable_pty::{Child, MasterPty};

/// 하나의 PTY 세션. 필드별 Mutex로 펌프 스레드/입력/리사이즈/종료가
/// 서로 다른 핸들에 동시 접근할 수 있게 한다.
pub struct Session {
    pub writer: Mutex<Box<dyn Write + Send>>,
    pub master: Mutex<Box<dyn MasterPty + Send>>,
    pub child: Mutex<Box<dyn Child + Send + Sync>>,
    /// ② 마지막 출력 시각 (UNIX epoch ms). 펌프 스레드가 갱신한다.
    pub last_output_ms: AtomicU64,
    /// ③ 이 세션의 상태파일이 놓이는 디렉토리.
    pub hook_dir: PathBuf,
}

impl Session {
    /// 출력이 발생했음을 기록한다.
    pub fn mark_output(&self, now_ms: u64) {
        self.last_output_ms.store(now_ms, Ordering::Relaxed);
    }
}

/// 현재 시각을 UNIX epoch 밀리초로 반환.
pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}
```

- [ ] **Step 2: mod.rs 작성**

`src-tauri/src/pty/mod.rs`:
```rust
pub mod manager;
pub mod session;

pub use manager::{PtyState, SessionManager};
pub use session::{now_ms, Session};
```

- [ ] **Step 3: lib.rs에 모듈 선언 추가**

`src-tauri/src/lib.rs`의 `mod status;` 아래에 추가:
```rust
mod pty;
```

- [ ] **Step 4: 컴파일 확인 (manager 미작성이라 임시로 mod.rs의 manager 참조 주석 처리)**

`src-tauri/src/pty/mod.rs`를 임시로 다음처럼(manager는 Task 5에서 채움):
```rust
pub mod session;

pub use session::{now_ms, Session};
```

Run: `cd src-tauri && mise exec -- cargo check`
Expected: 에러 없이 `Finished` (미사용 경고 허용).

- [ ] **Step 5: 커밋**

```bash
git add src-tauri/src/pty/mod.rs src-tauri/src/pty/session.rs src-tauri/src/lib.rs
git commit -m "feat: PTY Session 구조체 정의"
```

### Task 5: SessionManager + 출력 펌프 (pty/manager.rs)

**Files:**
- Create: `src-tauri/src/pty/manager.rs`
- Modify: `src-tauri/src/pty/mod.rs` (manager 재노출 복구)

**Interfaces:**
- Consumes: `Session`, `now_ms` (Task 4); `AgentStatus`(Task 1)
- Produces:
  - `struct PtyState(pub Arc<DashMap<String, Arc<Session>>>)` — Tauri State
  - `struct PtyOutput { session_id: String, bytes: Vec<u8> }` (serde Serialize, camelCase)
  - `pub fn create(state, session_id, cmd, cwd, rows, cols, on_output: Channel<PtyOutput>) -> Result<(), String>`
  - `pub fn write(state, session_id, data: Vec<u8>) -> Result<(), String>`
  - `pub fn resize(state, session_id, rows, cols) -> Result<(), String>`
  - `pub fn close(state, session_id) -> Result<(), String>`

- [ ] **Step 1: manager.rs 작성**

`src-tauri/src/pty/manager.rs`:
```rust
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::atomic::AtomicU64;
use std::sync::{Arc, Mutex};

use dashmap::DashMap;
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use serde::Serialize;
use tauri::ipc::Channel;

use crate::pty::session::{now_ms, Session};

/// 세션 ID → 세션 맵. Tauri State로 관리된다.
pub struct PtyState(pub Arc<DashMap<String, Arc<Session>>>);

impl Default for PtyState {
    fn default() -> Self {
        PtyState(Arc::new(DashMap::new()))
    }
}

/// 프론트로 스트리밍되는 출력 페이로드.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PtyOutput {
    pub session_id: String,
    pub bytes: Vec<u8>,
}

/// PTY 세션을 생성하고 출력 펌프 스레드를 시작한다.
pub fn create(
    state: &PtyState,
    session_id: String,
    cmd: String,
    cwd: String,
    rows: u16,
    cols: u16,
    hook_dir: PathBuf,
    on_output: Channel<PtyOutput>,
) -> Result<(), String> {
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
        .map_err(|e| e.to_string())?;

    let mut builder = CommandBuilder::new(cmd);
    builder.cwd(cwd);
    builder.env("TERM", "xterm-256color");

    let child = pair.slave.spawn_command(builder).map_err(|e| e.to_string())?;
    let reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;

    let session = Arc::new(Session {
        writer: Mutex::new(writer),
        master: Mutex::new(pair.master),
        child: Mutex::new(child),
        last_output_ms: AtomicU64::new(now_ms()),
        hook_dir,
    });
    state.0.insert(session_id.clone(), session.clone());

    // 출력 펌프: 블로킹 read를 전용 스레드에서 돌린다.
    let sid = session_id.clone();
    let pump_session = session.clone();
    std::thread::spawn(move || {
        let mut reader = reader;
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break, // EOF/에러 = 프로세스 종료
                Ok(n) => {
                    pump_session.mark_output(now_ms()); // ② 출력 타임스탬프 갱신
                    let payload = PtyOutput {
                        session_id: sid.clone(),
                        bytes: buf[..n].to_vec(), // 바이트 그대로
                    };
                    if on_output.send(payload).is_err() {
                        break;
                    }
                }
            }
        }
    });

    Ok(())
}

/// 세션에 입력 바이트를 쓴다.
pub fn write(state: &PtyState, session_id: &str, data: Vec<u8>) -> Result<(), String> {
    if let Some(s) = state.0.get(session_id) {
        s.writer
            .lock()
            .map_err(|_| "writer lock 실패".to_string())?
            .write_all(&data)
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// 세션 PTY를 리사이즈한다.
pub fn resize(state: &PtyState, session_id: &str, rows: u16, cols: u16) -> Result<(), String> {
    if let Some(s) = state.0.get(session_id) {
        s.master
            .lock()
            .map_err(|_| "master lock 실패".to_string())?
            .resize(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// 세션을 종료하고 맵에서 제거한다.
pub fn close(state: &PtyState, session_id: &str) -> Result<(), String> {
    if let Some((_, s)) = state.0.remove(session_id) {
        if let Ok(mut child) = s.child.lock() {
            let _ = child.kill();
            for _ in 0..40 {
                match child.try_wait() {
                    Ok(Some(_)) => break,
                    Ok(None) => std::thread::sleep(std::time::Duration::from_millis(25)),
                    Err(_) => break,
                }
            }
        }
    }
    Ok(())
}
```

- [ ] **Step 2: mod.rs의 manager 재노출 복구**

`src-tauri/src/pty/mod.rs`를 최종 형태로:
```rust
pub mod manager;
pub mod session;

pub use manager::{create, close, resize, write, PtyOutput, PtyState};
pub use session::{now_ms, Session};
```

- [ ] **Step 3: 컴파일 확인**

Run: `cd src-tauri && mise exec -- cargo check`
Expected: 에러 없이 `Finished` (미사용 경고 허용 — 커맨드는 Task 6에서 연결).

- [ ] **Step 4: 커밋**

```bash
git add src-tauri/src/pty/manager.rs src-tauri/src/pty/mod.rs
git commit -m "feat: SessionManager 및 PTY 출력 펌프 구현"
```

## Phase 3 — Tauri 커맨드 + 프론트 터미널 연동 (시각 검증)

### Task 6: Tauri 커맨드 정의 + 등록 (commands.rs, lib.rs)

**Files:**
- Create: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: `pty::{create, write, resize, close, PtyOutput, PtyState}` (Task 5)
- Produces (tauri commands): `create_session`, `write_to_pty`, `resize_pty`, `close_session`

- [ ] **Step 1: commands.rs 작성**

`src-tauri/src/commands.rs`:
```rust
use std::path::PathBuf;

use tauri::ipc::Channel;
use tauri::Manager;

use crate::pty::{self, PtyOutput, PtyState};

/// 세션의 상태파일 디렉토리 경로를 계산한다. (app_data_dir/hooks/<session_id>)
fn hook_dir_for(app: &tauri::AppHandle, session_id: &str) -> Result<PathBuf, String> {
    let base = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("hooks")
        .join(session_id);
    std::fs::create_dir_all(&base).map_err(|e| e.to_string())?;
    Ok(base)
}

#[tauri::command]
pub async fn create_session(
    app: tauri::AppHandle,
    state: tauri::State<'_, PtyState>,
    session_id: String,
    cmd: String,
    cwd: String,
    rows: u16,
    cols: u16,
    on_output: Channel<PtyOutput>,
) -> Result<(), String> {
    let hook_dir = hook_dir_for(&app, &session_id)?;
    let state_inner = state.0.clone();
    // 블로킹 가능성이 있는 open/spawn을 별도 스레드에서.
    let sid = session_id.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let temp = PtyState(state_inner);
        pty::create(&temp, sid, cmd, cwd, rows, cols, hook_dir, on_output)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn write_to_pty(
    state: tauri::State<'_, PtyState>,
    session_id: String,
    data: Vec<u8>,
) -> Result<(), String> {
    pty::write(&state, &session_id, data)
}

#[tauri::command]
pub fn resize_pty(
    state: tauri::State<'_, PtyState>,
    session_id: String,
    rows: u16,
    cols: u16,
) -> Result<(), String> {
    pty::resize(&state, &session_id, rows, cols)
}

#[tauri::command]
pub fn close_session(
    state: tauri::State<'_, PtyState>,
    session_id: String,
) -> Result<(), String> {
    pty::close(&state, &session_id)
}
```

- [ ] **Step 2: PtyState에 Clone 가능한 내부 접근 보장**

`src-tauri/src/pty/manager.rs`의 `PtyState`가 `state.0.clone()`으로 내부 `Arc`를 복제해 새 `PtyState`를 만들 수 있어야 한다(이미 `pub Arc<...>`라 가능). 확인만 하고 변경 불필요.

- [ ] **Step 3: lib.rs 갱신 (모듈 선언 + State manage + 핸들러 등록)**

`src-tauri/src/lib.rs` 전체를 다음으로 교체:
```rust
mod status;
mod pty;
mod commands;

use pty::PtyState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(PtyState::default())
        .invoke_handler(tauri::generate_handler![
            commands::create_session,
            commands::write_to_pty,
            commands::resize_pty,
            commands::close_session,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 4: 컴파일 확인**

Run: `cd src-tauri && mise exec -- cargo check`
Expected: 에러 없이 `Finished`.

- [ ] **Step 5: 커밋**

```bash
git add src-tauri/src/commands.rs src-tauri/src/lib.rs
git commit -m "feat: PTY 세션 Tauri 커맨드 정의 및 등록"
```

### Task 7: capabilities 권한 확인

**Files:**
- Modify: `src-tauri/capabilities/default.json`

- [ ] **Step 1: 이벤트 권한 추가**

`src-tauri/capabilities/default.json`의 `permissions` 배열에 `"core:event:default"`를 추가 (Channel만으로는 불필요하지만 이후 emit 사용 대비):
```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Capability for the main window",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "core:event:default",
    "opener:default"
  ]
}
```

- [ ] **Step 2: 커밋**

```bash
git add src-tauri/capabilities/default.json
git commit -m "chore: 이벤트 권한(core:event:default) 추가"
```

### Task 8: xterm 패키지 설치 + IPC 래퍼 (ipc/pty.ts)

**Files:**
- Modify: `package.json` (패키지 설치)
- Create: `src/lib/ipc/pty.ts`

**Interfaces:**
- Produces:
  - `type PtyOutput = { sessionId: string; bytes: number[] }`
  - `createSession(opts: { sessionId, cmd, cwd, rows, cols, onOutput: (o: PtyOutput) => void }): Promise<void>`
  - `writeToPty(sessionId: string, data: Uint8Array): Promise<void>`
  - `resizePty(sessionId: string, rows: number, cols: number): Promise<void>`
  - `closeSession(sessionId: string): Promise<void>`

- [ ] **Step 1: 패키지 설치**

Run: `mise exec node@24.18.0 -- pnpm add @xterm/xterm @xterm/addon-fit`
Expected: 두 패키지가 dependencies에 추가됨.

- [ ] **Step 2: ipc/pty.ts 작성**

`src/lib/ipc/pty.ts`:
```typescript
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
```

- [ ] **Step 3: 타입체크**

Run: `mise exec node@24.18.0 -- pnpm check`
Expected: 0 errors.

- [ ] **Step 4: 커밋**

```bash
git add package.json pnpm-lock.yaml src/lib/ipc/pty.ts
git commit -m "feat: xterm 설치 및 PTY IPC 래퍼 추가"
```

### Task 9: Terminal.svelte + MainPanel 연동 (시각 검증)

**Files:**
- Create: `src/lib/components/shell/Terminal.svelte`
- Modify: `src/lib/components/shell/MainPanel.svelte`

**Interfaces:**
- Consumes: `createSession, writeToPty, resizePty, closeSession, PtyOutput` (Task 8)
- Props: `Terminal.svelte`는 `{ sessionId: string; cmd: string; cwd: string }`를 받는다.

- [ ] **Step 1: Terminal.svelte 작성**

`src/lib/components/shell/Terminal.svelte`:
```svelte
<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { Terminal } from "@xterm/xterm";
  import { FitAddon } from "@xterm/addon-fit";
  import "@xterm/xterm/css/xterm.css";
  import { createSession, writeToPty, resizePty, closeSession } from "$lib/ipc/pty";

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

  onMount(async () => {
    term = new Terminal({ cursorBlink: true, fontFamily: "monospace", fontSize: 13 });
    fit = new FitAddon();
    term.loadAddon(fit);
    term.open(el);
    fit.fit();

    await createSession({
      sessionId,
      cmd,
      cwd,
      rows: term.rows,
      cols: term.cols,
      onOutput: (o) => term?.write(new Uint8Array(o.bytes)),
    });

    term.onData((data) => {
      writeToPty(sessionId, new TextEncoder().encode(data));
    });

    ro = new ResizeObserver(() => {
      fit?.fit();
      if (term) resizePty(sessionId, term.rows, term.cols);
    });
    ro.observe(el);
  });

  onDestroy(() => {
    ro?.disconnect();
    closeSession(sessionId);
    term?.dispose();
  });
</script>

<div bind:this={el} class="h-full w-full"></div>
```

- [ ] **Step 2: MainPanel.svelte 수정 (placeholder → Terminal)**

`src/lib/components/shell/MainPanel.svelte`의 `import` 블록에 추가:
```svelte
  import Terminal from "./Terminal.svelte";
```

그리고 터미널 탭 콘텐츠(현재 점선 placeholder div, 47~58행)를 다음으로 교체:
```svelte
      <Tabs.Content value="terminal" class="min-h-0 flex-1 p-2">
        {#key agent.id}
          <div class="h-full w-full overflow-hidden rounded-lg border bg-black p-1">
            <Terminal
              sessionId={agent.id}
              cmd={defaultShell()}
              cwd="."
            />
          </div>
        {/key}
      </Tabs.Content>
```

`import` 블록 아래 `<script>` 안에 셸 결정 헬퍼 추가:
```svelte
  // 플랫폼 기본 셸. Windows는 후속 대응 (현재 개발 대상은 macOS 우선).
  function defaultShell(): string {
    return "/bin/zsh";
  }
```

그리고 사용하지 않게 된 `TerminalIcon` import는 그대로 두어도 무방하나, `pnpm check`가 미사용 import를 에러로 잡으면 제거한다.

- [ ] **Step 3: 미사용 import 정리 (svelte-check가 잡을 경우)**

`TerminalIcon`을 더 이상 쓰지 않으면 `import TerminalIcon ...` 줄을 삭제한다.

- [ ] **Step 4: 타입체크**

Run: `mise exec node@24.18.0 -- pnpm check`
Expected: 0 errors.

- [ ] **Step 5: 시각 검증 (실제 앱 실행)**

Run: `mise exec node@24.18.0 -- pnpm tauri dev`
확인: 앱 창이 뜨고, 사이드바에서 에이전트를 선택하면 메인 패널 터미널 영역에 실제 zsh 프롬프트가 나타난다. `ls`, `echo 안녕하세요` 같은 명령을 입력하면 정상 출력되고 한글이 깨지지 않는다. 창 크기를 바꾸면 터미널이 리사이즈된다.
(검증 후 `Ctrl+C`로 종료.)

- [ ] **Step 6: 커밋**

```bash
git add src/lib/components/shell/Terminal.svelte src/lib/components/shell/MainPanel.svelte
git commit -m "feat: xterm.js 터미널 연동 및 메인 패널 통합"
```

## Phase 4~5 — 상태 신호 연결 + 상태파일 감시

### Task 10: 상태 폴러 + emit (status/inputs.rs 확장, pty/manager.rs, lib.rs)

**Files:**
- Create: `src-tauri/src/status/poller.rs`
- Modify: `src-tauri/src/status/mod.rs`
- Modify: `src-tauri/src/pty/session.rs` (child 종료 확인 헬퍼 추가)
- Modify: `src-tauri/src/lib.rs` (setup에서 폴러 스레드 시작)

**Interfaces:**
- Consumes: `PtyState`, `Session`, `now_ms` (Task 4~5); `reduce`, `StatusInputs`, `AgentStatus`, `HookStatus`, `HOOK_STALE_MS` (Task 1~2)
- Produces:
  - `struct StatusChanged { session_id: String, status: AgentStatus }` (Serialize, camelCase)
  - `pub fn spawn_poller(app: tauri::AppHandle, state: Arc<DashMap<String, Arc<Session>>>)` — 250ms마다 각 세션의 신호를 모아 `reduce`하고, 이전과 다르면 `status-changed` 이벤트를 emit

- [ ] **Step 1: Session에 프로세스 생존/상태파일 읽기 헬퍼 추가**

`src-tauri/src/pty/session.rs`의 `impl Session`에 메서드 추가:
```rust
    /// ① 프로세스가 아직 살아있는지 확인한다.
    pub fn is_alive(&self) -> bool {
        match self.child.lock() {
            Ok(mut child) => matches!(child.try_wait(), Ok(None)),
            Err(_) => false,
        }
    }

    /// ③ 상태파일(status.json)을 읽어 (HookStatus, 신선도)를 반환한다.
    /// 파일이 없거나 파싱 실패면 (None, false).
    pub fn read_hook(&self, now_ms_val: u64, stale_ms: u64) -> (Option<crate::status::HookStatus>, bool) {
        use std::time::{SystemTime, UNIX_EPOCH};
        let path = self.hook_dir.join("status.json");
        let Ok(meta) = std::fs::metadata(&path) else {
            return (None, false);
        };
        let mtime_ms = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        let fresh = now_ms_val.saturating_sub(mtime_ms) <= stale_ms;

        let Ok(text) = std::fs::read_to_string(&path) else {
            return (None, false);
        };
        #[derive(serde::Deserialize)]
        struct HookFile {
            status: crate::status::HookStatus,
        }
        match serde_json::from_str::<HookFile>(&text) {
            Ok(f) => (Some(f.status), fresh),
            Err(_) => (None, false),
        }
    }
```

- [ ] **Step 2: poller.rs 작성**

`src-tauri/src/status/poller.rs`:
```rust
use std::collections::HashMap;
use std::sync::atomic::Ordering;
use std::sync::Arc;

use dashmap::DashMap;
use serde::Serialize;
use tauri::Emitter;

use crate::pty::session::{now_ms, Session};
use crate::status::engine::reduce;
use crate::status::inputs::{AgentStatus, StatusInputs, HOOK_STALE_MS};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatusChanged {
    pub session_id: String,
    pub status: AgentStatus,
}

/// 250ms마다 모든 세션의 상태를 재계산하고, 변경분만 emit한다.
pub fn spawn_poller(app: tauri::AppHandle, state: Arc<DashMap<String, Arc<Session>>>) {
    std::thread::spawn(move || {
        let mut last: HashMap<String, AgentStatus> = HashMap::new();
        loop {
            std::thread::sleep(std::time::Duration::from_millis(250));
            let now = now_ms();
            for entry in state.iter() {
                let sid = entry.key().clone();
                let session = entry.value();

                let alive = session.is_alive();
                let last_out = session.last_output_ms.load(Ordering::Relaxed);
                let (hook_status, hook_fresh) = session.read_hook(now, HOOK_STALE_MS);

                let inputs = StatusInputs {
                    process_alive: alive,
                    exit_code: None,
                    ms_since_last_output: now.saturating_sub(last_out),
                    hook_status,
                    hook_fresh,
                };
                let status = reduce(&inputs);

                if last.get(&sid) != Some(&status) {
                    last.insert(sid.clone(), status);
                    let _ = app.emit(
                        "status-changed",
                        StatusChanged { session_id: sid.clone(), status },
                    );
                }
            }
        }
    });
}
```

- [ ] **Step 3: status/mod.rs에 poller 추가**

`src-tauri/src/status/mod.rs`:
```rust
pub mod engine;
pub mod inputs;
pub mod poller;

pub use inputs::{AgentStatus, HookStatus, StatusInputs, HOOK_STALE_MS, IDLE_THRESHOLD_MS};
```

- [ ] **Step 4: lib.rs의 setup에서 폴러 시작**

`src-tauri/src/lib.rs`의 Builder 체인에 `.setup(...)`를 추가 (`.manage(...)` 다음):
```rust
        .setup(|app| {
            let state = app.state::<PtyState>();
            let map = state.0.clone();
            status::poller::spawn_poller(app.handle().clone(), map);
            Ok(())
        })
```

`lib.rs` 상단 `use`를 다음처럼 보강한다 (`app.state`/`app.handle`가 `Manager` trait 메서드이므로 import 필수):
```rust
use pty::PtyState;
use tauri::Manager;
```

- [ ] **Step 5: 컴파일 확인**

Run: `cd src-tauri && mise exec -- cargo check`
Expected: 에러 없이 `Finished`.

- [ ] **Step 6: 단위테스트 회귀 확인**

Run: `cd src-tauri && mise exec -- cargo test --lib`
Expected: Task 2의 8개 테스트 여전히 PASS.

- [ ] **Step 7: 커밋**

```bash
git add src-tauri/src/status/poller.rs src-tauri/src/status/mod.rs src-tauri/src/pty/session.rs src-tauri/src/lib.rs
git commit -m "feat: 상태 폴러로 3계층 신호 종합 및 status-changed emit"
```

## Phase 6 — 프론트 상태 스토어 + Sidebar 실시간 연동

### Task 11: 상태 IPC 래퍼 + 스토어 (ipc/status.ts, stores/sessions.svelte.ts)

**Files:**
- Create: `src/lib/ipc/status.ts`
- Create: `src/lib/stores/sessions.svelte.ts`

**Interfaces:**
- Consumes: `AgentStatus` (기존 `src/lib/types.ts`)
- Produces:
  - `ipc/status.ts`: `listenStatus(cb: (e: StatusChanged) => void): Promise<UnlistenFn>`; `type StatusChanged = { sessionId: string; status: AgentStatus }`
  - `stores/sessions.svelte.ts`: `sessionStatus` — `{ get(id): AgentStatus | undefined; set(id, status): void; start(): Promise<void> }`

- [ ] **Step 1: ipc/status.ts 작성**

`src/lib/ipc/status.ts`:
```typescript
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { AgentStatus } from "$lib/types";

export type StatusChanged = { sessionId: string; status: AgentStatus };

/** status-changed 이벤트를 구독한다. */
export function listenStatus(cb: (e: StatusChanged) => void): Promise<UnlistenFn> {
  return listen<StatusChanged>("status-changed", (event) => cb(event.payload));
}
```

- [ ] **Step 2: stores/sessions.svelte.ts 작성**

`src/lib/stores/sessions.svelte.ts`:
```typescript
import type { AgentStatus } from "$lib/types";
import { listenStatus } from "$lib/ipc/status";

/** 세션(=에이전트) ID → 실시간 상태 맵. Svelte 5 룬 기반 반응형. */
class SessionStatusStore {
  private map = $state<Record<string, AgentStatus>>({});
  private started = false;

  get(id: string): AgentStatus | undefined {
    return this.map[id];
  }

  set(id: string, status: AgentStatus): void {
    this.map[id] = status;
  }

  /** status-changed 이벤트 구독을 시작한다 (앱 마운트 시 1회). */
  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    await listenStatus((e) => {
      this.map[e.sessionId] = e.status;
    });
  }
}

export const sessionStatus = new SessionStatusStore();
```

- [ ] **Step 3: 타입체크**

Run: `mise exec node@24.18.0 -- pnpm check`
Expected: 0 errors.

- [ ] **Step 4: 커밋**

```bash
git add src/lib/ipc/status.ts src/lib/stores/sessions.svelte.ts
git commit -m "feat: 상태 이벤트 구독 스토어 추가"
```

### Task 12: Sidebar/StatusDot 실시간 상태 반영 (App.svelte, Sidebar.svelte)

**Files:**
- Modify: `src/App.svelte` (스토어 start 호출)
- Modify: `src/lib/components/shell/Sidebar.svelte` (실시간 상태 우선 사용)

**Interfaces:**
- Consumes: `sessionStatus` (Task 11)

- [ ] **Step 1: App.svelte에서 스토어 시작**

`src/App.svelte`의 `<script>` 안, import 블록에 추가:
```svelte
  import { onMount } from "svelte";
  import { sessionStatus } from "$lib/stores/sessions.svelte";
```
그리고 `handleSelect` 함수 아래에 추가:
```svelte
  onMount(() => {
    sessionStatus.start();
  });
```

- [ ] **Step 2: Sidebar.svelte에서 실시간 상태 우선 표시**

`src/lib/components/shell/Sidebar.svelte`의 `<script>` import 블록에 추가:
```svelte
  import { sessionStatus } from "$lib/stores/sessions.svelte";
```

그리고 `<StatusDot status={agent.status} />` 부분을 실시간 상태가 있으면 그것을, 없으면 mock 상태를 쓰도록 교체:
```svelte
              <StatusDot status={sessionStatus.get(agent.id) ?? agent.status} />
```

- [ ] **Step 3: 타입체크**

Run: `mise exec node@24.18.0 -- pnpm check`
Expected: 0 errors.

- [ ] **Step 4: 시각 검증**

Run: `mise exec node@24.18.0 -- pnpm tauri dev`
확인: 에이전트를 선택해 터미널이 뜨면, 명령 실행 중에는 사이드바 상태 점이 초록(Running), ~2초 이상 입력 없이 조용하면 회색(Idle)으로 바뀐다. 터미널에서 `exit`하면 프로세스 종료로 상태 점이 파랑(Done)이 된다.
(검증 후 종료.)

- [ ] **Step 5: 커밋**

```bash
git add src/App.svelte src/lib/components/shell/Sidebar.svelte
git commit -m "feat: 사이드바 상태 점을 실시간 상태로 연동"
```

## Phase 7 — Resizable 패널

### Task 13: 사이드바↔메인 Resizable + localStorage (App.svelte)

**Files:**
- Modify: `src/App.svelte`
- Modify: `src/lib/components/shell/Sidebar.svelte` (고정폭 `w-72` 제거해 패널이 폭을 제어하게)

**Interfaces:**
- Consumes: paneforge `resizable` 컴포넌트 (`$lib/components/ui/resizable`)

- [ ] **Step 1: resizable export 형태 확인**

Run: `cat src/lib/components/ui/resizable/index.ts`
Expected: `Pane`, `PaneGroup`, `Handle` 계열 export 확인 (paneforge 래핑). 이름을 Step 2 import에 맞춘다.

- [ ] **Step 2: App.svelte를 Resizable 레이아웃으로 교체**

`src/App.svelte`를 다음으로 교체 (import는 Step 1에서 확인한 실제 export명에 맞춘다 — 일반적으로 `* as Resizable`):
```svelte
<script lang="ts">
  import { onMount } from "svelte";
  import type { Agent } from "$lib/types";
  import { mockProjects } from "$lib/data/mock";
  import { sessionStatus } from "$lib/stores/sessions.svelte";
  import * as Resizable from "$lib/components/ui/resizable";
  import TitleBar from "$lib/components/shell/TitleBar.svelte";
  import Sidebar from "$lib/components/shell/Sidebar.svelte";
  import MainPanel from "$lib/components/shell/MainPanel.svelte";

  const projects = mockProjects;
  const STORAGE_KEY = "shell:sidebar-size";

  let selectedAgentId = $state(projects[0]?.agents[0]?.id ?? "");

  const selectedAgent = $derived<Agent | undefined>(
    projects.flatMap((p) => p.agents).find((a) => a.id === selectedAgentId),
  );

  function handleSelect(agent: Agent) {
    selectedAgentId = agent.id;
  }

  // localStorage에서 사이드바 비율 복원 (기본 22%)
  const initialSize = Number(localStorage.getItem(STORAGE_KEY) ?? "22");

  function persistSize(size: number) {
    localStorage.setItem(STORAGE_KEY, String(size));
  }

  onMount(() => {
    sessionStatus.start();
  });
</script>

<div class="flex h-screen w-screen flex-col overflow-hidden text-sm">
  <TitleBar />
  <div class="min-h-0 flex-1">
    <Resizable.PaneGroup direction="horizontal" class="h-full w-full">
      <Resizable.Pane
        defaultSize={initialSize}
        minSize={15}
        maxSize={40}
        onResize={persistSize}
      >
        <Sidebar {projects} {selectedAgentId} onSelect={handleSelect} />
      </Resizable.Pane>
      <Resizable.Handle withHandle />
      <Resizable.Pane>
        <MainPanel agent={selectedAgent} />
      </Resizable.Pane>
    </Resizable.PaneGroup>
  </div>
</div>
```

- [ ] **Step 3: Sidebar에서 고정폭 제거**

`src/lib/components/shell/Sidebar.svelte`의 `<aside class="flex w-72 shrink-0 flex-col border-r bg-sidebar">`에서 `w-72 shrink-0`를 `h-full w-full`로 교체:
```svelte
<aside class="flex h-full w-full flex-col border-r bg-sidebar">
```

- [ ] **Step 4: 타입체크**

Run: `mise exec node@24.18.0 -- pnpm check`
Expected: 0 errors. (Resizable import명이 다르면 Step 1 결과에 맞춰 수정 후 재실행.)

- [ ] **Step 5: 시각 검증**

Run: `mise exec node@24.18.0 -- pnpm tauri dev`
확인: 사이드바와 메인 사이에 드래그 핸들이 보이고, 드래그로 폭이 조절된다. 앱을 껐다 켜도(또는 새로고침) 마지막 폭이 유지된다. minSize/maxSize 범위(15~40%)를 벗어나지 않는다.
(검증 후 종료.)

- [ ] **Step 6: 커밋**

```bash
git add src/App.svelte src/lib/components/shell/Sidebar.svelte
git commit -m "feat: 사이드바↔메인 Resizable 패널 및 폭 유지"
```

## Phase 8 — 최종 검증

### Task 14: 전체 회귀 검증

- [ ] **Step 1: Rust 단위테스트**

Run: `cd src-tauri && mise exec -- cargo test --lib`
Expected: 모든 테스트 PASS.

- [ ] **Step 2: 프론트 타입체크 + 빌드**

Run: `mise exec node@24.18.0 -- pnpm check && mise exec node@24.18.0 -- pnpm build`
Expected: 0 errors, 빌드 성공.

- [ ] **Step 3: 통합 시각 검증**

Run: `mise exec node@24.18.0 -- pnpm tauri dev`
확인 항목:
- 에이전트 선택 → 터미널에 zsh 프롬프트, 한글 입출력 정상
- 명령 실행 중 상태 점 초록(Running), 조용하면 회색(Idle), exit 시 파랑(Done)
- 사이드바↔메인 드래그 리사이즈 및 폭 유지
- 창 리사이즈 시 터미널 재배치

- [ ] **Step 4: (선택) 상태파일 훅 수동 검증**

앱 데이터 디렉토리의 `hooks/<agent-id>/status.json`에 `{"status":"waiting_input"}`를 쓰면 해당 에이전트 상태 점이 주황(Blocked)으로 바뀌는지 확인. 파일을 지우거나 10초 지나면 출력 스트림 기준으로 fallback.
