# 사용성 감사 종합 (UX Audit) — Orca/Superset 대비

- 기준 커밋: `cd8bc81 chore: v0.1.6`
- 수행: 2026-07-27, GJC tmux team 3개 · 워커 8명 병렬 (레인 A~H)
- 성격: **발굴 전용**. 제품 소스(`src/`, `src-tauri/`)는 한 줄도 수정하지 않았다.

## 실행 구성

| 팀 | 모델 | 레인 |
|---|---|---|
| 1 | `anthropic/claude-opus-5` (레인 C만 `claude-opus-4-8`로 재실행) | A 온보딩 · B 일상 루프 · C 리뷰/머지 |
| 2 | `anthropic/claude-opus-4-8` | D 정보구조 · E 상태 신뢰성 · F 경쟁 갭 |
| 3 | `amazon-bedrock/openai.gpt-oss-120b` (OpenAI 계열) | G 성능 · H 에러 처리 |

> OpenAI GPT-5 계열은 이 환경에서 사용 불가였다. Codex(ChatGPT Pro) 백엔드가 `gpt-5*` 전 모델을 `not supported when using Codex with a ChatGPT account`로 거부하고, Bedrock 계정에는 `openai.gpt-5.x` 온디맨드 권한이 없다(`The provided model identifier is invalid.`). 실제로 호출 가능한 OpenAI 모델은 Bedrock의 `openai.gpt-oss-120b`뿐이라 레인 G·H에만 투입했다. 그래서 G·H 문서는 다른 레인보다 얕다(각 ~5KB vs 20~32KB).

## 문서 인덱스

| 레인 | 문서 | 발굴 건수 |
|---|---|---|
| — | [`00-context.md`](./00-context.md) | 컨텍스트 스냅샷 |
| A | [`a-onboarding.md`](./a-onboarding.md) — 온보딩·첫 실행 | 21건 |
| B | [`b-daily-loop.md`](./b-daily-loop.md) — 전환·탐색·키보드·터미널 | 22건 |
| C | [`c-review-merge.md`](./c-review-merge.md) — 리뷰·머지·정리 | 22건 |
| D | [`d-information-architecture.md`](./d-information-architecture.md) — 정보구조·레이아웃 | 15건 |
| E | [`e-status-trust.md`](./e-status-trust.md) — 상태 트래킹 신뢰성·알림 | 16건 |
| F | [`f-competitive-gap.md`](./f-competitive-gap.md) — Orca/Superset 기능 갭 | 갭 Top 10 |
| G | [`g-performance.md`](./g-performance.md) — 성능·반응성 | 5건 |
| H | [`h-error-handling.md`](./h-error-handling.md) — 에러 대면 처리 | 7건 |

## 한 줄 진단

**기능은 이미 경쟁 제품보다 많다. 불편한 이유는 "앱이 저장소와 에이전트에 대해 아무것도 모른 채 사용자에게 되묻고, 잘못된 신호를 자신 있게 표시하며, 되돌릴 방법을 주지 않기" 때문이다.**

## 교차 검증된 치명적 결함 (복수 레인이 독립적으로 지목)

아래 5건은 서로 다른 레인의 워커가 각자 발견했다. 신뢰도가 가장 높고 영향도 가장 크다.

### 1. 상태 트래킹이 실패를 성공으로 표시한다 — 핵심 차별화의 자기부정

`reduce()`는 프로세스가 죽으면 **무조건** `Done`을 반환한다(`src-tauri/src/status/engine.rs:5-9`, 실물 확인).
그래서 에이전트 CLI가 설치되지 않아 셸이 `command not found` 후 즉시 종료해도 사이드바·오버뷰·상태칩 전부 **초록색 "완료"** 가 된다. 종료 코드는 판정에 쓰이지 않는다.

- 지목: 레인 A(A-11/A-12), 레인 E(E3)
- 이 제품이 "3계층 하이브리드 상태 트래킹"을 핵심 차별화로 내건 이상, 거짓 성공 신호는 단순 버그가 아니라 제품 전제의 붕괴다.
- 최소 수정: `poller.rs`가 실제 exit code를 채우고, `engine.rs`가 `exit_code != Some(0)`을 `Failed`로 분기. + 워크스페이스 생성 다이얼로그에 `command -v <CLI>` 프리플라이트 배지.

### 2. 모든 실패 원인이 폐기되고 "작업에 실패했습니다." 한 줄로 뭉개진다

```
report(_reason: unknown): void { this.event = { id: ++this.#nextId }; }
```
`src/lib/stores/actionErrors.svelte.ts` — 인자 이름부터 `_reason`이다(실물 확인). 표시부는 항상 고정 문구 하나(`ActionErrorRegion.svelte`).
동시에 백엔드는 하드코딩된 한국어/raw git stderr를 그대로 던져서(`commands.rs`, `git/mod.rs`) i18n 규칙도 깨진다.

- 지목: 레인 A(A-13/A-14), 레인 H(항목 1~3)
- 최소 수정: 백엔드가 에러 **코드**를 반환 → 프런트가 `t()`로 "원인 + 다음 행동 + 관련 경로" 문장으로 변환. `report(reason)`이 원인을 보존.

### 3. 앱이 저장소를 조회하지 않는다 — 분기 기준 `"main"` 하드코딩

`let startPoint = $state("main");` (`src/lib/components/shell/AgentDialog.svelte:22`, 실물 확인). `FanoutDialog`도 동일.
브랜치 목록을 조회하는 IPC(`list_branches` 상당)가 **백엔드에 존재하지 않는다.** 브랜치·분기 기준은 자유 텍스트이고 오타는 검증 없이 새 브랜치가 된다.

- 지목: 레인 A(A-07/A-08/A-06/A-19)
- 정량: 기본 브랜치가 `master`인 저장소에서 워크스페이스 생성은 **실패 왕복 2회 + 타이핑 10~20타**. Orca는 저장소 등록 시 base ref를 읽어 클릭 3회로 끝난다.

### 4. 정보가 늘어날수록 화면이 무너진다 — 롤업·필터·접기 전무

프로젝트 10개 × 워크스페이스 5개(50행) 기준 사이드바 세로 길이 약 **3.4k px**, 가용 뷰포트 약 0.97k px → **28%만 동시 표시**(레인 B·D가 Tailwind 클래스에서 각각 산출).
프로젝트 헤더에 상태 카운트 롤업이 없고, 섹션 접기·검색 필터도 없다. 상태 신호는 8px 점 + 우측 배지로 시선 주변부에 있다.

- 지목: 레인 B(2.3), 레인 D(D1/D2/D4)
- 아이러니: "다중 프로젝트 오케스트레이션"이 제품 아이덴티티인데 정작 프로젝트 단위 요약이 없다. 타이틀바 `새 에이전트`는 항상 `projects[0]`에 고정된다(`App.svelte:38-40`).

### 5. 키보드로 완주할 수 없다 — 전역 단축키가 `⌘K` 하나

`src/App.svelte` onMount의 keydown 핸들러가 처리하는 키는 `⌘K` 뿐이다. 커맨드 팔레트 액션은 5개, 필터는 단순 `includes()` 부분문자열 매칭(퍼지·점수·최근순 없음, `src/lib/palette/model.ts`).
에이전트 전환 후 터미널이 자동 포커스되지 않아 매번 마우스 클릭이 추가된다.

- 지목: 레인 B(2.1/2.6), 레인 D
- 정량: 전환 후 프롬프트 입력이 하루 50~100회. 현재 조작 2~3 → 개선 후 1. **하루 100~300 조작 절감.**

## 그 외 높은 우선순위

| # | 마찰 | 근거 | 레인 |
|---|---|---|---|
| 6 | diff 뷰어가 인라인 단일 컬럼. **완성된 헝크 파서 `src/lib/diff/parse.ts`가 어디서도 import되지 않는 죽은 코드**(전역 참조 0, 실물 확인) | `diff/parse.ts:62`, `git/mod.rs:336-340` | C |
| 7 | 커밋이 항상 `git add -A` 전체 커밋. "이 파일만 승인"·"이 파일만 버리기"가 UI에 없다 | `git/mod.rs:500` (실물 확인) | C |
| 8 | 체크포인트/롤백이 미추적 파일을 놓친다(`git stash create` 기반) → "되돌렸는데 파일이 남는" 신뢰 붕괴 | `git/mod.rs:773,796` | C |
| 9 | 병합 사전 경고 `baseCheckedOut`이 IPC 타입까지 왔는데 UI에서 **한 번도 읽히지 않는다**(실물 확인) | `src/lib/ipc/merge.ts:11` | C |
| 10 | 새 worktree 초기화 수단 없음. `setup_script`/`postCreate` 계열 코드 0건 → 첫 에이전트가 `.env`·`node_modules` 없는 디렉터리에서 시작 | 저장소 전역 검색 0건 | A |
| 11 | OS 알림에 딥링크 없음(`onAction` 미사용). 알림을 눌러도 해당 에이전트로 못 간다 | `src/lib/ipc/notify.ts` | E |
| 12 | Attention Inbox가 라이브 파생이라 영속 미확인함이 아니다. 놓침/중복 방지 장치 없음 | `src/lib/attention/` | E |
| 13 | 터미널에 검색(`⌘F`) 없음, 스크롤백 한계로 긴 출력 복구 불가, 앱 재시작 시 세션/스크롤백 소실 | `Terminal.svelte`, `terminal/pool.ts` | B, F |
| 14 | `gh` 미설치와 미인증을 구분하지 않아 미인증 사용자에게 "PR 없음"으로 표시된다 | `git/mod.rs:570,658-660` | C |
| 15 | 프로젝트 경로 입력이 `readonly`라 붙여넣기·드래그드롭 불가(실물 확인). 같은 경로 중복 등록 가능(UNIQUE 제약 없음) | `ProjectDialog.svelte`, `repo.rs:11-17` | A |
| 16 | 사이드바를 닫은 채 재시작하면 **프로젝트를 추가할 방법이 0개**(`ProjectDialog`가 `Sidebar` 안에만 마운트) | `Sidebar.svelte`, `shell.svelte.ts` | A |
| 17 | 파괴적 작업(워크스페이스 삭제·롤백)에 Undo/토스트 복구 없음 | `commands.rs` | H |

## 경쟁 제품 대비 절대 열세 (레인 F)

1. 내장 코드 에디터 부재 — 매 리뷰마다 외부 IDE로 이탈
2. 터미널 분할 없음 + 재시작 시 세션/스크롤백 소실
3. 이미지/파일 드래그·붙여넣기 입력 없음
4. 외부 제어 API(MCP/CLI/SDK) 없음 — Superset의 핵심 셀링포인트를 통째로 결여
5. 스케줄/크론 자동화 없음

## 과잉 투자 금지 (이미 앞서 있는 지점)

공유 worktree(N 에이전트/1 worktree), 3계층 상태 트래킹 설계, 팬아웃 자동 검증 + 채택 랭킹, 사용량 예산 경고 + 웹훅, PR 없는 로컬 병합 + 충돌 사전감지, 자동 체크포인트, 한글 IME 애드온, 프로젝트 1급 그룹핑.
→ **음성 입력·모바일 앱·클라우드 SaaS 백엔드는 현 단계 착수 금지.**

## 권장 착수 순서

**P0 (며칠 규모, 신뢰 회복):**
1. exit code 기반 `Failed` 상태 분리 + CLI 프리플라이트 배지 (결함 1)
2. 에러 코드 체계 + `report(reason)` 보존 + i18n 매핑 (결함 2)
3. 저장소 기본 브랜치를 프로젝트에 저장하고 모든 기본값의 원천으로 (결함 3 전반부)
4. 전환 시 터미널 자동 포커스 (결함 5 중 난이도 S)

**P1 (1~2주):**
5. 전역 키맵 도입(`⌘1-9` 워크스페이스 점프, `⌘⌥↑↓` 순환, `⌘⇧]` 다음 blocked)
6. `list_branches` IPC + 브랜치/분기 기준 검색형 콤보박스
7. 사이드바 프로젝트 상태 롤업 + 접기 + 필터
8. 터미널 검색 + 스크롤백 상향 + 링크 클릭
9. `parseDiff()` 배선 → 헝크 구분·컨텍스트 접기

**P2 (그 이후):**
10. 파일 단위 커밋/폐기, 체크포인트 미추적 포함, 병합 사전 경고 표시
11. 알림 딥링크 + 영속 미확인함
12. worktree Setup Script
13. 내장 에디터 / 외부 제어 API (전략 결정 필요)

## 이 감사의 한계

- 정적 코드 추적 기반이다. 실제 앱을 빌드해 클릭한 사용성 테스트는 하지 않았다.
- 레인 G·H는 `gpt-oss-120b`로 수행해 다른 레인보다 깊이가 얕다. 성능·에러 처리 영역은 재감사 여지가 있다.
- 각 레인 문서의 `파일:줄` 인용 중 핵심 10여 건은 직접 대조해 정확함을 확인했으나, 전수 검증하지는 않았다. 착수 전 해당 파일을 다시 확인할 것.
