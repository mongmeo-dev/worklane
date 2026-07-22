# Task B1 보고: 시스템 리소스 (CPU/RAM)

## 구현 내용

브리프 Step 1~7을 순서대로 그대로 진행했습니다. sysinfo API가 브리프에 명시된 버전(0.32)과 실제 최신 patch(0.32.1)에서 100% 동일하여 **API 조정 없이 verbatim 코드 그대로 컴파일·테스트 통과**했습니다.

1. `src-tauri/Cargo.toml` `[dependencies]`에 `sysinfo = "0.32"` 추가 (실제 다운로드된 버전: 0.32.1).
2. `src-tauri/src/system/mod.rs` 신규 생성 — 브리프 코드 verbatim:
   - `SystemResources` 구조체 (`cpu_percent`, `ram_used_gb`, `ram_total_gb`, `#[serde(rename_all = "camelCase")]`)
   - `read_resources()` — `System::new()` → `refresh_cpu_usage()` → `MINIMUM_CPU_UPDATE_INTERVAL` 대기 → 재`refresh_cpu_usage()` → `refresh_memory()` → `global_cpu_usage()` / `used_memory()` / `total_memory()`로 값 산출.
   - 단위 테스트 `리소스는_유효_범위를_반환한다`: CPU 0~100 범위, RAM total>0, used<=total+1 검증.
3. `src-tauri/src/lib.rs`
   - 상단 mod 목록에 `mod system;` 추가.
   - `invoke_handler`의 `tauri::generate_handler![...]` 배열에 `commands::read_system_resources,` 추가.
4. `src-tauri/src/commands.rs`에 명령 추가:
   ```rust
   #[tauri::command]
   pub async fn read_system_resources() -> Result<crate::system::SystemResources, String> {
       tauri::async_runtime::spawn_blocking(crate::system::read_resources)
           .await
           .map_err(|e| e.to_string())
   }
   ```
   기존 `git_diff`와 동일한 `spawn_blocking` 패턴을 따랐고, Mutex는 전혀 다루지 않으므로 "IO 중 Mutex 보유 금지" 제약은 해당 없음(위반 없음).
5. `src/lib/ipc/system.ts` 신규 생성 — `SystemResources` 인터페이스(camelCase 필드) + `readSystemResources()` invoke 래퍼. 브리프 코드 verbatim.

## sysinfo API 조정 여부

**조정 없음.** `sysinfo-0.32.1` 소스(`~/.cargo/registry/.../sysinfo-0.32.1/src/`)를 직접 확인한 결과 다음 API가 모두 브리프대로 존재함을 확인했습니다:
- `sysinfo::MINIMUM_CPU_UPDATE_INTERVAL` (재노출됨, `src/lib.rs`)
- `System::refresh_cpu_usage()`, `System::refresh_memory()`, `System::global_cpu_usage()`, `System::used_memory()`, `System::total_memory()` (모두 `src/common/system.rs`)

## 테스트 결과

- `cd src-tauri && mise exec -- cargo build`: sysinfo 포함 정상 컴파일 (기존 unused-import warning 2건은 이 작업과 무관한 사전 존재 warning).
- `cd src-tauri && mise exec -- cargo test`: **13개 테스트 전체 PASS** (신규 `system::tests::리소스는_유효_범위를_반환한다` 포함, 나머지는 기존 status/store/git 테스트).
- `cd src-tauri && mise exec -- cargo clippy --lib`: 신규 코드(`system/mod.rs`, `commands::read_system_resources`)에 대한 clippy 경고 없음. 기존 warning 4건(2개 unused import, 2개 too_many_arguments)은 이 태스크 이전부터 존재하던 것으로 무관.
- `mise exec -- pnpm check` (svelte-check): `906 FILES 0 ERRORS 0 WARNINGS` — 프론트 타입 이상 없음.

## 변경 파일

- `src-tauri/Cargo.toml` (수정) — `sysinfo = "0.32"` 추가
- `src-tauri/Cargo.lock` (수정) — sysinfo 및 전이 의존성(rayon, crossbeam 등) 반영
- `src-tauri/src/system/mod.rs` (신규)
- `src-tauri/src/lib.rs` (수정) — `mod system;`, invoke_handler 등록
- `src-tauri/src/commands.rs` (수정) — `read_system_resources` 명령 추가
- `src/lib/ipc/system.ts` (신규)

## Self-review

- IPC 계약: `read_system_resources() -> { cpuPercent, ramUsedGb, ramTotalGb }` — camelCase serde와 프론트 인터페이스가 정확히 일치.
- 블로킹 IO(`std::thread::sleep`, sysinfo refresh)는 `spawn_blocking` 내부에서만 실행됨.
- Mutex(StoreState 등)를 전혀 참조하지 않는 순수 함수이므로 "IO 중 Mutex 보유" 문제 자체가 발생할 수 없음.
- 기존 `git_diff` 커맨드와 동일한 `async fn + spawn_blocking + map_err` 패턴을 재사용해 코드 스타일 일관성 유지.
- 커밋은 기능 단위 1개, 한글 메시지, Co-Author 미포함, `[ci skip]` 미사용(코드 수정이라 CI 필요) — 규칙 준수.
- 커밋 대상에서 이 태스크와 무관한 untracked `docs/design-overview.md`는 명시적으로 제외함(브리프의 `git add` 파일 목록에도 없음).
- `num_cpus_upper()` 헬퍼가 상수 `1.0`만 반환해 다소 vestigial하지만 브리프 verbatim 요구사항이라 그대로 유지함. 실질적 의미는 "정규화된 0~100% 값이므로 코어 수와 무관하게 상한 100"이라는 주석 의도와 일치.

## 우려사항

- 없음. sysinfo API 조정 불필요, 전체 테스트/타입체크 통과, 브리프 계약과 100% 일치.
