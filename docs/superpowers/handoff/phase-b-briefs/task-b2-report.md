# Task B2: Codex 사용량 파서 — 완료 보고

## 구현 내용

브리프 Step 순서대로 정확히 구현했습니다.

1. **`src-tauri/src/usage/mod.rs`** — 공통 타입 `UsageMetric`, `UsageInfo` (camelCase serde) + `UsageInfo::disconnected(provider, full_name)` 헬퍼. B3(Claude)가 그대로 재사용 가능.
2. **`src-tauri/src/usage/codex.rs`**:
   - `Window` / `RateLimits` / `Line` / `Payload` — 모두 `#[serde(default)]`로 null/누락 필드 관대 처리.
   - `last_rate_limits(jsonl: &str) -> Option<RateLimits>` — 라인별 파싱, non-null `rate_limits`를 만날 때마다 덮어써 **마지막 non-null 값**을 채택(요구된 폴백 로직).
   - `to_usage_info(rl) -> UsageInfo` — `primary`/`secondary`를 `UsageMetric`으로 변환, `plan_type` → `plan_label`("pro"→"Pro" 등).
   - `window_label`, `fmt_reset` — 표시용 텍스트 생성 헬퍼.
   - `read_usage()` — `~/.codex/sessions` 하위 `rollout-*.jsonl`을 재귀 스캔(`collect_rollouts`), mtime 역순 정렬 후 최신 50개 파일까지 순회하며 첫 non-null `rate_limits`를 찾으면 반환. 없으면 `UsageInfo::disconnected("codex", "Codex CLI")`.
3. **`src-tauri/src/commands.rs`** — `read_codex_usage()` 커맨드 추가, `spawn_blocking(crate::usage::codex::read_usage)`로 블로킹 파일 IO 격리.
4. **`src-tauri/src/lib.rs`** — `mod usage;` 추가, `invoke_handler`에 `commands::read_codex_usage` 등록.
5. **`src/lib/ipc/usage.ts`** — `UsageProvider`/`UsageMetric`/`UsageInfo` 타입(camelCase) + `readCodexUsage()` + `disconnectedUsage(provider, fullName, tier)` 헬퍼(B3의 claude-code 및 cursor/gemini 미연동 케이스 대비).

## TDD 증거 (RED → GREEN)

**RED** (Step 2~3, 함수 미구현 상태에서 `cargo test usage::codex`):
```
error[E0425]: cannot find function `last_rate_limits` in this scope
  --> src/usage/codex.rs:13:18 / :20:17 / :25:18
error[E0425]: cannot find function `to_usage_info` in this scope
  --> src/usage/codex.rs:26:20
error: could not compile `ai-agent-workspace` (lib test) due to 4 previous errors
```

**GREEN** (Step 4~5 구현 후 `cargo test usage`):
```
running 3 tests
test usage::codex::tests::rate_limits_없으면_none ... ok
test usage::codex::tests::마지막_nonnull_rate_limits를_찾는다 ... ok
test usage::codex::tests::usage_info_변환_percent와_plan_반영 ... ok

test result: ok. 3 passed; 0 failed; 0 ignored; 0 measured; 13 filtered out
```

**전체 스위트** (`cargo test`): 16 passed; 0 failed (기존 13개 + 신규 3개, 회귀 없음).

**`mise exec -- pnpm check`**: `907 FILES 0 ERRORS 0 WARNINGS` — 통과.

**`cargo clippy --all-targets`**: `usage/codex.rs`에서 발생한 `redundant_guards` 경고 1건(`Some(x) if x == 10080` → `Some(10080)`)을 수정해 해소. 나머지 clippy 경고는 이 태스크 이전부터 존재하던 다른 모듈(`status/mod.rs`, `pty/mod.rs`, `pty/manager.rs`, `status/engine.rs`, `commands.rs`의 `create_session` too_many_arguments) 것으로 본 태스크 범위 밖이라 손대지 않음.

## 변경 파일

- `src-tauri/src/usage/mod.rs` (신규)
- `src-tauri/src/usage/codex.rs` (신규)
- `src-tauri/src/lib.rs` (수정: `mod usage;` + invoke_handler 등록)
- `src-tauri/src/commands.rs` (수정: `read_codex_usage` 커맨드 추가)
- `src/lib/ipc/usage.ts` (신규)
- `src-tauri/Cargo.lock`: 변경 없음(새 의존성 추가 안 함 — `dirs_home()`은 브리프대로 `HOME` 환경변수 기반, 별도 crate 불필요) → 커밋에서 자연히 제외됨.

## Self-review

- 파서 순수 함수(`last_rate_limits`, `to_usage_info`)는 브리프 Step 4 코드를 verbatim으로 그대로 반영. SAMPLE의 `used_percent: 42.0` ↔ 테스트 assert `42.0` 값 일치 확인.
- `serde(default)`가 `Window`/`RateLimits`/`Payload` 전 필드에 적용되어 있어, 실제 파일에서 필드 누락/버전 차이가 있어도 파싱 실패하지 않고 `None`으로 관대하게 처리됨(브리프 요구사항).
- 파일 스캔은 최신 mtime 역순 정렬 후 최신 50개 파일까지만 순회 — 과도한 스캔 방지 상한이 브리프 그대로 반영됨.
- IPC 계약: Rust `#[serde(rename_all = "camelCase")]` ↔ TS interface 필드명(`fullName`, `primaryPercent`, `valueText`, `resetNote` 등) 일치 확인.
- 블로킹 IO(`std::fs::read_dir`, `read_to_string`)는 `read_usage()` 전체가 `commands::read_codex_usage`에서 `spawn_blocking`으로 감싸져 있어 async 런타임을 막지 않음.
- `docs/design-overview.md`(untracked, 이 태스크와 무관한 사전 존재 파일)는 커밋에서 의도적으로 제외.
- 커밋 메시지는 브리프에 명시된 문구 그대로 사용, 한글, Co-Author 없음, `[ci skip]` 미사용(코드 변경이므로 CI 통과 필요).

## 우려

- 실제 `~/.codex/sessions/**/rollout-*.jsonl` 파일에 대한 통합 테스트는 로컬 환경에 해당 디렉토리/파일이 없어 수행하지 못했습니다(브리프에서도 "파일 스캔은 통합으로 확인"이라 명시했으나, 이 환경엔 Codex CLI 세션 데이터가 없어 실제 파일 포맷과의 완전 일치는 런타임 검증이 필요합니다). 파서 로직 자체는 브리프에 명시된 실제 필드 구조(`payload.type=="token_count"`, `rate_limits.primary/secondary/plan_type`)를 그대로 반영했습니다.
- `plan_label`의 `other => other`(그대로 통과)는 알려지지 않은 plan_type이 들어와도 안전하게 표시되도록 처리했습니다만, 브리프에 명시되지 않은 plan_type 목록(예: "team", "enterprise" 등)이 실제로 존재할 경우 라벨링 개선 여지가 있습니다(향후 개선 가능, 이번 스코프 아님).
