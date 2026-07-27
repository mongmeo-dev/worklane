# 컨텍스트 스냅샷 — ai-agent-workspace 사용성 감사 (UX Audit)

- 작성: 2026-07-27T00:38:41Z
- 슬러그: `ux-audit`
- 브랜치: `main` (HEAD `cd8bc81 chore: v0.1.6`, working tree clean)

## 과제 진술

사용자 피드백: **"지금은 Orca나 Superset에 비해 사용하기가 너무 불편하다."**
OpenAI 계열 모델과 Claude Opus 를 병렬로 투입해, 여러 각도에서 이 앱의 **사용성(usability) 개선 지점**을 발굴한다.

## 원하는 결과

- 코드/실제 UI 흐름 근거가 붙은 마찰(friction) 목록
- Orca / Superset 대비 무엇이 어떻게 불편한지에 대한 구체적 비교
- 각 항목에 대해 (심각도 · 사용 빈도 · 구현 난이도) 판단과 구체적 개선안
- 결과물은 `docs/ux-audit/<자기 레인 파일>.md` 로 각 워커가 **자기 파일 1개만** 작성

## 알려진 사실 / 근거

### 스택

- Tauri v2(Rust) + 순수 Svelte 5(runes) + Vite SPA + TypeScript
- UI: shadcn-svelte, 터미널: xterm.js(+ WebGL addon), PTY: portable-pty
- i18n: `src/lib/i18n/messages.ts` (en/ko 두 카탈로그, 916줄)
- 상태 트래킹 3계층 하이브리드: ① PTY 프로세스 트리 ② 출력 스트림 무변화 감지 ③ 에이전트 훅/SDK 브리지

### 현재 셸 구조 (`src/App.svelte`, 146줄)

```
TitleBar
└ PaneGroup(horizontal)
  ├ Sidebar (localStorage "shell:sidebar-size", 10~40%, 기본 22)
  └ MainPanel → agent 선택 시 AgentDetail + (rightPanelOpen) FilePanel
                 미선택 시 OverviewGrid
StatusBar
+ CommandPalette / UpdateBanner / SettingsDialog / CompareDialog / TaskBoard
+ AgentDialog / FanoutDialog / ContextMenuHost / ActionErrorRegion
```

- 전역 단축키는 **`Cmd/Ctrl+K` 하나뿐**이다(`src/App.svelte` onMount의 keydown 핸들러). 그 외 단축키 없음.
- 커맨드 팔레트 액션은 **5개뿐**: overview, newAgent, fanout, tasks, settings (`src/lib/palette/model.ts`). 필터는 단순 `includes()` 부분문자열 매칭(퍼지 매칭 없음, 점수/정렬 없음).
- 사이드바(`Sidebar.svelte`, 196줄): 프로젝트 → worktree 그룹 → 에이전트 행. 프로젝트/워크스페이스 컨텍스트 메뉴 있음. 검색/필터 UI 없음.
- 오버뷰(`OverviewGrid.svelte`, 169줄)가 기본 화면.

### 주요 컴포넌트 규모 (줄 수)

`FanoutDialog 392` · `CompareDialog 242` · `Preview 228` · `ReviewActions 226` · `AgentDetail 210` ·
`Terminal 196` · `Sidebar 196` · `FilePanel 188` · `Checkpoints 180` · `OverviewGrid 169` ·
`PrPanel 154` · `TaskBoard 153` · `App 146` · `CommandPalette 138` · `StatusBar 137` ·
`Timeline 106` · `AttentionInbox 105` · `MainPanel 21`
백엔드: `src-tauri/src/commands.rs 1154`

### 이미 구현된 차별화 기능 (커밋/백로그 근거)

팬아웃(Fanout), 리뷰/비교(Compare), 체크포인트, 타임라인, 태스크 보드, PR 패널(gh 의존),
라이브 프리뷰, 사용량/예산, Attention Inbox, 자동 업데이트, 프롬프트 자동 주입(INJECT_IDLE_MS 900ms),
터미널 탭 방식 워크스페이스, 실행 중 에이전트 자동 감지, 컨텍스트 메뉴.

### 이미 알려진 미해결 항목 (`docs/backlog.md`)

- 테마 select 접근성(`aria-labelledby` 미연결)
- 라이브 프리뷰 프로덕션(`tauri://`) 미검증
- 오케스트레이션 의존성/순차 실행 없음
- 앱 내 로컬 병합·머지 큐 부분 구현, 병렬 worktree 충돌 사전 감지 없음
- 체크포인트가 미추적 파일 미포함(`git stash create` 기반)
- 포트 감지가 `lsof` 기반이라 macOS 전용
- `gh` 미설치 시 에러 메시지 안내만
- Linear API 키/웹훅 URL을 `localStorage` 평문 저장

## 제약

- macOS 우선. 크로스플랫폼(Win/Linux)은 후속.
- 문서/사고과정/사용자 인터랙션은 한국어. 코드 주석도 한국어.
- 모든 사용자 노출 문자열은 `$lib/i18n`의 `t()` 경유(하드코딩 금지), `en`/`ko` 두 카탈로그 키·자리표시자 일치 강제.
- **이번 과제는 발굴(discovery) 전용**: 제품 소스(`src/`, `src-tauri/src/`) 수정 금지. 산출물은 `docs/ux-audit/` 문서만.

## 미해결 질문

- "불편하다"의 구체적 지점이 온보딩인지, 일상 전환 루프인지, 리뷰/머지인지 미확정 → 레인별로 나눠 전수 조사
- Orca/Superset의 최신 UX 기능 셋은 외부 조사 필요(web_search 사용)

## 코드베이스 접점

- 셸/레이아웃: `src/App.svelte`, `src/lib/components/shell/{TitleBar,Sidebar,MainPanel,StatusBar}.svelte`
- 진입/온보딩: `ProjectDialog.svelte`, `AgentDialog.svelte`, `DefaultWorkspaceDialog.svelte`, `src/lib/stores/projects.svelte.ts`
- 전환/탐색: `CommandPalette.svelte`, `src/lib/palette/model.ts`, `OverviewGrid.svelte`, `src/lib/shell/derived.ts`
- 상태 신호: `src/lib/stores/sessions.svelte.ts`, `src/lib/components/shell/{StatusDot,StatusBadge,StatusChips}.svelte`, `src-tauri/src/status/`, `src-tauri/src/hooks/`
- 터미널: `Terminal.svelte`, `src/lib/terminal/`, `src-tauri/src/pty/`
- 리뷰/머지: `ReviewActions.svelte`, `CompareDialog.svelte`, `Checkpoints.svelte`, `PrPanel.svelte`, `src/lib/review/`, `src/lib/diff/`
- 오케스트레이션: `FanoutDialog.svelte`, `TaskBoard.svelte`, `src/lib/fanout/`, `src/lib/stores/tasks.svelte.ts`
- 알림/주의: `AttentionInbox.svelte`, `src/lib/attention/`
- 백엔드 명령: `src-tauri/src/commands.rs`
