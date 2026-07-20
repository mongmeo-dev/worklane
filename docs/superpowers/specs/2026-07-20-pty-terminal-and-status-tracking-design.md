# 설계: PTY 터미널 연동 · Resizable 패널 · 3계층 에이전트 상태 트래킹

- 작성일: 2026-07-20
- 상태: 승인됨 (구현 대기)
- 관련 문서: `CLAUDE.md`의 "Technical Stack" 및 "에이전트 상태 트래킹" 섹션

## 1. 목표와 범위

이번 작업은 현재 정적 mock 레이아웃 단계인 앱 셸에 세 가지 핵심 기능을 실제로 연동한다.

1. **xterm.js 터미널 연동** — 프론트엔드 터미널 UI와 Rust `portable-pty` 백엔드를 연결해 실제 CLI 프로세스를 실행.
2. **Resizable 패널** — 사이드바 ↔ 메인 영역 경계를 조절 가능하게 하고 폭을 localStorage에 저장.
3. **3계층 에이전트 상태 트래킹** — 프로세스/출력 스트림/에이전트 훅 세 신호를 종합해 에이전트 상태를 판정. 유사 도구(Superset, Orca)가 tmux 환경에서 상태 트래킹에 실패하는 한계를 극복하는 것이 핵심 차별화 지점.

### 확정된 결정사항 (clarifying 결과)

- **PTY 실행 대상**: 일반 셸(bash/zsh 등)과 특정 CLI 에이전트 바이너리 **둘 다 지원**. 세션 생성 시 실행할 커맨드를 파라미터로 받는다.
- **상태 트래킹 범위**: 3계층 **전부** 구현.
- **③ 에이전트 훅 방식**: **상태파일 감시**. 우리 앱이 각 에이전트의 훅을 설정해 지정 디렉토리에 JSON 상태 파일을 쓰게 하고, Rust가 파일 변경을 감시(notify)한다.
- **Resizable 범위**: 사이드바 ↔ 메인 경계만. 폭은 localStorage 저장/복원.
- **테스트 전략**: 핵심 상태 판정 로직을 Rust 순수 함수 단위테스트로 검증. PTY·파일감시·UI 같은 I/O 경계는 수동/시각 검증.

## 2. 전체 아키텍처

접근 A(통합 세션 엔진)를 채택한다. PTY 세션 하나가 모든 신호의 중심이 되고, 세 신호를 하나의 순수 함수 리듀서가 종합한다.

```
┌─────────────────────────────────────────────────────────┐
│  프론트엔드 (Svelte 5)                                     │
│  ┌───────────┐  ┌──────────────────────────────────┐    │
│  │ Sidebar   │  │ MainPanel                        │    │
│  │ (상태 점) │◄─┤  Terminal.svelte (xterm.js)      │    │
│  └───────────┘  └──────────────────────────────────┘    │
│       ▲ 상태 emit          │ invoke         ▲ Channel     │
└───────┼───────────────────┼────────────────┼─────────────┘
        │                   ▼                │
┌───────┼───────────────────────────────────┼─────────────┐
│  Rust 백엔드 (Tauri v2)                     │             │
│  ┌────────────────────────────────────────┴──────────┐  │
│  │ SessionManager: DashMap<SessionId, Arc<Session>>   │  │
│  └────────────────────┬──────────────────────────────┘  │
│         각 Session은:  │                                   │
│  ┌──────────────┐ ┌───▼────────┐ ┌──────────────────┐   │
│  │ PTY (spawn)  │ │ 출력 펌프    │ │ StatusEngine     │   │
│  │ portable-pty │─│ 스레드      │─│ (순수 리듀서)     │   │
│  └──────────────┘ └────────────┘ └──────────────────┘   │
│    ① 프로세스 exit   ② 무변화 타이머   ③ notify 파일감시   │
│         └──────────────┴──────────────┘                  │
│              세 신호 → StatusEngine.reduce() → AgentStatus │
└──────────────────────────────────────────────────────────┘
```

**핵심 흐름:**

1. 프론트가 `create_session(id, cmd, cwd, rows, cols, onOutput)` invoke → Rust가 PTY spawn.
2. 출력 펌프 스레드가 바이트를 읽어 **두 곳**으로 분기: (a) xterm용 Channel, (b) StatusEngine에 "출력 발생" 신호.
3. 세 신호원(①프로세스 종료 ②출력 무변화 타이머 ③상태파일 변경)이 각각 이벤트를 StatusEngine에 전달.
4. StatusEngine이 순수 함수 `reduce(inputs) → AgentStatus`로 최종 상태를 결정하고, 변경 시 프론트로 `session-status-changed`를 emit.

## 3. 상태 판정 로직 (StatusEngine)

이 프로젝트의 핵심 차별화 지점이며, 순수 함수로 설계해 단위테스트한다.

### 입력

```rust
struct StatusInputs {
    process_alive: bool,             // ① 프로세스 생존 여부 (exit 감지)
    exit_code: Option<i32>,          // ① 종료 시 코드
    ms_since_last_output: u64,       // ② 마지막 출력으로부터 경과(ms)
    hook_status: Option<HookStatus>, // ③ 상태파일이 알린 값 (없으면 None)
    hook_fresh: bool,                // ③ 상태파일이 최근 것인가 (오래되면 무시)
}

enum HookStatus { Working, WaitingInput, Done } // 에이전트 훅이 노출하는 값
```

### 판정 규칙 (우선순위: ③ > ② > ①, 단 프로세스 종료는 최우선 게이트)

```
reduce(inputs) -> AgentStatus:
  1. 프로세스 죽음(!process_alive)  → Done      // ① 최우선: 끝난 건 끝난 것
  2. 신선한 훅 있음(③, hook_fresh):
       Working      → Running
       WaitingInput → Blocked                    // "입력 대기"
       Done         → Done
  3. 훅 없음(또는 오래됨) → ② 출력 스트림으로 판정:
       ms_since_last_output < IDLE_THRESHOLD_MS  → Running
       ms_since_last_output >= IDLE_THRESHOLD_MS → Idle
```

- `IDLE_THRESHOLD_MS = 2000` (상수, 조정 가능).
- `hook_fresh`는 상태파일의 마지막 수정 시각으로부터 `HOOK_STALE_MS = 10000`(10초) 이내면 `true`. 이보다 오래되면 훅이 죽었거나 갱신이 멈춘 것으로 보고 무시하고 ②로 fallback. (상수, 조정 가능.)

### 설계 근거

- **③(훅)이 ②(무변화)보다 우선인 이유**: 에이전트가 사용자 입력 대기(Blocked) 중이면 출력이 없어 ②만으로는 Idle로 오판한다. 훅이 있으면 Blocked를 정확히 구분한다. 훅이 없을 때만 ②로 fallback → tmux 안에서 훅 없는 CLI를 돌려도 최소한 Running/Idle은 잡힌다.
- **①(프로세스 종료)이 최우선 게이트인 이유**: 훅이 미처 Done을 남기지 못하고 프로세스가 죽어도 확실히 Done 처리. 단, tmux를 PTY로 띄운 경우 "프로세스"는 tmux 클라이언트이므로 이것만으로는 부족 → ②③이 함께 필요하다.
- 무변화 임계값 2000ms는 workmux 등 기존 도구 관례를 참고.

## 4. Rust 백엔드 모듈 구조

파일을 책임별로 분리한다.

```
src-tauri/src/
├── main.rs                    # 엔트리포인트 (변경 없음)
├── lib.rs                     # Builder 설정, 커맨드 등록, State manage
├── pty/
│   ├── mod.rs                 # PTY 모듈 공개 인터페이스
│   ├── session.rs             # Session 구조체 (writer/master/child + 상태)
│   └── manager.rs             # SessionManager (DashMap), create/write/resize/close
├── status/
│   ├── mod.rs
│   ├── engine.rs              # StatusEngine::reduce() ← 순수 함수, 단위테스트
│   ├── inputs.rs              # StatusInputs, HookStatus, AgentStatus 타입
│   └── watcher.rs             # ③ notify 기반 상태파일 감시
└── commands.rs                # #[tauri::command] 정의 (프론트 API 표면)
```

### 커맨드 API 표면

| 커맨드 | 역할 |
|--------|------|
| `create_session(id, cmd, cwd, rows, cols, onOutput: Channel)` | PTY spawn + 펌프 시작 |
| `write_to_pty(id, bytes)` | 키 입력 전달 |
| `resize_pty(id, rows, cols)` | 리사이즈 |
| `close_session(id)` | 종료 + 정리 |

- 상태 변경은 커맨드 반환이 아니라 `session-status-changed` 이벤트 emit으로 전달.

### 동시성 / 스레드 안전성

- `DashMap<SessionId, Arc<Session>>`(맵 동시성) + 세션 내부 필드별 `Mutex`(writer/master/child).
- 출력 펌프는 전용 `std::thread`에서 블로킹 read. PTY open/spawn은 `tauri::async_runtime::spawn_blocking`으로 감싼다.
- 출력 바이트는 `String` 변환 없이 `Vec<u8>` 그대로 프론트로 전송(멀티바이트 깨짐 방지).

### 의존성 추가

`portable-pty`, `dashmap`, `notify`(파일 감시). `uuid`는 선택(세션 ID는 프론트 발급도 가능).

## 5. 프론트엔드 구조

### 새 패키지

`@xterm/xterm`, `@xterm/addon-fit`.

### 컴포넌트 변경/추가

```
src/lib/
├── components/shell/
│   ├── Terminal.svelte        # [신규] xterm.js 마운트 + PTY 연동
│   ├── MainPanel.svelte       # [수정] placeholder → <Terminal/> 삽입
│   ├── Sidebar.svelte         # [수정] mock 상태 → 실시간 상태 구독
│   └── ...
├── ipc/
│   ├── pty.ts                 # [신규] create/write/resize/close invoke 래퍼
│   └── status.ts              # [신규] session-status-changed listen 구독
└── stores/
    └── sessions.svelte.ts     # [신규] 세션·상태 스토어 ($state 룬)
```

### Terminal.svelte 핵심 흐름

1. `onMount`: xterm 생성 + FitAddon + `term.open()`.
2. `Channel<PtyOutput>`을 만들어 `create_session` invoke, `onmessage`에서 `term.write(Uint8Array)`.
3. `term.onData()` → `write_to_pty` (TextEncoder로 바이트화).
4. `ResizeObserver` → `fit()` 후 `resize_pty`.
5. `onDestroy`: `close_session` + `term.dispose()`.
6. 바이트를 그대로 전송(한글/이모지 깨짐 방지).

### Resizable 통합

`App.svelte`에서 이미 설치된 `resizable`(paneforge) 컴포넌트로 사이드바 ↔ 메인을 감싼다. 패널 크기를 localStorage에 저장/복원.

### 상태 연동 (mock → 실데이터 점진 전환)

`sessions.svelte.ts` 스토어가 `session-status-changed` 이벤트를 구독해 세션별 `AgentStatus`를 보관한다. Sidebar의 `StatusDot`은 세션이 있는 에이전트는 이 스토어 값을, 아직 세션이 없는 에이전트는 mock/미실행 표시를 읽는다. UI를 깨지 않고 점진 전환한다.

- **IPC 래퍼 분리(`ipc/`)**: invoke 호출을 컴포넌트에서 직접 하지 않고 얇은 래퍼로 감싸 커맨드 시그니처 변경 시 한 곳만 수정한다.

## 6. 에러 처리

- PTY spawn 실패(잘못된 cmd/cwd) → 커맨드가 `Result::Err` 반환 → 프론트에서 토스트/터미널에 에러 표시.
- 프로세스 비정상 종료 → exit_code 보존, Done 처리.
- 상태파일 파싱 실패 → 해당 신호만 무시(hook_status=None), ②로 fallback (앱은 죽지 않음).
- Windows ConPTY: 셸 분기(`cmd.exe` / `$SHELL`), job object로 프로세스 트리 종료.

## 7. 테스트

- `status/engine.rs`의 `reduce()` 순수 함수를 `#[cfg(test)]`로 검증. 케이스:
  - 프로세스 죽음 → Done (훅/출력 무관).
  - 신선한 훅 Working/WaitingInput/Done → Running/Blocked/Done.
  - 훅 없음 + 최근 출력 → Running / 2초 경과 → Idle.
  - 오래된 훅(hook_fresh=false)은 무시하고 ②로 fallback.
  - **tmux 시나리오**: 프로세스 살아있고(tmux 클라이언트) 훅 없고 출력 활발 → Running. (유사 도구가 실패하는 케이스를 테스트로 못박음.)
- `cargo test`로 실행. PTY·파일감시·xterm 같은 I/O 경계는 수동/시각 검증.

## 8. 구현 순서 (의존성 순, 각 단계 검증 가능)

1. **Rust: 상태 타입 + StatusEngine + 단위테스트** (I/O 없어 TDD 가능).
2. **Rust: PTY 매니저** (spawn/write/resize/close) + 셸 하나 띄우기.
3. **프론트: Terminal.svelte + IPC 래퍼** → 실제 셸이 터미널에 뜨는지 시각 검증.
4. **Rust: ② 출력 무변화 + ① 프로세스 감지 → StatusEngine 연결** → 상태 emit.
5. **Rust: ③ notify 상태파일 감시** 연결.
6. **프론트: 상태 스토어 + Sidebar 실시간 연동**.
7. **Resizable 패널 + localStorage**.

각 단계가 이전에 의존하며, 3·6·7 후에 시각 검증(Playwright/실앱)이 가능하다.
