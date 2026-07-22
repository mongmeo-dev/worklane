# Task B3 보고: Claude Code statusLine 훅 설치 + 사용량 읽기

## 구현 내용

### 1. `src-tauri/src/usage/claude.rs` (신규)
- `parse_spool(json: &str) -> UsageInfo`: statusLine 훅 stdin(스풀 파일 내용)을 파싱해 `rate_limits.five_hour`/`.seven_day`를 `UsageInfo`(B2에서 정의된 공통 타입 재사용)로 변환.
- `read_usage() -> UsageInfo`: `~/.claude/aiworkspace-usage.json`을 읽어 `parse_spool` 호출. 파일 없음/파싱 실패 시 `UsageInfo::disconnected`.
- `merge_statusline(existing: &str, script_path: &str) -> Result<String, String>`: 순수 함수. 기존 `settings.json`을 파싱해 `statusLine`만 우리 스크립트로 교체하되, 기존 `statusLine.command`가 있고 그것이 우리 스크립트가 아니면 `statusLine.aiworkspaceDelegate`에 보존. 그 외 최상위 키는 그대로 유지.
- `install_statusline() -> Result<(), String>`: `~/.claude/aiworkspace-statusline.sh` 스크립트를 작성(0755)하고 `merge_statusline`으로 병합한 결과를 `~/.claude/settings.json`에 씀.

### 2. `src-tauri/src/usage/mod.rs`
- `pub mod claude;` 추가(코드 순서상 `codex` 앞).

### 3. `src-tauri/src/commands.rs`
- `read_claude_usage()`: `spawn_blocking(claude::read_usage)`.
- `install_claude_statusline()`: `spawn_blocking(claude::install_statusline)`.
- 둘 다 블로킹 IO이므로 규칙대로 `spawn_blocking` 사용.

### 4. `src-tauri/src/lib.rs`
- `invoke_handler`에 `commands::read_claude_usage`, `commands::install_claude_statusline` 등록.

### 5. `src/lib/ipc/usage.ts`
- 기존 파일 유지, `readClaudeUsage()` / `installClaudeStatusline()` 함수만 추가.

## TDD 증거

### Step 1~2: `parse_spool`
- RED: `mod.rs`에 `pub mod claude;`만 추가한 상태에서 테스트 모듈만 존재 → `cargo test usage::claude` 결과 `error[E0425]: cannot find function 'parse_spool' in this scope` (2건) 확인.
- GREEN: 파서 구현 후 재실행 →
  ```
  test usage::claude::tests::rate_limits_없으면_연동_대기 ... ok
  test usage::claude::tests::스풀에서_5시간_주간_퍼센트를_읽는다 ... ok
  test result: ok. 2 passed; 0 failed
  ```

### Step 3: `merge_statusline`
브리프 지정 2개 테스트 + 추가 1개(우리 스크립트가 이미 설치된 경우 위임 미기록 — 분기 커버리지 보강) 작성, 전부 GREEN:
```
test usage::claude::merge_tests::빈_설정에_statusline_추가 ... ok
test usage::claude::merge_tests::기존_command를_위임으로_보존 ... ok
test usage::claude::merge_tests::이미_우리_스크립트인_경우_위임_기록_안함 ... ok
```

### 최종 전체 테스트 (`cargo test`, src-tauri 21개 전부 통과)
```
running 21 tests
... (기존 status/store/git/system 테스트 포함) ...
test usage::claude::tests::rate_limits_없으면_연동_대기 ... ok
test usage::claude::tests::스풀에서_5시간_주간_퍼센트를_읽는다 ... ok
test usage::claude::merge_tests::이미_우리_스크립트인_경우_위임_기록_안함 ... ok
test usage::claude::merge_tests::기존_command를_위임으로_보존 ... ok
test usage::claude::merge_tests::빈_설정에_statusline_추가 ... ok
test usage::codex::tests::rate_limits_없으면_none ... ok
test usage::codex::tests::마지막_nonnull_rate_limits를_찾는다 ... ok
test usage::codex::tests::usage_info_변환_percent와_plan_반영 ... ok
test result: ok. 21 passed; 0 failed; 0 ignored
```

### 프론트엔드 검증
```
$ svelte-check --tsconfig ./tsconfig.json
COMPLETED 907 FILES 0 ERRORS 0 WARNINGS 0 FILES_WITH_PROBLEMS
```

## 스크립트 검증 방법/결과 (중요)

브리프의 스크립트 생성 코드를 그대로 쓰면 안 되는 버그를 발견해 수정했습니다. 상세는 아래 "이스케이프 조정" 참고. 최종 코드로 다음을 검증:

1. **문법 검증**: 임시 통합 테스트(`#[ignore]` 마킹, 검증 후 제거)로 `install_statusline()`을 가짜 `HOME`(스크래치 디렉토리) 하에서 실제 실행 → 생성된 `aiworkspace-statusline.sh`에 대해 `bash -n` 통과.
2. **동작 검증(a) stdin→spool 저장**: 생성된 스크립트에 `echo '{"rate_limits":{"five_hour":{"used_percentage":62}}}' | script.sh` 파이프 실행 → 스풀 파일에 동일 내용 기록됨 확인.
3. **동작 검증(b) 위임 실행**: 기존 `settings.json`에 `statusLine.command: "/old/hud.sh"`가 있는 상태로 `install_statusline()` 실행 → 생성 스크립트의 `DELEGATE="/old/hud.sh"` 라인 확인, 가짜 위임 스크립트를 만들어 실제 파이프 실행 시 stdin이 위임 스크립트로 그대로 전달됨을 확인(`delegate_received.txt` 내용 일치).
4. **동작 검증(c) 실행권한**: `stat -f "%Lp" script.sh` → `755` 확인.
5. 통합 테스트는 검증 완료 후 즉시 소스에서 제거(임시 파일이므로 최종 커밋에는 포함되지 않음). 스크래치 디렉토리 임시 파일도 모두 삭제.

## 이스케이프 조정 (명시)

브리프 Step 4 코드는 다음 두 가지 문제가 있어 수정했습니다:

1. **치환 문자열 버그**: 브리프는
   ```rust
   let body = format!("...DELEGATE={{delegate}}...");
   let body = body.replace("{{delegate}}", &format!("{:?}", delegate));
   ```
   를 사용하지만, `format!`의 `{{delegate}}`는 이스케이프되어 최종 문자열에 리터럴 `{delegate}`(중괄호 한 겹)로 출력됩니다. 이후 `.replace("{{delegate}}", ...)`는 원본 문자열에 없는 패턴(`{{delegate}}`, 중괄호 두 겹)을 찾으므로 치환이 전혀 일어나지 않고, 스크립트에는 `DELEGATE={delegate}`라는 깨진 텍스트가 그대로 남습니다. 실제 rustc로 재현해 확인했습니다.
   - **수정**: `replace` 후처리를 없애고, `delegate_quoted`(`format!("{delegate:?}")`로 셸 안전하게 따옴표 포함 이스케이프한 값)를 `format!` 인자로 직접 삽입하도록 변경. `let delegate_quoted = format!("{delegate:?}"); ... DELEGATE={delegate_quoted}`.
2. 세 가지 핵심 동작 의도(stdin→spool 저장 / 위임 실행 / 0755 실행권한)는 브리프와 동일하게 유지했습니다.

수정 후 실제 생성 스크립트 예:
```bash
#!/usr/bin/env bash
IN=$(cat)
printf '%s' "$IN" > "/Users/foo/.claude/aiworkspace-usage.json"
DELEGATE="/old/hud.sh"
if [ -n "$DELEGATE" ]; then printf '%s' "$IN" | "$DELEGATE"; fi
```
(위임 없을 시 `DELEGATE=""`로 정상 출력되어 `if [ -n "$DELEGATE" ]`가 거짓으로 평가됨을 확인.)

## 그 외 소소한 조정

- 브리프의 `primary_reset: rl.five_hour.and_then(|w| w.resets_at)`는 이미 `if let Some(w) = &rl.five_hour`로 참조 대여한 뒤 동일 필드를 다시 move하려는 코드라 컴파일 에러가 나므로, `primary_reset = w.resets_at.clone();`으로 대체(동일 의도, 대여 문제만 해소).
- `merge_statusline` 테스트에 브리프 지정 2개 외 "이미 우리 스크립트가 설치된 경우 위임 미기록" 1개를 추가해 `p != script_path` 분기를 실제로 커버.

## 변경 파일
- `src-tauri/src/usage/claude.rs` (신규)
- `src-tauri/src/usage/mod.rs` (수정: `pub mod claude;` 추가)
- `src-tauri/src/commands.rs` (수정: `read_claude_usage`, `install_claude_statusline` 추가)
- `src-tauri/src/lib.rs` (수정: invoke_handler 등록)
- `src/lib/ipc/usage.ts` (수정: `readClaudeUsage`, `installClaudeStatusline` 추가)

## Self-review
- TODO/FIXME/unimplemented!/test.skip/.only 등 placeholder 패턴 grep 결과 없음.
- IPC 명령 이름(snake_case, Rust) ↔ `invoke("...")` 문자열 ↔ TS 함수명(camelCase) 일치 확인.
- 블로킹 IO(`fs::read_to_string`, `fs::write` 등) 모두 `spawn_blocking` 경유 명령 안에서만 호출.
- `UsageInfo`/`UsageMetric`은 B2 정의를 재사용, 재정의 없음.
- `docs/design-overview.md`(이 태스크와 무관한 untracked 파일)는 커밋에서 명시적으로 제외.
- 실제 `~/.claude/settings.json`을 건드리는 코드는 `install_statusline()` 실행 시에만 발동하며, 이번 작업 중 실제 홈 디렉토리의 `settings.json`은 건드리지 않고 스크래치 디렉토리의 가짜 `HOME`으로만 검증함.

## 우려 사항
- `install_statusline()`은 사용자의 실제 `~/.claude/settings.json`을 덮어쓰는 진짜 파일시스템 부작용이 있는 명령입니다. 이번 태스크에서는 프론트엔드에서 이 명령을 호출하는 UI 트리거(예: 설정 화면 버튼)를 만들지 않았습니다(브리프 범위가 IPC 계층까지였음). 다음 태스크에서 UI 연결 시, 사용자에게 "Claude Code의 statusLine 설정을 수정합니다"라는 명시적 동의/안내가 필요합니다.
- `settings.json`이 JSON5/주석 포함 등 비표준 JSON이면 `serde_json::from_str`가 실패해 `install_statusline`이 에러를 반환합니다(사용자 설정을 자르지는 않음 — 안전하게 실패). 이 케이스에 대한 사용자 대상 에러 메시지 처리는 프론트엔드 몫으로 남겨둠.
- 기존 위임 스크립트 경로에 공백이나 특수문자가 있는 경우 `{:?}` 이스케이프로 대부분의 셸 메타문자는 안전하게 처리되나, 매우 드문 극단 케이스(경로에 널 바이트 등)는 고려하지 않음 — 일반적인 파일 경로 범위에서는 문제 없음.
