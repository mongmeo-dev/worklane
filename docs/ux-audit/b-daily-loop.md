# Lane B — 일상 운영 루프(전환·탐색·키보드·터미널) 사용성 감사

- 작성: 2026-07-27 (worker-2, 레인 B)
- 대상 커밋: `main` HEAD `cd8bc81 chore: v0.1.6`
- 범위: 여러 프로젝트 × 여러 에이전트를 하루 종일 오가는 사용자의 **반복 루프**. 온보딩(레인 A), 리뷰/머지(레인 C)는 제외.
- 방법: `src/App.svelte`, `src/lib/palette/**`, `src/lib/components/shell/**`, `src/lib/terminal/**`, `src/lib/stores/shell.svelte.ts`, `src/lib/context-menu/**`, `src-tauri/src/pty/**` 전수 읽기 + Orca 공식 문서(onorca.dev/docs) · Superset 공식 문서(docs.superset.sh) 조사.
- 모든 지적에 파일:줄 근거를 붙였다. 근거 없는 추측은 넣지 않았다.

---

## 0. 한 줄 결론

이 앱의 일상 루프는 **"마우스 없이는 아무것도 완주할 수 없는 구조"** 다.
전역 단축키는 `⌘K` 하나뿐이고(`src/App.svelte:84-90`), 그 `⌘K`로 에이전트를 전환해도 **터미널에 포커스가 가지 않아 결국 마우스 클릭이 한 번 더 필요하다**(`src/lib/components/shell/Terminal.svelte:145-169`에 `focus()` 호출 없음). 즉 앱이 자랑하는 유일한 단축키조차 키보드 루프를 닫지 못한다.

경쟁 제품은 정반대다. Superset은 21개 단축키를 기본 제공하고 전부 리매핑·import/export까지 지원하며(docs.superset.sh/keyboard-shortcuts), Orca는 `⌘J` 점프 팔레트 + 전 키맵 리매핑 + 워크스페이스별 패인 트리 복원(onorca.dev/docs/model/tabs-panes-splits)을 제공한다. "Orca/Superset보다 불편하다"는 사용자 평가의 **가장 큰 단일 원인은 일상 루프의 키보드 부재**로 판단한다.

---

## 1. 경쟁 제품 단축키 셋 대비 결손 표

Superset 근거: <https://docs.superset.sh/keyboard-shortcuts>, <https://docs.superset.sh/terminal-integration>
Orca 근거: <https://www.onorca.dev/docs/terminal>, <https://www.onorca.dev/docs/model/quick-open>, <https://www.onorca.dev/docs/model/tabs-panes-splits>, <https://www.onorca.dev/docs/settings>

| 동작 | Superset | Orca | Worklane(현재) | 근거(현재) |
|---|---|---|---|---|
| 커맨드/점프 팔레트 | `⌘⇧F`(태스크 검색) | `⌘J`(worktree+탭 통합 점프) | `⌘K` (액션 5개 + 에이전트) | `src/App.svelte:84-90`, `src/lib/palette/model.ts:9-17` |
| 파일 빠른 열기 | `⌘P` | `⌘P` (recency+match 랭킹) | **없음** | `src/lib/palette/model.ts:9-17`에 파일 항목 없음 |
| 워크스페이스 1~9 직접 이동 | `⌘1`~`⌘9` | Settings→Shortcuts 리매핑 | **없음** | `src/App.svelte:84-90` |
| 이전/다음 워크스페이스 | `⌘⌥↑` / `⌘⌥↓` | 사이드바 + `⌘J` | **없음** | 동일 |
| 새 워크스페이스 | `⌘N` / `⌘⇧N` | `⌘J` 입력값으로 Create worktree 행 | **없음**(타이틀바 버튼만) | `src/lib/components/shell/TitleBar.svelte:70-73` |
| 사이드바 토글 | `⌘B` | Settings→Shortcuts | **없음**(버튼만) | `TitleBar.svelte:34-42`, `src/lib/stores/shell.svelte.ts:101-104` |
| 새 터미널 탭 | `⌘T` | `⌘T` | **없음**(＋버튼→드롭다운) | `src/lib/components/shell/AgentDetail.svelte:157-176` |
| 새 에이전트 탭 | 프리셋 `⌃1`~`⌃9` | `⌘⌥T` (+에이전트별 개별 바인딩) | **없음** | 동일 |
| 터미널 탭 닫기 | `⌘W` / `⌘⇧W` | `⌘W` | **없음**(X 버튼만) | `AgentDetail.svelte:145-151` |
| 이전/다음 터미널 탭 | `⌘⌥←` / `⌘⌥→` | 탭 드래그/클릭 | **없음** | `AgentDetail.svelte:133-144` |
| 터미널 내 검색 | `⌘F` | `⌘F`(하이라이트·대소문자·정규식·매치 이동) | **없음** | `package.json:25-28` — `@xterm/addon-search` 미설치 |
| 터미널 클리어 | `⌘K` | 우클릭 메뉴 | **없음** (`⌘K`는 팔레트가 점유) | `src/App.svelte:85`, `src/lib/components/shell/Terminal.svelte:52-84` |
| 스크롤 맨 아래로 | `⌘⇧↓` | — | **없음** | `Terminal.svelte` 전체 |
| 패인 분할(우/하) | `⌘D` / `⌘⇧D` / `⌘E`(auto) | `⌘\` / `⌘⇧\` | **없음**(분할 개념 자체 부재) | `src/lib/components/shell/MainPanel.svelte:12-21` |
| 패인 닫기 | `⌘W` | `⌘W` | **없음** | 동일 |
| 변경사항/diff 탭 | `⌘L` / `⌘⇧L` | 탭으로 상시 | **없음** | `src/lib/stores/shell.svelte.ts:80-84` |
| 플로팅 전역 터미널 | — | `⌘⌥A` | **없음** | — |
| 모든 에디터 탭 닫기 | — | `⌘⌥W` | **없음** | `shell.svelte.ts:96-99`(1개만 관리) |
| 외부 앱으로 열기 | `⌘O` | — | **없음**(우클릭 메뉴만) | `src/lib/components/shell/sidebarContextActions.ts:7-22` |
| 경로 복사 | `⌘⇧C` | — | **없음** | 동일 |
| 단축키 도움말 | `⌘/` | Settings→Shortcuts | **없음** | `src/lib/components/settings/` 5개 탭에 없음 |
| 단축키 커스터마이즈 | 전부 리매핑 + import/export | 전 키맵 리매핑 | **없음** | 동일 |

**결손 요약: 22개 항목 중 21개 부재.** 유일하게 존재하는 `⌘K`조차 경쟁 제품에서 "터미널 클리어"에 배정된 코드를 뺏어 쓰고 있어, 터미널에서 습관적으로 `⌘K`를 누르면 팔레트가 열린다(`src/App.svelte:85-87`이 `preventDefault()` 후 무조건 팔레트를 토글).

추가로 `⌘K` 배지는 하드코딩 `⌘K`인데(`TitleBar.svelte:63`) 핸들러는 `metaKey || ctrlKey`를 모두 받는다(`App.svelte:85`). Windows/Linux 사용자에게 잘못된 키를 표시한다. 이 문자열은 `t()`를 거치지도 않아 AGENTS.md의 i18n 규칙에도 어긋난다.

---

## 2. 마찰 목록

심각도/사용빈도/난이도 기준: 심각도=작업 흐름 파괴 정도, 사용빈도=하루 발생 횟수(상 20회+, 중 5~20회, 하 5회 미만), 난이도 S=1일 이내, M=2~4일, L=1주 이상.

### 2.1 (a) 전역 단축키

| # | 마찰 | 근거(파일:줄) | 심각도 | 사용빈도 | 난이도 | 왕복 조작 수(현재→목표) | 개선안 |
|---|---|---|---|---|---|---|---|
| 1 | 전역 단축키가 `⌘K` 하나뿐. 나머지 전 동작이 마우스 전용 | `src/App.svelte:84-90` (keydown 핸들러 전체가 6줄) | 상 | 상 | M | — | 전역 키맵 레지스트리(`src/lib/shortcuts/registry.ts`) 도입 후 아래 2~9 일괄 등록 |
| 2 | **`⌘K`로 에이전트를 전환해도 터미널에 포커스가 안 감 → 키보드만으로 루프 완주 불가** | `CommandPalette.svelte:41-42`(`shell.selectAgent`만 호출) + `Terminal.svelte:145-169`(onMount에 `focus()` 없음) + `pool.ts:257-261`(`remount()`도 `fit`/`refresh`만) | 상 | 상 | S | 4 → 3 (마우스 1 → 0) | `PooledTerminal.remount()` 끝에 `this.term.focus()` 추가, 또는 `Terminal.svelte` onMount에서 마운트 직후 포커스 |
| 3 | 워크스페이스 직접 이동(`⌘1`~`⌘9`) 없음 | `src/App.svelte:84-90` | 상 | 상 | S | 2~3 → 1 | 사이드바 표시 순서 기준 1~9 인덱스에 `⌘숫자` 바인딩 |
| 4 | 이전/다음 워크스페이스 순환 없음 | 동일 | 상 | 상 | S | 2~3 → 1 | `⌘⌥↑`/`⌘⌥↓`로 `allAgents(projects)`(`src/lib/shell/derived.ts:13-15`) 평탄화 목록 순환 |
| 5 | 터미널 탭 전환 단축키 없음(탭 클릭 필수) | `AgentDetail.svelte:133-144` | 중 | 상 | S | 2 → 1 | `⌘⌥←`/`⌘⌥→` → `shell.selectTab()` |
| 6 | 새 워크스페이스/새 터미널 단축키 없음 | `TitleBar.svelte:70-73`, `AgentDetail.svelte:157-176` | 중 | 중 | S | 2~3 → 1 | `⌘N`(새 워크스페이스), `⌘T`(새 터미널 탭, 기본 종류) |
| 7 | 사이드바/우측 패널 토글 단축키 없음 | `TitleBar.svelte:34-42, 86-96`, `shell.svelte.ts:101-109` | 중 | 중 | S | 1클릭(조준 필요) → 1키 | `⌘B` / `⌘⌥B` 바인딩. 스토어 메서드는 이미 존재 |
| 8 | Attention(blocked/done) 다음 항목으로 점프하는 수단이 없음. 벨→목록→항목→터미널 4스텝 | `AttentionInbox.svelte:32-45, 68-72`, `shell.svelte.ts:132-135` | 상 | 상 | M | 3n → n (n=대기 항목 수) | `⌘⇧]`=다음 attention, `⌘⇧[`=이전. `attentionItems()`(`src/lib/attention/model.ts`) 순서대로 `selectAgent`+focus |
| 9 | `⌘K`가 터미널의 관습적 clear 코드를 점유. 터미널 포커스 상태에서도 무조건 가로챔 | `src/App.svelte:85-87` (`preventDefault()` 무조건 실행) | 중 | 중 | S | — | 팔레트를 `⌘K`+`⌘P` 양쪽에 바인딩하거나, 터미널 포커스 시 `⌘K`를 clear로 위임 |
| 10 | 단축키 도움말·커스터마이즈 화면 부재. 발견 가능성 0 | `src/lib/components/settings/` = `Agent/Integrations/Prompt/Screen/Usage` 5탭만. `messages.ts`에 `shortcut` 키 0건 | 중 | 하 | M | — | 설정에 "단축키" 탭 신설 + `⌘/` 오버레이. Superset/Orca 모두 제공 |
| 11 | `⌘K` 배지가 하드코딩이고 Windows에서 오표기(핸들러는 Ctrl도 수용) | `TitleBar.svelte:63` vs `App.svelte:85` | 하 | 상 | S | — | 플랫폼 감지 후 `⌘K`/`Ctrl+K` 분기, 문자열은 `t()` 경유 |

### 2.2 (b) 커맨드 팔레트

| # | 마찰 | 근거(파일:줄) | 심각도 | 사용빈도 | 난이도 | 왕복 조작 수(현재→목표) | 개선안 |
|---|---|---|---|---|---|---|---|
| 12 | 액션이 5개로 하드코딩(overview/newAgent/fanout/tasks/settings). 나머지 전 기능이 팔레트에서 실행 불가 | `src/lib/palette/model.ts:9-17` | 상 | 상 | M | — | 액션을 커맨드 레지스트리에서 파생시켜 워크스페이스 삭제/이름변경/외부앱 열기/체크포인트/비교/사이드바 토글 등 편입 |
| 13 | 필터가 단순 `includes()` 부분문자열. 퍼지 매칭·점수·정렬 전무 | `src/lib/palette/model.ts:37-43` | 상 | 상 | S | 오타 1회당 재입력 1왕복 → 0 | 서브시퀀스 퍼지 + 매치 점수 정렬. `checkout-v2`를 `cov2`로 찾을 수 있어야 함 |
| 14 | 최근 사용/최근 방문 정렬 없음. 항상 프로젝트 삽입 순서 | `src/lib/palette/model.ts:20-33`(중첩 루프 그대로 push), 빈 질의 시 `filterPalette`가 원본 반환(`:38`) | 상 | 상 | S | 평균 타이핑 3~6자 → 0~1자 | 빈 질의일 때 최근 선택순 상위 N개 노출. Orca는 "Recent Worktrees"를 빈 질의 최상단에 고정 |
| 15 | 프로젝트·브랜치·파일·터미널 탭이 팔레트 대상이 아님 | `model.ts:4-6`(`PaletteItem`이 `action`/`agent` 2종뿐), `agentItems()`는 `agent.branch`를 담지 않음(`:20-33`) | 상 | 상 | M | 파일 열기 5~8 → 2 | 항목 타입에 `project`/`file`/`tab` 추가. Orca `⌘J`는 worktree+탭+PR번호(`#123`)까지 한 화면에서 검색 |
| 16 | 그룹 헤더·섹션 구분 없어 항목이 늘어나면 스캔 비용 급증(50 에이전트 = 55행 평면 리스트) | `CommandPalette.svelte:110-131`(단일 `<ul>` 평면 렌더) | 중 | 중 | S | — | 액션/최근/에이전트/파일 섹션 헤더 도입 |
| 17 | 팔레트에서 에이전트를 고르면 열려 있던 파일·프리뷰가 함께 리셋됨(아래 #24와 동일 원인) | `CommandPalette.svelte:41-42` → `shell.svelte.ts:42-51` | 중 | 상 | S | — | `selectAgent`에서 뷰 상태 초기화 제거 |

### 2.3 (c) 사이드바 (프로젝트 10 × 에이전트 5 = 50행 시나리오)

| # | 마찰 | 근거(파일:줄) | 심각도 | 사용빈도 | 난이도 | 왕복 조작 수(현재→목표) | 개선안 |
|---|---|---|---|---|---|---|---|
| 18 | 사이드바에 검색·필터 입력이 없음. 헤더에 "＋" 버튼 하나뿐 | `Sidebar.svelte:76-81` | 상 | 상 | S | 스크롤 ~1.8화면 + 50행 시각 스캔 → 타이핑 2~3자 | 헤더에 필터 입력 추가(`overviewModel.searchAgents`를 그대로 재사용 가능, `src/lib/components/shell/overviewModel.ts:14-25`) |
| 19 | 프로젝트/worktree 그룹 접기(collapse) 없음. 모든 프로젝트가 항상 전개 | `Sidebar.svelte:103-180` — 접힘 상태 변수 자체가 없고 `{#each worktreeGroups(project)}`(`:137`)가 무조건 전개 | 상 | 상 | S | 총 높이 ≈ 3.4k px vs 뷰포트 ≈ 0.97k px(≈28%만 표시) | 프로젝트별 접힘 상태를 `localStorage`에 저장(사이드바 폭은 이미 저장 중 — `App.svelte:30, 47-58`) |
| 20 | 상태 필터(running/blocked/done)가 오버뷰에만 있고 사이드바엔 없음 | 필터 UI는 `OverviewGrid.svelte:41-46, 106-121`에만 존재 | 중 | 상 | S | blocked 찾기: 50행 스캔 → 1클릭 | 사이드바 헤더에 상태 칩 필터. `shell.overviewFilter`(`shell.svelte.ts:14`) 재사용 |
| 21 | 핀 고정·수동 정렬 없음. 순서는 `Map` 삽입 순서에 종속 | `src/lib/shell/derived.ts:43-58`(`worktreeGroups`가 삽입 순서 그대로 반환) | 중 | 중 | M | — | 핀 고정 + 최근 활동순 정렬 옵션. Orca는 핀 고정·드래그 재정렬·다중 선택 제공 |
| 22 | 워크스페이스 행이 2줄(제목+종류/브랜치/시각)로 고정되어 밀도 조절 불가 | `Sidebar.svelte:159-170`, 행 높이 = `px-2.5 py-2` + 2줄 ≈ 52px | 하 | 중 | S | 50행 = 2.6k px → 컴팩트 시 ≈1.4k px | 컴팩트 모드 토글(Orca도 실험 기능으로 "Compact worktree cards" 제공) |

### 2.4 (d) 터미널 UX

| # | 마찰 | 근거(파일:줄) | 심각도 | 사용빈도 | 난이도 | 왕복 조작 수(현재→목표) | 개선안 |
|---|---|---|---|---|---|---|---|
| 23 | **터미널 내 검색 불가.** `@xterm/addon-search` 미설치 | `package.json:25-28`(설치된 애드온은 fit/unicode11/webgl 3종), `pool.ts:2-4, 96-135` | 상 | 상 | S | 특정 출력 찾기: 스크롤 n회(성공 보장 없음) → `⌘F`+타이핑 1왕복 | `@xterm/addon-search` 추가 + `⌘F` 바인딩. Superset·Orca 모두 `⌘F` 제공 |
| 24 | **스크롤백이 xterm 기본값(1000줄)로 고정.** 설정도 없음 | `pool.ts:96-101` — `new Terminal({cursorBlink, fontFamily, fontSize, allowProposedApi})`에 `scrollback` 미지정 | 상 | 상 | S | 1000줄 초과 출력은 **영구 소실**(복구 왕복 = 작업 재실행) | `scrollback: 10000` 등으로 상향 + 설정 노출. 에이전트 CLI는 수천 줄을 쏟아낸다 |
| 25 | 출력 속의 URL·파일 경로 클릭 불가. `@xterm/addon-web-links` 미설치 | `package.json:25-28` | 중 | 상 | S | URL 열기: 드래그 선택 + 우클릭 복사 + 브라우저 전환 + 붙여넣기 = 4~5 → 1클릭 | web-links 애드온 + 파일 경로는 내부 `FileViewer`로 연결. Superset은 `⌘+클릭`으로 URL/파일 경로 모두 처리 |
| 26 | 우클릭 메뉴가 복사/붙여넣기/전체선택 3개뿐. clear·"컨텍스트 복사"·분할·미읽음 표시 없음 | `Terminal.svelte:52-84` | 중 | 중 | S | — | clear, "최근 N줄 복사"(Orca의 Copy Context) 추가 |
| 27 | 폰트 크기 조절이 설정 화면 전용. `⌘+`/`⌘-` 없음 | `ScreenSettings.svelte` 경유, `pool.ts:284-295`(`applyFont`)는 이미 런타임 반영 가능 | 하 | 중 | S | 설정 열기+조정+닫기 3~4 → 1 | `⌘+`/`⌘-`/`⌘0` 바인딩 → `terminalSettings.setFontSize` |
| 28 | **여러 에이전트를 동시에 볼 수 없음.** 메인 패널은 항상 단일 `AgentDetail` | `MainPanel.svelte:12-21`(`{#if agent} AgentDetail {:else} OverviewGrid`) | 상 | 상 | L | 두 에이전트 비교: A↔B 왕복 n회 × 2클릭 → 0(동시 표시) | 패인 분할 도입. Orca는 "터미널·diff·브라우저를 한 패인 트리에서" 지원, Superset은 `⌘D`/`⌘⇧D`/`⌘E` |
| 29 | 오버뷰 타일 미리보기가 **콜드 스타트에서 전부 빈 값**. 한 번도 연 적 없는 세션은 스냅샷이 없음 | `OverviewGrid.svelte:74-77` → `pool.ts:368-370`(`this.instances.get(id)?.snapshot() ?? ""`), 세션 생성은 `Terminal.svelte:152`에서만 발생 | 상 | 상 | M | 대시보드 신뢰도 0 → 즉시 파악 | 앱 시작 시 세션 워밍업 또는 마지막 스냅샷 영속화 |
| 30 | 리사이즈 시 120ms 트레일링 fit — 드래그 중 터미널 내용이 멈춘 것처럼 보임(의도된 트레이드오프이나 피드백 없음) | `Terminal.svelte:37-42`(`SETTLE_MS = 120`) | 하 | 중 | S | — | 드래그 중 고스트 오버레이 등 시각 피드백 |

### 2.5 (e) 전환 시 상태 보존

| # | 마찰 | 근거(파일:줄) | 심각도 | 사용빈도 | 난이도 | 왕복 조작 수(현재→목표) | 개선안 |
|---|---|---|---|---|---|---|---|
| 31 | **에이전트 전환 시 열린 파일·활성 터미널 탭·프리뷰 상태가 전부 리셋** | `shell.svelte.ts:42-51` — `selectAgent()`가 `selectedTerminalId=null`, `openFilePath=null`, `showEditor=false`, `showPreview=false`로 초기화 | 상 | 상 | S | A→B→A 복귀 시 파일 재탐색 k회(트리 깊이) 추가 = 2k+2 → 2 | 워크스페이스별 뷰 상태(`Map<agentId, ViewState>`)로 보존. Orca: "Switching worktrees swaps the entire pane tree — 브라우저 탭·터미널·diff가 떠난 그대로 복원" |
| 32 | 터미널 탭 전환도 에디터/프리뷰를 강제 종료 | `shell.svelte.ts:54-58`(`selectTab`이 `showEditor=false`, `showPreview=false`) | 중 | 상 | S | 파일 보며 다른 탭 확인 = 불가 → 가능 | 탭 전환과 뷰 모드를 분리 |
| 33 | **앱 재시작 시 실행 중이던 에이전트가 전부 사라짐.** PTY가 앱 프로세스 인메모리 맵에 있음 | `src-tauri/src/pty/manager.rs:14`(`PtyState(Arc<DashMap<String, Arc<Session>>>)`), 데몬/영속화 코드 없음 | 상 | 상 | L | 아침 재개: 10워크스페이스×2탭 = 30클릭 + CLI 컨텍스트 손실 → 0 | 별도 데몬이 PTY 소유. Orca는 데몬이 PTY를 소유해 `⌘Q` 후에도 에이전트가 계속 돌고 warm-reattach, Superset은 "Sessions survive app restarts: 실행 프로세스 유지, 출력 히스토리·스크롤백 보존" |
| 34 | 세션이 **지연 생성**이라 방문 전 워크스페이스는 실행조차 안 됨 | 세션 생성 지점이 `Terminal.svelte:152`(`terminalPool.acquire`) 단 한 곳. `AgentDetail.svelte:202-207`은 활성 탭 하나만 마운트 | 상 | 상 | M | 워크스페이스당 (사이드바 1 + 탭 수만큼 클릭) | 시작 시 자동 재개 옵션 + 사이드바 "재시작" 칩(Orca의 Restart chip) |
| 35 | 방문 전 워크스페이스 상태 dot이 실제와 무관하게 idle로 표시 | `sessions.svelte.ts:6, 12-14`(맵이 비어 있으면 `get()`이 `undefined`) → `projects.svelte.ts:47`의 `aggregateStatus([])`가 `idle` 반환(`derived.ts:24-30`) | 중 | 상 | S | — | "미실행"을 별도 상태로 구분해 idle과 분리 표기 |

### 2.6 (f) 키보드 완주 가능성

| # | 마찰 | 근거(파일:줄) | 심각도 | 사용빈도 | 난이도 | 왕복 조작 수(현재→목표) | 개선안 |
|---|---|---|---|---|---|---|---|
| 36 | **키보드만으로 "전환 → 입력"을 완주할 수 없음.** 팔레트 닫힘 시 포커스가 body로 떨어짐 | `CommandPalette.svelte:83`(`{#if shell.paletteOpen}`로 입력 DOM 자체가 언마운트) + 어디에서도 터미널 `focus()` 미호출(`src/` 전체에서 `.focus()`는 팔레트 입력·프리뷰 포트 메뉴·이름변경 입력·컨텍스트 액션뿐) | 상 | 상 | S | 마우스 클릭 1회가 **항상** 필요 | #2와 동일 처방(전환 완료 시 터미널 포커스) |
| 37 | 사이드바 워크스페이스 행에 방향키 이동/타입어헤드 없음. Tab 순회만 가능하고 프로젝트당 버튼이 3개 이상 끼어 있음 | `Sidebar.svelte:104-124`(프로젝트 헤더 버튼 3개) + `:159`(행 버튼) + `:171`(삭제 버튼) | 중 | 중 | M | 5번째 워크스페이스 도달: Tab 15회+ → ↓4회 | 사이드바를 roving tabindex 목록으로 전환 |
| 38 | 오버뷰 검색창 → 타일 이동에 방향키 없음(타일은 `role="button"`, Enter/Space만 지원) | `OverviewGrid.svelte:126-131` | 중 | 중 | S | Tab n회 → ↓/→ | 그리드 방향키 네비게이션 |
| 39 | 터미널 컨텍스트 메뉴는 키보드 지원(ContextMenu/Shift+F10)이 있으나, 그 외 패널에는 키보드 진입점이 불균일 | 지원: `Terminal.svelte:113-118`, `src/lib/context-menu/trigger.ts:47-51` / 미지원 영역: 타이틀바·상태바 액션 | 하 | 하 | M | — | 전 영역 동일 규칙 적용 |

**총 39개 항목** (섹션 a:11, b:6, c:5, d:8, e:5, f:4).

---

## 3. 시나리오별 왕복 조작 수 정량 요약

측정 전제: 프로젝트 10개 × 워크스페이스 5개(=50), 워크스페이스당 터미널 탭 2개, 사이드바 표시(폭 22%), 창 높이 1080px.

| 시나리오 | 하루 발생 | 현재 조작 수 | 개선 후 | 절감 |
|---|---|---|---|---|
| 에이전트 전환 후 프롬프트 입력 | 50~100회 | 마우스 2(사이드바 밖이면 스크롤 포함 3) / `⌘K` 경로도 키3+마우스1 | 1(`⌘1-9` 또는 `⌘⌥↓` + 자동 포커스) | **50~66%**, 하루 100~300 조작 → 50~100 |
| 같은 워크스페이스 터미널 탭 전환 | 20~40회 | 2(탭 클릭 + 터미널 클릭) | 1(`⌘⌥→`) | 50% |
| 터미널 출력에서 특정 문자열 찾기 | 10~30회 | 스크롤 n회, 1000줄 초과 시 **복구 불가**(작업 재실행) | 1(`⌘F`+타이핑) | 실패율 제거 |
| blocked 항목 n개 순차 처리 | 5~15회 | 3n(벨→항목→터미널) | n(`⌘⇧]`) | **66%** |
| 사이드바에서 특정 워크스페이스 찾기 | 20~50회 | 스크롤 ≈1.8화면 + 50행 스캔 | 필터 2~3자 | 스캔 비용 소거 |
| 파일 확인 → 다른 에이전트 → 원복 | 10~20회 | 2k+2 (k=파일 트리 깊이, 상태 리셋으로 재탐색) | 2 | **k에 비례해 절감** |
| 아침 재시작 후 10 워크스페이스 재개 | 1~2회 | 30클릭 + CLI 컨텍스트 전량 손실 | 0(세션 유지) | **100%** |

**사이드바 높이 계산 근거**: 워크스페이스 행 = `px-2.5 py-2` + 2줄(13px/10.5px) ≈ 52px(`Sidebar.svelte:159-170`), 행 간격 `gap-1`=4px(`:136`, `:146`), 프로젝트 헤더 ≈ 40px(`:104-124`), 섹션 패딩 `p-1.5`=12px(`:103`), 섹션 간격 `gap-3`=12px(`:84`). 프로젝트 1개(5행) ≈ 332px × 10 + 간격 ≈ **3.4k px**. 가용 뷰포트 = 1080 − 타이틀바 48(`TitleBar.svelte:30-31` `h-12`) − 상태바 30(`StatusBar.svelte:95` `h-[30px]`) − 사이드바 헤더 36(`Sidebar.svelte:76` `h-9`) ≈ **0.97k px** → **약 28%만 동시 표시**.

---

## 4. Top 5 즉시 개선 제안 (우선순위 순)

### 1위 — 전환 시 터미널 자동 포커스 (난이도 S, 반나절)

**왜 1위인가**: 하루 50~100회 발생하는 최다 빈도 루프의 마지막 한 걸음이 끊겨 있다. 이것만 고쳐도 `⌘K`가 처음으로 "키보드 단축키"로서 완결된다. 투입 대비 효과가 압도적이다.

**무엇을 어떻게**
- `src/lib/terminal/pool.ts:257-261` `PooledTerminal.remount()` 마지막 줄에 `this.term.focus();` 추가. 현재는 `fitAndResize()` + `refresh()`만 한다.
- `src/lib/components/shell/Terminal.svelte:152-156` — `terminalPool.acquire()` 후 `instance.remount()` 직후 포커스가 걸리도록 하되, `destroyed` 가드(`:153`) 이후여야 한다.
- 단, 파일 뷰어/프리뷰가 활성일 때는 포커스를 뺏지 않도록 `AgentDetail.svelte:44`의 `showTerminal` 조건과 연동한다.
- 테스트: `src/lib/terminal/` 아래에 "마운트 후 `term.focus()`가 1회 호출된다 / detach 상태에서는 호출되지 않는다" 케이스 추가.

### 2위 — 전역 키맵 도입 (난이도 M, 2~3일)

**왜 2위인가**: 경쟁 제품 대비 결손 22개 중 21개가 여기서 나온다. 사용자가 "불편하다"고 느끼는 체감의 뿌리다.

**무엇을 어떻게**
- 신규 `src/lib/shortcuts/registry.ts` — `{ id, keys, when, run }` 배열과 매칭 함수를 순수 함수로 분리(테스트 용이). `src/lib/palette/model.ts`와 동일한 "모델은 .ts, 뷰는 .svelte" 패턴을 따른다.
- `src/App.svelte:84-90`의 6줄 인라인 핸들러를 레지스트리 디스패치로 교체.
- 1차 바인딩(전부 기존 스토어 메서드 재사용, 신규 백엔드 0):
  - `⌘1`~`⌘9` → `shell.selectAgent(allAgents(projects)[i].id)` (`src/lib/shell/derived.ts:13-15`)
  - `⌘⌥↑`/`⌘⌥↓` → 같은 목록 순환
  - `⌘⌥←`/`⌘⌥→` → `shell.selectTab()` (`shell.svelte.ts:54-58`)
  - `⌘B` → `shell.toggleLeftPanel()` (`shell.svelte.ts:101-104`), `⌘⌥B` → `toggleRightPanel()`
  - `⌘N` → `App.svelte:32`의 `newAgentOpen`, `⌘T` → `AgentDetail.addTerminal(기본 종류)`
  - `⌘⇧]`/`⌘⇧[` → `attentionItems()` 순회 + `selectAgent`
- `TitleBar.svelte:63`의 하드코딩 `⌘K`를 플랫폼 분기 + `t()` 경유로 교체(AGENTS.md i18n 규칙 준수).
- 설정에 "단축키" 탭 신설(`src/lib/components/settings/ShortcutSettings.svelte`) + `⌘/` 오버레이. 문자열은 `messages.ts`의 `en`/`ko` 양쪽에 추가.

### 3위 — 터미널 검색 + 스크롤백 상향 + 링크 (난이도 S, 1일)

**왜 3위인가**: 스크롤백 1000줄은 **데이터 손실**이다. 에이전트가 쏟아낸 출력이 사라지면 사용자는 작업을 다시 돌려야 한다. 개선안 중 가장 싸고 손실 방지 효과가 크다.

**무엇을 어떻게**
- `package.json` dependencies에 `@xterm/addon-search`, `@xterm/addon-web-links` 추가(현재 `:24-27`에 fit/unicode11/webgl 3종만).
- `src/lib/terminal/pool.ts:96-101` `new Terminal({...})`에 `scrollback: 10000` 추가. `src/lib/stores/terminalSettings.svelte.ts`에 스크롤백 항목을 넣고 `ScreenSettings.svelte`에 노출(fontSize clamp 패턴을 그대로 따른다).
- `pool.ts:102-135`의 애드온 로드 구간에 `SearchAddon`/`WebLinksAddon` 등록. WebGL 로드 실패 시 폴백하는 기존 `try/catch` 패턴(`:121-127`)을 동일하게 적용.
- `Terminal.svelte`에 검색 바 컴포넌트 + `⌘F` 바인딩(2위의 레지스트리에 `when: "terminalFocused"`로 등록).
- 링크 핸들러: URL은 `openInApp`(`src/lib/ipc/external.ts`) 경유, 워크스페이스 내 상대 경로는 `shell.openFile()`(`shell.svelte.ts:80-84`)로 연결.

### 4위 — 워크스페이스별 뷰 상태 보존 (난이도 S~M, 1~2일)

**왜 4위인가**: 파일을 열어 두고 다른 에이전트를 확인하는 것은 다중 에이전트 사용자의 기본 동작인데, 지금은 그때마다 컨텍스트가 초기화된다. Orca가 명시적으로 광고하는 지점이라 비교 열위가 그대로 드러난다.

**무엇을 어떻게**
- `src/lib/stores/shell.svelte.ts:42-51` `selectAgent()`에서 `selectedTerminalId`/`openFilePath`/`showEditor`/`showPreview` 초기화를 제거.
- 대신 `#viewStateByAgent = $state<Record<string, {terminalId, filePath, mode}>>({})`를 두고, 이탈 시 저장·진입 시 복원한다.
- `:54-58` `selectTab()`에서 `showEditor`/`showPreview` 강제 종료를 제거하고, 탭 선택과 뷰 모드를 독립 상태로 분리한다.
- `CommandPalette.svelte:41-42`와 `OverviewGrid.svelte:128`, `AttentionInbox.svelte:17-19`은 모두 `selectAgent`를 부르므로 자동으로 혜택을 받는다.
- 테스트: `shell.svelte.ts`용 유닛 테스트에 "A에서 파일 열고 B로 갔다 A로 돌아오면 파일이 유지된다" 케이스 추가.

### 5위 — 사이드바 필터·접기 (난이도 S, 1일)

**왜 5위인가**: 프로젝트가 늘어날수록 비용이 선형 증가하는데(현재 50행 중 28%만 표시), 이 앱의 정체성이 바로 "다중 프로젝트"다. 정체성과 정면으로 충돌하는 결손이다.

**무엇을 어떻게**
- `src/lib/components/shell/Sidebar.svelte:76-81` 헤더에 필터 입력 추가. 매칭 로직은 `src/lib/components/shell/overviewModel.ts:14-25`의 `searchAgents()`를 그대로 재사용한다(제목·브랜치·프로젝트명 검색이 이미 구현되어 있다).
- `:100` `<section>`에 접힘 상태를 추가하고 `localStorage`에 저장. 키 네이밍은 기존 `shell:sidebar-size`(`App.svelte:30`) / `shell:left-open`(`shell.svelte.ts:3`) 규칙을 따라 `shell:project-collapsed:<projectId>`.
- 헤더에 상태 칩 필터를 붙이고 `shell.overviewFilter`(`shell.svelte.ts:14`)를 공유해 오버뷰와 일관되게 한다.
- 문자열(`sidebar.filterPlaceholder`, `sidebar.collapseProject` 등)은 `messages.ts`의 `en`/`ko` 양쪽에 같은 키로 추가한다.

---

## 5. 이번 감사에서 제외한 것

- 온보딩·최초 실행(레인 A), diff/머지/PR(레인 C)은 각 레인 문서 참조.
- `FanoutDialog`(392줄)·`TaskBoard`(153줄)은 "일상 반복 루프"보다 배치 작업 성격이라 항목화하지 않았다. 다만 두 기능 모두 팔레트에 액션이 있으므로(#12) 단축키 배정 대상에는 포함된다.
- 성능(대량 세션 동시 실행 시 WebGL 컨텍스트 한계 등)은 별도 측정이 필요해 제외했다.

## 6. 근거 확인 방법

이 문서의 모든 파일:줄 인용은 `main` HEAD `cd8bc81` 기준이며, 아래 파일을 전문 또는 지정 범위로 직접 읽어 확인했다.

`src/App.svelte`(146줄 전문) · `src/lib/stores/shell.svelte.ts`(전문) · `src/lib/palette/model.ts`(전문) · `src/lib/components/shell/CommandPalette.svelte`(전문) · `Sidebar.svelte`(전문) · `sidebarModel.ts`(전문) · `sidebarContextActions.ts`(전문) · `OverviewGrid.svelte`(전문) · `overviewModel.ts`(전문) · `TitleBar.svelte`(전문) · `StatusBar.svelte`(전문) · `MainPanel.svelte`(전문) · `AgentDetail.svelte`(전문) · `AttentionInbox.svelte`(전문) · `Terminal.svelte`(전문) · `src/lib/terminal/pool.ts`(전문) · `src/lib/terminal/contextActions.ts`(전문) · `src/lib/context-menu/model.ts`(전문) · `src/lib/shell/derived.ts`(전문) · `src/lib/stores/sessions.svelte.ts`(전문) · `package.json`(전문) · `src-tauri/src/pty/manager.rs`(구조) · `src-tauri/src/commands.rs`(PTY 명령부).

"전역 단축키가 `⌘K` 하나뿐"과 "터미널 포커스 호출이 없음"은 `src/` 전체에 대한 `addEventListener("keydown"` / `metaKey` / `ctrlKey` / `.focus()` 정규식 전수 검색으로 교차 확인했다.
