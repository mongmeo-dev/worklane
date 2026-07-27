# 실패·에러 상황 사용자 대면 처리 (Lane H)

앱이 오류 상황에서 사용자가 무엇을 보고 어떻게 복구할 수 있는지를 조사했습니다. 모든 항목은 파일 및 라인 번호(또는 컴포넌트/함수명)와 함께 제시합니다.

| # | 마찰 | 근거 (파일:줄) | 심각도 (상/중/하) | 사용빈도 (상/중/하) | 구현난이도 (S/M/L) | 개선안 |
|---|------|----------------|-------------------|-------------------|-------------------|--------|
| 1 | **범용 오류 UI** – `ActionErrorRegion`은 `actionError.unknown`만 표시하고 구체적인 원인·조치 안내가 없음. | `src/lib/components/context-menu/ActionErrorRegion.svelte:10` | 상 | 상 | S | i18n 키 `actionError.detail` 추가; `actionErrors.report`에 구체 메시지를 전달하고 UI가 해당 메시지를 표시하도록 업데이트.
| 2 | **에러 전파 없이 메시지 손실** – 여러 `catch(...).report(reason)` 경로가 UI에 전달되지 않아 사용자는 “작업에 실패했습니다.”만 본다. 예시: `src/lib/context-menu/trigger.ts:72‑75`, `src/lib/terminal/contextActions.ts:51‑52`, `src/lib/terminal/pool.ts:236‑237`, `src/lib/terminal/pool.ts:248‑250`, `src/lib/terminal/session-runtime.ts:15‑16`. | 다양한 파일/라인 (위 열에 명시) | 상 | 상 | M | `actionErrors.report`에 구조화된 오류 객체(`{ message, helpKey }`)를 전달하고 UI가 `t(helpKey)` 로 도움말·복구 안내를 제공.
| 3 | **Rust 백엔드 원시 문자열** – 사용자에게 노출되는 오류가 i18n에 포함되지 않은 원시 한국어 문자열. 예: `"worktree 밖 경로 접근 거부"` (`src-tauri/src/files/mod.rs:22mk`), `"선택한 경로는 Git 저장소가 아닙니다."` (`src-tauri/src/git/mod.rs:22kc`), `"gh CLI가 설치되어 있지 않습니다."` (`src-tauri/src/commands.rs:647bz`), `"Linear API 키를 설정하세요."` (`src-tauri/src/linear/mod.rs:17ad`). | 여러 파일:줄 (위 열에 명시) | 중 | 중 | M | 모든 `Err(...).to_string()` 를 i18n 키로 교체하고 `Result<…, String>` 대신 `Result<…, GjcError>` 로 래핑해 `t(key)` 로 변환.
| 4 | **외부 의존 미설치 시 안내 부족** – `gh`·`git`·`Linear` 등 CLI가 없을 때 단순 오류 메시지만 제공, 설치·인증 방법이 없음. 예: `"gh CLI가 설치되어 있지 않습니다."` (`src-tauri/src/commands.rs:647bz`), `"Linear API 키를 설정하세요."` (`src-tauri/src/linear/mod.rs:17ad`). | 해당 파일:줄 | 중 | 중 | S | i18n 키에 설치 가이드 문구 포함 (`installGhHelp`, `setupLinearHelp`) 및 UI에서 “설치 안내 보기” 버튼 제공.
| 5 | **파괴적 작업 확인·복구 부족** – `DeleteAgentDialog.svelte`, `DeleteProjectDialog.svelte`, `projectStore.removeAgent` 등에서 삭제 전 확인은 있지만 삭제 후 복구(undo) 옵션이 없음. | `src/lib/components/shell/DeleteAgentDialog.svelte:30‑70`, `src/lib/components/shell/DeleteProjectDialog.svelte:13‑40` | 중 | 중 | M | 삭제 직후 “삭제 복구하기” 토스트 제공; 백엔드에 soft‑delete 플래그(`deleted_at`) 저장해 `undoDelete` API 구현.
| 6 | **에러 로깅·전달 일관성 부족** – 일부 catch 블록 직접 `console.error` 로 출력하고 `actionErrors.report` 를 호출하지 않음 (예: `src/lib/terminal/pool.ts:164‑165`에서 `writer lock 실패` 로깅). | `src-tauri/src/pty/manager.rs:146‑148`, `src/lib/terminal/pool.ts:164‑165` | 하 | 중 | S | 모든 오류 경로를 `actionErrors.report` 로 통합하고 로깅 레벨을 `error` 로 표준화.
| 7 | **i18n 키 누락** – 오류 메시지에 대응하는 i18n 키가 정의되지 않음. 예: `actionError.unknown`은 정의되어 있지만 구체 오류 키(`actionError.fileRead`, `actionError.ghMissing`) 가 없음. | `src/lib/i18n/messages.ts` (키 `actionError.unknown`/`actionError.dismiss`만 존재) | 중 | 상 | S | 새 키 `actionError.{code}` 를 추가하고 각 Rust/TS 오류에 매핑.

## Top 5 즉시 개선 제안 (우선순위)
1. **구체 오류 전달** – `actionErrors.report`에 상세 메시지·헬프 키 전달하고 UI(`ActionErrorRegion`)가 이를 표시하도록 수정 (항목 1 + 2). 
2. **백엔드 원시 문자열 i18n 전환** – 모든 `return Err("…".into())` 를 i18n 키로 교체하고 `GjcError` 구조체 사용 (항목 3). 
3. **외부 의존 설치 안내** – `gh`, `Linear` 등 missing 오류에 설치 가이드 버튼 및 i18n 문구 추가 (항목 4). 
4. **파괴적 작업 Undo** – Soft‑delete + 토스트 복구 UI 구현 (항목 5). 
5. **i18n 오류 키 정비** – 현재 존재하는 오류에 맞는 키를 모두 정의하고 테스트 커버리지 추가 (항목 7).

---
*본 문서는 2026‑07‑27 기준 코드 베이스를 직접 조회하여 작성되었습니다.*