# Lane D — 정보구조·레이아웃·시각 계층과 인지 부하 감사

> 작성: worker-1 / 2026-07-27
> 범위: `src/App.svelte`, `src/lib/components/shell/*`, `src/lib/shell/*`, `src/app.css`, `src/lib/stores/{shell,uiSettings}.svelte.ts`
> 원칙: 제품 소스는 읽기 전용으로만 조사했다. 모든 지적에 `파일:줄` 또는 함수·컴포넌트명 근거를 붙였다.

---

## 0. 한 줄 판정

**"다중 프로젝트 × 다중 에이전트를 한눈에" 라는 이 제품의 선언된 핵심 차별화를, 현재 레이아웃은 달성하지 못한다.**
사이드바는 상태 요약이 없는 세로 트리라 10×5 규모에서 통째로 스크롤·스캔해야 하고(§1), "한눈에" 봐야 할 오버뷰는 사이드바와 상호배타 모드라 함께 못 본다(§3). 상태 신호는 8px 점 + 우측 배지로 시선 주변부에 밀려 있고(§2), 같은 상태 필터 UI가 3벌 중복된다(§3). App.svelte 계층에만 상시 마운트된 다이얼로그가 11개라 흐름이 자주 끊긴다(§4). Orca가 사이드바에서 "5 agents + 각 에이전트가 지금 무슨 작업을 몇 분째 하는지"까지 보여주는 것과 대비된다(§7).

---

## 1. (a) 3단 구조가 정보량을 감당하는가 — 10프로젝트 × 5에이전트 정량 계산

### 1.1 현재 3단 구조

`src/App.svelte:104-124`
- 좌: `Sidebar`(`Resizable.Pane` `defaultSize=22`, `minSize=10`, `maxSize=40` — App.svelte:111-113)
- 중: `MainPanel`(오버뷰 **또는** 에이전트 상세, `MainPanel.svelte:12-21` — `{#if agent} AgentDetail {:else} OverviewGrid`)
- 우: `FilePanel`(상세 진입 시 `shell.rightPanelOpen`일 때만, `MainPanel.svelte:15-17`, `FilePanel.svelte:151` `w-[264px]` 고정)

즉 "3단"은 동시에 3개가 아니다. 오버뷰 화면에서는 파일패널이 없어 사실상 2단, 상세 화면에서만 3단이 된다. **전 함대(fleet)를 보는 화면(오버뷰)과 개별 작업(상세)이 배타적**이다.

### 1.2 사이드바 구조와 행 높이

사이드바는 `프로젝트 섹션 → worktree 그룹 → 에이전트 행`의 세로 트리다(`Sidebar.svelte:94-186`).
- 프로젝트 섹션: `section ... p-1.5`(상하 12px) + 헤더 `px-1.5 py-1.5` 2줄(이름 12.5px + 경로 9.5px) ≈ 42px (`Sidebar.svelte:103-124`)
- 에이전트 행: `agentRowClasses`가 `flex-col px-2.5 py-2`(상하 16px), 내부 2줄 — 1줄 = 점8px+제목13px+배지, 2줄 = `mt-1`(4px)+메타 10.5px (`sidebarModel.ts:3-9`, `Sidebar.svelte:159-170`). 행 ≈ **55px**, 행 간 `gap-1`(4px).

**섹션 1개(에이전트 5개, 각기 다른 worktree) 세로 길이 계산:**

| 요소 | 높이 |
|---|---|
| section 패딩(상하) | 12px |
| 프로젝트 헤더(2줄) | 42px |
| worktree 컨테이너 `mt-1` | 4px |
| 에이전트 행 5개 × 55px | 275px |
| 행 간 gap 4개 × 4px | 16px |
| **섹션 합계** | **≈ 349px** |

**프로젝트 10개(gap-3=12px, 상단 Overview 버튼 h-10=40px 포함):**
`10 × 349 + 9 × 12(섹션 간격) + 40(오버뷰) + 12 ≈ 3,650px`

**뷰포트 대비 스크롤 비용:**
- 사이드바 ScrollArea 가용 높이 = 창높이 − 타이틀바 48px(`TitleBar.svelte:31` `h-12`) − 상태바 30px(`StatusBar.svelte:95` `h-[30px]`) − 사이드바 헤딩 36px(`Sidebar.svelte:76` `h-9`).
- 900px 창 → 786px 가용. **3,650 / 786 ≈ 4.6화면**. 50개 에이전트 전부를 훑으려면 뷰포트 4.6개 분량을 스크롤해야 한다.
- 폭: 기본 22% × 1440px = **약 317px**(`App.svelte:111`). `px-2`·스크롤바 제외 ≈ 295px. 제목(`truncate` — `Sidebar.svelte:162`)·브랜치(`Sidebar.svelte:167`)가 20자 남짓에서 잘린다.

### 1.3 치명적 결함 — 프로젝트 단위 상태 롤업 부재

프로젝트 헤더(`Sidebar.svelte:103-124`)에는 **폴더명·경로·추가·삭제 버튼만** 있다. `derived.ts`에 `statusCounts`(37-41)가 존재하지만 사이드바 어디에도 프로젝트별 상태 카운트가 렌더되지 않는다. 그 결과:
- "프로젝트 X에 지금 입력 대기(blocked) 에이전트가 있나?"를 알려면 **그 섹션을 펼쳐 모든 행의 점/배지를 눈으로 스캔**해야 한다.
- `worktreeGroups`(`derived.ts:43-56`)는 상태를 집계하지 않는다. 접어서 요약을 볼 수단이 없고, 프로젝트 접기(collapse) 기능 자체가 없다.

→ "다중 프로젝트를 한눈에"의 반대. 확장성 붕괴 지점.

### 1.4 오버뷰의 대안적 한계

오버뷰(`OverviewGrid.svelte`)는 검색·정렬·필터(`:87-117`)가 있어 스캔엔 낫지만:
- 타일 그리드 `auto-fit minmax(245px)`(`:122`) → 메인폭 ~1000px에서 4열. 50개면 13행 × 210px ≈ **2,730px** 세로 스크롤.
- 각 타일이 **살아있는 xterm 버퍼 스냅샷을 렌더**한다(`previewOf` → `terminalPool.snapshot`, `:74-77`, `:125`, `:142-143`). 50개 동시 렌더 시 성능·인지 부하 모두 큼. 상태 판별보다 터미널 텍스트가 시선을 가져간다(§2).
- 오버뷰는 사이드바와 배타(모드 전환). 드릴인하면 함대 대시보드가 사라진다.

---

## 2. (b) 시각 우선순위 — 시선은 어디로 먼저 가는가

### 2.1 상태 신호가 시선 주변부에 있다

에이전트 행의 시각 위계(`Sidebar.svelte:159-170`):
1. 가장 큰 텍스트 = **제목 13px `font-medium`**(`:162`) → 시선 1순위.
2. 상태 점 = **8px, 색만**(`StatusDot.svelte:12` size=8, `statusDot.ts`) → 좌측 최말단, 작음.
3. 상태 배지 = 10.5px pill, **우측 정렬**(`StatusBadge.svelte`, `statusBadge.ts`) → 우측 끝, 읽으려면 눈을 우측 가장자리로.

즉 "이 에이전트가 나를 기다리는가"라는 **가장 중요한 정보가 가장 약하게, 가장 바깥에** 배치돼 있다. 스캔 시 제목을 먼저 읽고 상태는 나중에 확인하게 된다.

오버뷰 타일도 동일 문제 + 역전:
- `tileClass`(`OverviewGrid.svelte:64-70`): **blocked만 글로우** 강조, `idle=opacity-70`, `done=opacity-90`, **`running`은 `""`(강조 없음)**. 활발히 도는 에이전트가 평범한 타일과 동일해 "지금 뭐가 움직이나"가 안 보인다.
- 타일에서 가장 큰 요소는 `flex-1`인 **터미널 미리보기 박스**(`:142`). 시선이 상태(7px 점, `:134)`가 아니라 터미널 텍스트로 감.

### 2.2 폰트 크기 난립 — 13종

앱 전체에서 확인된 명시적 폰트 크기(근거):

| px | 근거(예시) |
|---|---|
| 8.5 | `StatusBar.svelte:117`(notConnected), `FilePanel.svelte:125,145`(+/- 카운트) |
| 9 | `Sidebar.svelte:143`(shared count), `StatusBar.svelte:106,127`(provider/CPU), `AttentionInbox.svelte:42,82`(배지), `TaskBoard.svelte:132`(프로젝트) |
| 9.5 | `Sidebar.svelte:115,140`(경로/브랜치), `TitleBar.svelte:63`(kbd), `AgentDetail.svelte:170,205`, `StatusBar.svelte:95`, `FilePanel.svelte:155` |
| 10 | `OverviewGrid.svelte:138`(브랜치), `AttentionInbox.svelte:55,87` |
| 10.5 | `Sidebar.svelte:165`, `OverviewGrid.svelte:84,142,145`, `StatusChips.svelte:23`, `statusBadge.ts`, `AgentDetail.svelte:100,116,126` |
| 11 | `Sidebar.svelte:77,129`, `OverviewGrid.svelte:101`, `TitleBar.svelte:58`, `FilePanel.svelte:123,143` |
| 11.5 | `OverviewGrid.svelte:91,111`, `AgentDetail.svelte:139,172` |
| 12 | `FilePanel.svelte:153`, `AttentionInbox.svelte:80`, `TaskBoard.svelte:127` |
| 12.5 | `Sidebar.svelte:87,114`, `OverviewGrid.svelte:135`, `AgentDetail.svelte:125`, `AttentionInbox.svelte:54` |
| 13 | `app.css:192`(body 기준), `Sidebar.svelte:162`, `TitleBar.svelte:48` |
| 14 | `TaskBoard.svelte:85` |
| 15 | `OverviewGrid.svelte:83` |
| 16 | `AgentDetail.svelte:99`(`text-base`) |

→ **13개의 서로 다른 폰트 크기**가 0.5px 간격까지 섞여 있다. 타이포 스케일이 없어 정보 위계가 크기로 명확히 전달되지 않는다(9px vs 9.5px vs 10px vs 10.5px는 사실상 구분 불가). 유지보수·일관성 모두 취약.

### 2.3 대비·가독성

- 색 토큰: `muted-foreground` 라이트 `#686b75`(`app.css:22`) / 다크 `#8b8d99`(`app.css:73`). 이걸 **8.5~9px**에 얹은 곳이 다수(위 표) → 소형 텍스트 WCAG AA(4.5:1) 미달 가능성 높음. 특히 `text-muted-foreground/70`(`Sidebar.svelte:115`, `OverviewGrid.svelte:138`)은 더 낮다.
- 색 대비 남용: 상태 시맨틱 토큰이 fg/on/base 3변형(`app.css:44-51`)으로 정의돼 배지·칩·글로우·링에서 곳곳에 채도 높은 색이 동시에 켜진다(오버뷰 blocked 글로우 `OverviewGrid.svelte:66` + 배지 + 점 애니메이션). 반대로 running/done은 저강조라, **강조가 blocked 한 곳에만 몰리고 나머지는 밋밋**한 양극화.

---

## 3. (c) 오버뷰 / 상세 / 태스크보드 / Attention Inbox / 타임라인 — 중복·모호성

### 3.1 "상태로 거르기" UI가 3벌 중복

| 위치 | 근거 | 하는 일 |
|---|---|---|
| 타이틀바 StatusChips | `StatusChips.svelte:11-30`, `TitleBar.svelte:51-53` | running/blocked/idle/done 카운트 칩, 클릭 시 `shell.setFilter` |
| 오버뷰 필터 pill | `OverviewGrid.svelte:41-46,108-117` | all/running/blocked/done 필터 |
| Attention Inbox | `AttentionInbox.svelte`, `attention/model.ts:4-6` | blocked+done만 모은 크로스프로젝트 팝오버 |

세 UI 모두 근본적으로 "상태별 에이전트 목록"이다. StatusChips를 누르면 `setFilter`→`goOverview`(`shell.svelte.ts:74-77`)로 오버뷰가 열리며 필터가 걸린다. **Attention Inbox가 보여주는 것 = 오버뷰의 blocked/done 필터 결과와 사실상 동일** 집합(`attention/model.ts:7-18`가 `agent.status`로 필터). 사용자가 "나 기다리는 애 어디서 보지?"에 대해 갈 곳이 3군데라 모호하다.

### 3.2 "무엇을 어디서 보나"가 불명확

| 뷰 | 대상 | 진입 | 겹침/모호 |
|---|---|---|---|
| 사이드바 | 전 에이전트(프로젝트 트리) | 상시 | 오버뷰와 대상 동일(전 에이전트), 표현만 다름 |
| 오버뷰 | 전 에이전트(타일+검색/정렬/필터) | 사이드바 Overview·⌘K | 사이드바와 중복. 상세와 배타 |
| 상세(AgentDetail) | 단일 에이전트(터미널/파일/프리뷰) | 행 클릭 | — (고유) |
| Attention Inbox | blocked+done만 | 타이틀바 벨 | 오버뷰 필터와 동일 집합 |
| TaskBoard | **태스크**(에이전트 아님, todo/doing/done) | 타이틀바 Tasks | 개념은 고유하나 상태 라벨(done)이 에이전트 상태와 혼동 |
| Timeline | 단일 에이전트 감사 로그 | 상세 헤더 | — (고유, 상세 종속) |

핵심 혼선: **사이드바와 오버뷰가 "전 에이전트 목록"을 두 번 제공**하면서 배타적으로 전환된다. TaskBoard의 done과 에이전트의 done(`AgentStatus`)은 다른 축인데 라벨이 겹친다(`TaskBoard.svelte:19-23` vs `labels.ts:8-10`).

---

## 4. (d) 모달 난발 — 흐름 끊김

### 4.1 상시 마운트된 다이얼로그/오버레이 실측

**App.svelte 계층(항상 트리에 존재):**

| # | 컴포넌트 | 근거 | 유형 |
|---|---|---|---|
| 1 | SettingsDialog | `App.svelte:130` | 모달 |
| 2 | CompareDialog | `App.svelte:131` | 모달(팬아웃 diff) |
| 3 | TaskBoard | `App.svelte:132` | 모달(860px) |
| 4 | AgentDialog | `App.svelte:134` | 모달 |
| 5 | FanoutDialog | `App.svelte:137` | 모달 |
| 6 | CommandPalette | `App.svelte:127` | 오버레이 |
| 7 | UpdateBanner | `App.svelte:128` | 배너 |
| 8 | ContextMenuHost | `App.svelte:144` | 오버레이 |
| 9 | ActionErrorRegion | `App.svelte:145` | 오버레이 |

**Sidebar.svelte 계층(추가 6개):**
ProjectDialog(`:191`), AgentDialog(`:192`), DefaultWorkspaceDialog(`:193`), DeleteAgentDialog(`:194`), DeleteProjectDialog(`:195`), RenameAgentDialog(`:196`).

→ **모달 다이얼로그만 11개**(App 5 + Sidebar 6) + 오버레이/팝오버 다수(CommandPalette, AttentionInbox 팝오버 `AttentionInbox.svelte:47-104`, UsagePopover `StatusBar.svelte:120`, 터미널 종류 피커 `AgentDetail.svelte:167-175`).

### 4.2 무엇이 흐름을 끊나 / 무엇을 바꿔야 하나

| 다이얼로그 | 문제 | 권장 형태 |
|---|---|---|
| **TaskBoard**(`App.svelte:132`) | 계획하려고 열면 전체를 덮어 터미널·오버뷰를 참조 못 함. 크로스프로젝트 계획인데 컨텍스트 단절 | **사이드시트 또는 메인 탭**(오버뷰 옆 탭)으로. 함대를 보며 계획 |
| **CompareDialog**(`App.svelte:131`) | 팬아웃 결과 diff 비교 = 검토 작업인데 모달이라 다른 워크스페이스와 나란히 못 봄 | **메인 패널 검토 뷰**(FilePanel/FileViewer 라인 재사용) |
| **FanoutDialog**(`App.svelte:137`) | 프롬프트 작성 중 프로젝트/브랜치 참조가 뒤로 가려짐 | 사이드시트(우측 인라인 패널) |
| Settings / Agent 생성·삭제·리네임 | 전환적(transient)이라 모달 적절 | 유지 |

TaskBoard·Compare·Fanout은 "작업 컨텍스트를 보면서 해야 하는" 작업이므로 모달이 부적절하다.

---

## 5. (e) 빈 상태·로딩·에러 시각 처리 일관성

| 뷰 | 로딩 | 에러 | 빈 상태 | a11y |
|---|---|---|---|---|
| FilePanel | O `:169` | O + 재시도 `:171-174` | O `:176` | `role="status"/aria-live`(:169), `role="alert"`(:171) — **유일하게 완전** |
| OverviewGrid | **X**(타일은 라이브 스냅샷/`previewPlaceholder`만, `:143`) | X | O `:161-166` | 라이브리전 없음 |
| Sidebar | **X** | X | O `:182-185` | 없음 |
| AttentionInbox | X | X | O `:99-101` | 팝오버 role="dialog"(`:50`) |

문제:
- **초기 로딩 스켈레톤 부재**: `onMount`에서 `projectStore.load()` 등 병렬 로드(`App.svelte:61-82`)하지만 앱 전역·사이드바·오버뷰에 로딩 표시가 없다. 첫 실행 시 빈 화면 → 갑자기 채워짐.
- **에러 처리 일관성 부재**: FilePanel만 에러+재시도를 제공. 프로젝트/에이전트 로드 실패의 시각 처리는 `ActionErrorRegion`(전역 토스트성)에 위임돼 뷰 내 컨텍스트가 없다.
- 스크린리더 고지는 FilePanel에만 있다(다른 곳은 로딩/빈 상태를 읽어주지 않음).

---

## 6. (f) 접근성

| 항목 | 상태 | 근거 |
|---|---|---|
| 색만으로 상태 구분 | **부분 위반** | StatusDot은 색+애니메이션만(`statusDot.ts`). 사이드바는 StatusBadge(텍스트 라벨 있음, `statusBadge.ts`)와 공존해 OK. **오버뷰 타일(`OverviewGrid.svelte:134` 라벨 없는 7px 점)**, **상세 터미널 탭(`AgentDetail.svelte:142` 6px 점)**은 색만으로 상태 표현 |
| running vs done 혼동 | 위험 | running=green(163), done=blue(233) 모두 채도 높은 한랭계. 6~8px 점에서 색맹·소형 화면 구분 난이도 |
| 중첩 인터랙티브 | 위반 | 오버뷰 타일이 `role="button" tabindex=0`인 `<div>`(`OverviewGrid.svelte:126-132`)인데 내부에 `openAction` `<button>`(`:151-155`) 중첩 → 버튼 안의 버튼 안티패턴 |
| 포커스 링 | 양호 | 전역 `outline-ring/50`(`app.css:177`), 선택 시 `ring-sidebar-ring` |
| 키보드 탐색 | 부분 | ⌘K 팔레트 O(`App.svelte:84-89`, `CommandPalette.svelte`). 그러나 사이드바/오버뷰에 **에이전트 간 방향키 이동 없음**(Tab 순서 의존, 50개면 Tab 지옥) |
| reduced-motion | 양호 | `app.css:117-120`에서 dot/ring 애니메이션 차단 |
| 소형 텍스트 대비 | 위반 가능 | §2.3 참조(8.5~9px + muted/70) |
| aria 라벨 | 대체로 양호 | 아이콘 버튼에 `aria-label` 다수(예 `Sidebar.svelte:78,118,121`) |

---

## 7. 경쟁 제품 구조 비교 (Orca / Superset vs 본 앱)

출처:
- Orca 랜딩(실제 UI 프리뷰 포함): https://www.onorca.dev/ (조사일 2026-07-27)
- Orca 저장소: https://github.com/stablyai/orca (Star 29.6k, MIT)
- Superset 랜딩: https://superset.sh/ , 문서: https://docs.superset.sh , MCP: https://docs.superset.sh/mcp-server

Orca 랜딩의 실제 화면 캡처에서 확인된 구조: 좌측 사이드바에 **Projects** 헤더 + 저장소(acme-web4, acme-internal) + 그 아래 worktree/브랜치 목록(checkout-flow-v2, feature/… 등)과 **`5 agents` 카운트 배지**, 그리고 각 에이전트가 지금 하는 작업을 **자연어 + 경과시간으로** 나열("running checkout regression tests 49m", "validating EU promo codes 3h", "reviewing tax calculation module 4h"), 상태는 체크(완료)/스피너(진행) 아이콘으로 구분. 상단에 **Kanban 보드** 아이콘, 중앙에 Claude Code 터미널의 구조화된 도구 호출 출력. iOS/Android 동반 앱 + macOS/Windows/Linux.

| 구성 요소 | Orca | Superset | 본 앱(근거) |
|---|---|---|---|
| 좌측 사이드바에 프로젝트→worktree 트리 | O | O(대시보드) | O `Sidebar.svelte:94-186` |
| **프로젝트/worktree별 에이전트 카운트 배지** | **O("5 agents")** | O | **X**(`statusCounts` 존재하나 미렌더) |
| **사이드바에 "지금 무슨 작업 중"(자연어+경과시간)** | **O** | 부분 | **X** — `lastActivity` 텍스트만(`Sidebar.svelte:168`) |
| 함대 대시보드와 상세를 동시에 | O(트리 상시 + 중앙 상세) | O(한 대시보드에서 모니터+전환) | **부분** — 사이드바 상시지만 오버뷰↔상세 배타(`MainPanel.svelte:12-21`) |
| 상태를 아이콘/색으로 즉시 구분 | O(체크/스피너 등 형태 차이) | O | 부분 — 색 위주(§6) |
| 칸반/태스크 보드 | O | O(tasks) | O `TaskBoard.svelte`(모달) |
| 앱 내 diff 검토 | O | O("one dashboard") | O `FilePanel`/`FileViewer`/`CompareDialog` |
| 내장 에디터 | O | 부분(IDE 딥링크) | O `FileViewer.svelte` |
| 라이브 미리보기(프리뷰) | O(브라우저 프리뷰) | 포트 관리 | O `Preview.svelte` |
| 지속 터미널(재시작 생존) | O | **O(명시)** | 부분(PTY, 검증 필요 — Lane E 소관) |
| 자동화/스케줄 | 부분 | **O(cron automations)** | X |
| MCP로 외부 제어 | 부분 | **O(27 tools)** | X |
| 모바일 동반 앱 | **O(iOS/Android)** | X | X(로드맵) |
| 다국어(ko/en) | X(영어) | X | **O**(본 앱 우위) |
| 상태 온도계 시각(칩/도트) | 보통 | 보통 | 과함(§2, 본 앱이 색은 더 씀) |

**시사점:** 경쟁사는 사이드바 자체를 "함대 상태 대시보드"로 쓴다(카운트+현재작업+경과시간). 본 앱은 사이드바를 "네비게이션 트리"로만 쓰고 상태 요약은 오버뷰/Attention/칩으로 분산·중복시켰다. 이것이 "한눈에" 실패의 구조적 원인이다.

---

## 8. 마찰 항목 통합 표

| # | 마찰 | 근거(파일:줄) | 심각도 | 사용빈도 | 난이도 | 개선안 |
|---|---|---|---|---|---|---|
| D1 | 프로젝트/worktree별 상태 롤업(카운트) 부재 → 10프로젝트에서 통째 스캔 | `Sidebar.svelte:103-124`, `derived.ts:37-41`(미사용) | 상 | 상 | S | 프로젝트 헤더에 running/blocked/done 카운트 칩(StatusChips 재사용) |
| D2 | 사이드바 세로 3,650px·4.6화면 스크롤, 접기 불가 | §1.2 계산, `Sidebar.svelte:94-186` | 상 | 상 | M | 프로젝트 섹션 접기 + 에이전트 행 밀도(compact) 토글 + 가상 스크롤 |
| D3 | 함대 대시보드(오버뷰)와 상세가 배타 모드 | `MainPanel.svelte:12-21` | 상 | 상 | M | 상세를 오버뷰 위 오버레이/탭으로, 또는 사이드바를 상태 대시보드화 |
| D4 | 상태 신호가 시선 주변부(8px 점+우측 배지) | `Sidebar.svelte:159-170`, `StatusDot.svelte:12` | 상 | 상 | S | 행 좌측 상태 컬러 레일(4px bar) + 상태 우선 정렬 옵션 기본화 |
| D5 | 오버뷰 타일 running 무강조, 시선은 터미널 텍스트로 | `OverviewGrid.svelte:64-70,142` | 중 | 상 | S | running에 은은한 테두리/링, 상태 배지를 타일 상단 좌측 고정 |
| D6 | 폰트 크기 13종 난립(8.5~16px) | §2.2 표 | 중 | 상 | M | 6단 타이포 스케일(11/12/13/14/16/20 등)로 통일 |
| D7 | 소형 텍스트(8.5~9px)+muted 대비 미달 가능 | `StatusBar.svelte:106,117`, `FilePanel.svelte:125` 등 | 중 | 중 | S | 최소 10px 하한 + 대비 토큰 상향 |
| D8 | 상태 필터 UI 3벌 중복(칩/오버뷰/Attention) | `StatusChips.svelte`, `OverviewGrid.svelte:108-117`, `AttentionInbox.svelte` | 중 | 상 | M | Attention을 "액션 큐"로 특화(단순 상태필터와 차별화), 칩은 카운트 표시+점프만 |
| D9 | App 계층 상시 모달 11개, TaskBoard/Compare/Fanout이 흐름 끊음 | `App.svelte:130-143`, `Sidebar.svelte:191-196` | 중 | 중 | M | TaskBoard→탭, Compare→메인 검토뷰, Fanout→사이드시트 |
| D10 | 오버뷰 타일 중첩 인터랙티브(div[role=button]>button) | `OverviewGrid.svelte:126-155` | 중 | 중 | S | 타일을 `<button>`으로, 내부 액션은 별도 영역/우클릭 |
| D11 | 색만으로 상태 구분(오버뷰/터미널 탭 점) | `OverviewGrid.svelte:134`, `AgentDetail.svelte:142` | 중 | 중 | S | 점 옆 상태 텍스트/형태(아이콘) 병기(showLabel 활용) |
| D12 | 로딩/에러 상태 뷰별 불일치(FilePanel만 완비) | `FilePanel.svelte:169-176` vs `OverviewGrid`/`Sidebar` | 중 | 중 | M | 공용 로딩 스켈레톤/에러 컴포넌트 + aria-live 표준화 |
| D13 | 에이전트 간 방향키 탐색 없음(50개 Tab 지옥) | `Sidebar.svelte`, `OverviewGrid.svelte`(키핸들러 부재) | 하 | 중 | M | 사이드바/오버뷰에 ↑↓/←→ 로빙 tabindex |
| D14 | 타이틀바 장식 이퀄라이저가 실데이터 아님 | `TitleBar.svelte:43-47`(aria-hidden) | 하 | 하 | S | 실제 전역 상태 미니 게이지로 교체하거나 제거 |
| D15 | TaskBoard done ↔ AgentStatus done 라벨 혼동 | `TaskBoard.svelte:19-23`, `labels.ts:8-10` | 하 | 하 | S | 태스크 컬럼 라벨을 "완료됨/진행/할일" 등 축 구분 어휘로 |

---

## 9. 대안 레이아웃 와이어프레임

### 와이어프레임 A — "사이드바를 함대 상태 대시보드로" (Orca 계열, 최소 변경)

핵심: 사이드바 프로젝트 헤더에 상태 카운트를 넣고, 접기와 밀도 토글을 추가해 10×5를 접힌 요약으로 파악. 상세는 유지.

```
┌──────────────────────────────────────────────────────────────────────────┐
│ [☰] ▮▮▮ Worklane        running 12 · blocked 3 · idle 30 · done 5   [⌘K][🔔3][Tasks][+]│  ← 칩=카운트+점프
├───────────────────────┬────────────────────────────────────────────────────┤
│ SIDEBAR (상태 대시보드) │ MAIN                                               │
│ ▸ Overview            │                                                    │
│ ─────────────────     │   [ 선택된 에이전트 상세  또는  오버뷰 ]            │
│ ▾ acme-web  ●2 ▲1 ○2 │   ← 프로젝트 헤더에 running●/blocked▲/idle○ 카운트  │
│   │▎checkout-flow  ▲  │      (접으면 이 줄만 보임 → 10프로젝트=10줄로 요약) │
│   │▎auth-refresh   ●  │                                                    │
│   │▎cart-email     ○  │   * 좌측 3px 컬러 레일(▎)로 상태를 행 맨 앞에 고정  │
│ ▸ acme-internal ●1 ▲2│   * [밀도] compact(1줄)/comfort(2줄) 토글          │
│ ▸ infra-tools   ○5    │                                                    │
│ ▸ ...(접힘)           │                                                    │
├───────────────────────┴────────────────────────────────────────────────────┤
│ USAGE  CLAUDE▮▮ 42%   CODEX ...                              CPU ▮  RAM ▮   │
└──────────────────────────────────────────────────────────────────────────┘
```
- 변경 파일: `Sidebar.svelte`(프로젝트 헤더에 카운트+접기), `sidebarModel.ts`(compact 행 클래스), `derived.ts`의 `statusCounts`를 프로젝트 단위로 재사용, `shell.svelte.ts`(접힘·밀도 상태).
- 효과: 접힌 상태에서 10프로젝트=약 10~14줄 → 스크롤 없이 함대 파악. D1·D2·D4 동시 해소.

### 와이어프레임 B — "Attention-first 홈" (액션 큐 + 히트맵)

핵심: 홈 화면(에이전트 미선택 시)을 "내가 처리해야 할 순서"로 재편. 상단은 우선순위 큐(blocked→running), 하단은 프로젝트×에이전트 히트맵으로 전체를 한 화면에.

```
┌──────────────────────────────────────────────────────────────────────────┐
│ [☰] Worklane                                     [⌘K] [🔔] [Tasks] [+ New] │
├───────────────┬────────────────────────────────────────────────────────────┤
│ acme-web    ▲2│  ACTION QUEUE  (blocked 먼저, 그다음 최근 running)          │
│ acme-internal │  ┌────────────────────────────────────────────────────┐   │
│ infra-tools   │  │ ▲ checkout-flow  · acme-web   "질문 대기"   [열기 →] │   │
│ ...           │  │ ▲ webhook-retry  · acme-int   "확인 필요"   [열기 →] │   │
│               │  │ ● cart-email     · acme-web   47분째 실행   [보기 →] │   │
│               │  └────────────────────────────────────────────────────┘   │
│               │  FLEET HEATMAP  (행=프로젝트, 칸=에이전트, 색=상태)         │
│               │        a1  a2  a3  a4  a5                                   │
│               │  web   ●   ▲   ○   ✔   ●     ← 한 화면에 10×5=50칸          │
│               │  int   ▲   ●   ○   ○   ▲                                    │
│               │  infra ○   ○   ○   ○   ○     클릭=상세, 호버=미리보기       │
│               │  ...(10행)                                                  │
├───────────────┴────────────────────────────────────────────────────────────┤
│ USAGE ...                                                          CPU/RAM  │
└──────────────────────────────────────────────────────────────────────────┘
```
- 변경 파일: `OverviewGrid.svelte`를 큐+히트맵 두 섹션으로 재구성(또는 신규 `HomeDashboard.svelte`), `attention/model.ts`(큐 정렬 재사용), `overviewModel.ts`(정렬/필터 재사용). 사이드바는 좁은 프로젝트 카운트 레일로 축소.
- 효과: 50 에이전트를 스크롤 0으로 히트맵에 표시(칸 24px면 5열×10행≈300×250px). "누구를 먼저 처리?"에 대한 단일 답을 큐가 제시. D3·D8·D5 해소, 라이브 xterm 50개 렌더 비용도 제거(히트맵은 색만).

---

## 10. Top 5 즉시 개선 제안 (우선순위 순)

### ① 프로젝트 헤더에 상태 카운트 롤업 추가 (D1, 난이도 S, 효과 최대)
- **파일:** `src/lib/components/shell/Sidebar.svelte:103-124`(프로젝트 헤더 div)
- **방법:** 이미 있는 `statusCounts`를 프로젝트 단위로 계산해(현재는 전역만 — `src/lib/shell/derived.ts:37-41`을 `statusCountsForProject(project)`로 오버로드 추가) 헤더 우측에 `StatusChips`(`src/lib/components/shell/StatusChips.svelte`) 축소판 렌더. blocked>0이면 그 칩만 강조.
- **근거:** Orca는 사이드바에 "5 agents"와 상태를 노출(https://www.onorca.dev/). 현재 헤더엔 이름/경로/버튼뿐(`Sidebar.svelte:104-124`).

### ② 프로젝트 섹션 접기 + 행 밀도 토글 (D2, 난이도 M)
- **파일:** `src/lib/components/shell/Sidebar.svelte`(섹션 `<section>` `:103`에 접힘 상태), `src/lib/stores/shell.svelte.ts`(접힌 프로젝트 id Set·밀도 값 추가 — 현재 `#leftPanelOpen` 등과 같은 패턴 `:16-26`), `src/lib/components/shell/sidebarModel.ts:3-9`(`agentRowClasses`에 compact 변형 = `py-1` 1줄).
- **효과:** 접으면 ①의 카운트만 남아 10프로젝트=약 10~14줄. 3,650px→ 수백 px.

### ③ 에이전트 행 좌측 상태 컬러 레일 + 상태 우선 시선 (D4·D5, 난이도 S)
- **파일:** `src/lib/components/shell/sidebarModel.ts`(`agentRowClasses`에 `border-l-[3px] border-status-*` 추가), `src/lib/components/shell/OverviewGrid.svelte:64-70`(`tileClass`에서 `running`도 `border-status-running/40` 부여, 무강조 제거).
- **근거:** 현재 상태는 8px 점(`StatusDot.svelte:12`)+우측 배지로 주변부. running 타일은 `""`(`OverviewGrid.svelte:69`).

### ④ Attention Inbox를 "액션 큐"로 특화하고 중복 필터 축소 (D8, 난이도 M)
- **파일:** `src/lib/components/shell/AttentionInbox.svelte`(정렬은 `src/lib/attention/model.ts:20-49` 유지하되, "다음 처리 대상 1건 점프" 버튼·처리 완료 표시 추가), `src/lib/components/shell/StatusChips.svelte`(클릭 동작을 필터가 아니라 "해당 상태 첫 에이전트로 점프"로 변경 검토 — 현재 `:25` `setFilter`).
- **근거:** blocked/done 집합이 오버뷰 필터(`OverviewGrid.svelte:41-46`)와 중복. 큐로 특화하면 "여러 에이전트 동시 대기 시 처리 순서"(브리프 항목) 문제도 해결.

### ⑤ TaskBoard·CompareDialog를 모달에서 인라인으로 (D9, 난이도 M)
- **파일:** `src/App.svelte:131-132`에서 `CompareDialog`·`TaskBoard` 제거하고, `MainPanel.svelte:12-21`에 뷰 분기 추가(`shell` 스토어에 `mainView: "overview"|"tasks"|"compare"|"agent"` 도입 — 현재 배타 분기 패턴 `MainPanel.svelte:13-20`). TaskBoard 본문(`src/lib/components/shell/TaskBoard.svelte:82-153`의 `Dialog.Root`)을 패널 래퍼로 감싸는 형태로 재사용.
- **효과:** 계획·비교 중에도 사이드바 함대·터미널을 참조 → 컨텍스트 단절 제거. App 상시 모달 11개(§4.1)에서 2개 감소.

---

## 부록 — 조사 방법

- 실제 코드 정독: `App.svelte`(147줄), `Sidebar.svelte`(197), `MainPanel.svelte`, `OverviewGrid.svelte`(170), `AgentDetail.svelte`(211), `FilePanel.svelte`(189), `StatusBar.svelte`(138), `StatusChips.svelte`, `StatusDot.svelte`/`statusDot.ts`, `StatusBadge.svelte`/`statusBadge.ts`, `AttentionInbox.svelte`(106), `TitleBar.svelte`(99), `Timeline.svelte`, `TaskBoard.svelte`(154), `CommandPalette.svelte`, `derived.ts`, `sidebarModel.ts`, `overviewModel.ts`, `attention/model.ts`, `stores/shell.svelte.ts`, `stores/uiSettings.svelte.ts`, `app.css`(195), `data/labels.ts`.
- 세로 길이·폰트 수치는 위 파일의 Tailwind 클래스(`px-*`, `py-*`, `text-[Npx]`, `h-*`)에서 직접 산출.
- 경쟁 제품은 web fetch로 실제 랜딩/문서를 읽고 UI 프리뷰 텍스트에서 구조 추출(§7 출처).
