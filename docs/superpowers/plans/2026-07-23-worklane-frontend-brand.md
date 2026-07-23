# Worklane 프론트엔드 및 브랜드 변경 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 승인된 Worklane 프로토타입의 메인 화면과 모든 명시적 상호작용을 실제 Svelte/Tauri 데이터에 연결하고 앱 이름·아이콘을 Worklane으로 변경한다.

**Architecture:** `shell.svelte.ts`가 화면 전환·필터·패널·파일·팝오버 상태를 소유하고, 셸 컴포넌트는 이 store와 기존 project/session store를 조합한다. 실제 파일·사용량·리소스는 완료된 Tauri IPC를 사용하며, 시각 표현은 `app.css` 시맨틱 토큰과 작은 전용 컴포넌트로 분리한다.

**Tech Stack:** Svelte 5 룬, TypeScript, Tailwind CSS v4, shadcn-svelte/bits-ui/paneforge, xterm.js, Tauri v2, Vitest, Cargo test.

## Global Constraints

- 모든 문서·주석·UI 텍스트는 한글로 작성한다.
- 컴포넌트에 hex 색상을 직접 사용하지 않는다.
- 에이전트 공유 단위는 동일한 `projectId + worktreePath`이다.
- 오버뷰 미니 터미널은 별도 xterm을 만들지 않는다.
- 애니메이션은 `prefers-reduced-motion`에서 정지한다.
- 코드 커밋에는 `[ci skip]`을 붙이지 않고 Co-Author를 넣지 않는다.

---

### Task 1: 셸 상태와 파생 데이터

**Files:**
- Create: `src/lib/stores/shell.svelte.ts`
- Create: `src/lib/stores/shell.svelte.test.ts`
- Create: `src/lib/shell/derived.ts`
- Create: `src/lib/shell/derived.test.ts`

**Interfaces:**
- Produces: `OverviewFilter`, `ShellStore`, `shell`, `statusCounts(projects)`, `worktreeGroups(project)`
- `selectAgent(id)`는 파일을 닫고 터미널을 표시한다.
- `setFilter(filter)`는 오버뷰로 이동한다.
- `openFile(path)`는 파일 탭을 유지한 채 에디터를 표시한다.

- [ ] 선택·필터·파일·패널 영속 동작을 보여 주는 실패 테스트를 작성한다.
- [ ] `mise exec -- pnpm test -- src/lib/stores/shell.svelte.test.ts src/lib/shell/derived.test.ts`가 예상 이유로 실패하는지 확인한다.
- [ ] 최소 store와 순수 파생 함수를 구현한다.
- [ ] 대상 테스트 통과 후 `feat: Worklane 셸 상태 기반 추가`로 커밋한다.

### Task 2: 타이틀바와 사이드바

**Files:**
- Modify: `src/App.svelte`
- Modify: `src/lib/components/shell/TitleBar.svelte`
- Modify: `src/lib/components/shell/Sidebar.svelte`
- Create: `src/lib/components/shell/StatusChips.svelte`
- Create: `src/lib/components/shell/sidebarModel.ts`
- Create: `src/lib/components/shell/sidebarModel.test.ts`

**Interfaces:**
- Consumes: `shell`, `statusCounts`, `worktreeGroups`, `projectStore.projects`
- Produces: 전체 오버뷰 진입, 상태 필터 진입, 좌·우 패널 토글, 공유 worktree 그룹 표시

- [ ] 공유 그룹과 선택/blocked class 모델의 실패 테스트를 작성한다.
- [ ] 대상 테스트의 실패를 확인한다.
- [ ] TitleBar를 48px Worklane 헤더로 바꾸고 StatusChips와 양쪽 패널 토글을 연결한다.
- [ ] Sidebar를 오버뷰 항목, 프로젝트 카드, 2줄 행, 공유 그룹 구조로 바꾼다.
- [ ] 테스트·`pnpm check` 통과 후 `feat: Worklane 셸 탐색 화면 재구성`으로 커밋한다.

### Task 3: 오버뷰와 상세 라우팅

**Files:**
- Modify: `src/lib/components/shell/MainPanel.svelte`
- Create: `src/lib/components/shell/OverviewGrid.svelte`
- Create: `src/lib/components/shell/AgentDetail.svelte`
- Create: `src/lib/components/shell/overviewModel.ts`
- Create: `src/lib/components/shell/overviewModel.test.ts`

**Interfaces:**
- Consumes: `shell.overviewFilter`, 선택 에이전트, 같은 worktree의 에이전트 목록
- Produces: 필터링 타일, 상태별 액션, blocked 배너, 공유 터미널 탭 전환

- [ ] 필터링·타일 액션·공유 에이전트 선택 모델의 실패 테스트를 작성한다.
- [ ] 대상 테스트 실패를 확인한다.
- [ ] 2~4열 OverviewGrid와 실제 상태 기반 타일을 구현한다.
- [ ] AgentDetail의 헤더·blocked 배너·터미널 탭을 구현한다.
- [ ] 테스트·`pnpm check` 통과 후 `feat: 에이전트 오버뷰와 상세 화면 구현`으로 커밋한다.

### Task 4: 파일 패널과 읽기 전용 뷰어

**Files:**
- Create: `src/lib/components/shell/FilePanel.svelte`
- Create: `src/lib/components/shell/FileViewer.svelte`
- Create: `src/lib/files/viewModel.ts`
- Create: `src/lib/files/viewModel.test.ts`
- Modify: `src/lib/components/shell/AgentDetail.svelte`
- Remove: `src/lib/components/shell/DiffView.svelte`

**Interfaces:**
- Consumes: `listWorktreeFiles`, `readWorktreeFile`, `gitFileDiff`, `shell.openFilePath`
- Produces: 폴더별 파일 목록, 합산 통계, 일반 코드/변경 라인 렌더링, 파일 탭 열기·닫기

- [ ] 폴더 그룹·통계·원문 줄번호 변환 실패 테스트를 작성한다.
- [ ] 대상 테스트 실패를 확인한다.
- [ ] FilePanel의 로딩·빈 상태·오류·새로고침·선택 동작을 구현한다.
- [ ] FileViewer의 원문·binary·diff 렌더링과 읽기 전용 푸터를 구현한다.
- [ ] 완료 타일의 첫 변경 파일 열기 흐름을 연결한다.
- [ ] 테스트·`pnpm check` 통과 후 `feat: worktree 파일 패널과 미리보기 추가`로 커밋한다.

### Task 5: 하단 상태 바와 사용량 팝오버

**Files:**
- Create: `src/lib/components/shell/StatusBar.svelte`
- Create: `src/lib/components/shell/UsagePopover.svelte`
- Create: `src/lib/usage/display.ts`
- Create: `src/lib/usage/display.test.ts`
- Modify: `src/App.svelte`

**Interfaces:**
- Consumes: `readClaudeUsage`, `readCodexUsage`, `disconnectedUsage`, `readSystemResources`, `shell.usagePopover`
- Produces: 30px 하단 바, 임계값 게이지, 제공자별 팝오버, CPU/RAM 표시

- [ ] 사용량 임계값·표시 포맷 실패 테스트를 작성한다.
- [ ] 대상 테스트 실패를 확인한다.
- [ ] 30초 사용량 폴링과 5초 리소스 폴링을 구현하되 마지막 성공 값을 유지한다.
- [ ] 팝오버 토글·바깥 클릭 닫기·미연동 배지를 구현한다.
- [ ] 테스트·`pnpm check` 통과 후 `feat: CLI 사용량과 시스템 상태 바 구현`으로 커밋한다.

### Task 6: 설정과 공유 worktree 생성 흐름

**Files:**
- Modify: `src/lib/stores/settingsUi.svelte.ts`
- Modify: `src/lib/stores/settingsUi.svelte.test.ts`
- Modify: `src/lib/components/shell/SettingsDialog.svelte`
- Modify: `src/lib/components/settings/ScreenSettings.svelte`
- Create: `src/lib/components/settings/AgentSettings.svelte`
- Modify: `src/lib/components/shell/AgentDialog.svelte`
- Modify: `src/lib/data/labels.ts`

**Interfaces:**
- Produces: 화면/에이전트 세로 탭, 테마 segmented control, 10~20px 스테퍼, 기본 명령 표시, 기존 worktree 재사용 선택

- [ ] settings tab과 폰트 범위의 실패 테스트를 먼저 작성한다.
- [ ] 대상 테스트 실패를 확인한다.
- [ ] 설정 UI와 `agentKindDefaults.cursor = "cursor-agent"`를 구현한다.
- [ ] AgentDialog가 선택한 에이전트의 `worktreePath`와 `branch`를 createAgent에 전달하도록 구현한다.
- [ ] 테스트·`pnpm check` 통과 후 `feat: Worklane 설정과 공유 worktree 생성을 완성`으로 커밋한다.

### Task 7: 패키지 이름과 앱 아이콘

**Files:**
- Modify: `package.json`
- Modify: `src-tauri/tauri.conf.json`
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/main.rs`
- Replace: `src-tauri/icons/*`
- Copy source: `worklane-task/icons/worklane_1024.png`

**Interfaces:**
- `package.json.name = "worklane"`
- Tauri `productName = "Worklane"`, `identifier = "dev.mongmeo.worklane"`, 창 제목 `Worklane`
- Rust 패키지·라이브러리 이름은 Cargo 명명 규칙에 맞춰 `worklane`/`worklane_lib` 사용

- [ ] 기존 이름 잔존 여부를 검사하는 명령으로 RED를 확인한다.
- [ ] `mise exec -- pnpm tauri icon worklane-task/icons/worklane_1024.png`로 플랫폼 아이콘을 생성한다.
- [ ] 패키지와 Tauri 이름을 변경하고 이전 제품명 검색 결과를 의도된 문서 외 0건으로 만든다.
- [ ] `cargo check`와 `pnpm build` 통과 후 `chore: 앱 브랜드를 Worklane으로 변경`으로 커밋한다.

### Task 8: 통합 검증과 시각 회귀

**Files:**
- Modify as required by failures only
- Create: `.omx/artifacts/visual-ralph/worklane-main/` screenshots and verdict when browser capture is available

- [ ] `mise exec -- pnpm test`를 실행한다.
- [ ] `mise exec -- pnpm check`를 실행한다.
- [ ] `mise exec -- pnpm build`를 실행한다.
- [ ] `cd src-tauri && mise exec -- cargo test`를 실행한다.
- [ ] 1280×800에서 오버뷰·blocked 상세·파일 뷰어·설정·사용량 팝오버를 확인한다.
- [ ] 프로토타입 대비 최종 시각 점수 90 이상을 기록하거나 브라우저 부재를 명시한다.
- [ ] 변경 파일과 요구사항 체크리스트를 검토하고 남은 위험을 기록한다.
