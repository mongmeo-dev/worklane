# Lane A — 온보딩 및 첫 실행 경험 감사

- 작성: 2026-07-27
- 기준 커밋: `cd8bc81 chore: v0.1.6`
- 범위: 앱을 처음 켠 사용자가 **"첫 에이전트가 실제로 돌아가는 상태"** 에 도달하기까지의 전 경로
- 방법: 코드 정적 추적(파일:줄 근거) + Orca/Superset 공식 문서 조사
- 성격: 발굴 전용. 제품 소스는 한 줄도 수정하지 않았다.

> 참고: 팀 브리프가 지정한 `docs/ux-audit/00-context.md`는 이 워커 worktree에는 없고 메인 워크트리
> (`/Users/benny/development/personal/ai-agent-workspace/docs/ux-audit/00-context.md`)에만 존재한다.
> 해당 파일을 메인 워크트리에서 직접 읽어 컨텍스트로 반영했다.

---

## 0. 요약 — 왜 "Orca보다 불편"한가

첫 실행 경로를 코드로 끝까지 따라가 보면, 불편함의 정체는 **기능이 없어서가 아니라 앱이 저장소에 대해
아무것도 모른 채 사용자에게 되묻기 때문**이다. Worklane은 프로젝트 경로 하나만 알고, 그 저장소의
기본 브랜치도·설치된 CLI도·기존 브랜치 목록도 조회하지 않는다. 그래서:

1. **분기 기준이 `"main"` 문자열로 하드코딩**돼 있다(`src/lib/components/shell/AgentDialog.svelte:22`).
   저장소가 `master`/`develop`이면 워크스페이스 생성이 raw git 에러로 실패한다. Orca는 저장소를 등록하는
   순간 기본 브랜치를 읽어 **base ref**로 잡는다.
2. **에이전트 CLI가 설치돼 있는지 확인하지 않는다.** 미설치면 셸이 `command not found`를 뱉고 즉시
   종료하는데, 상태 엔진은 프로세스 종료를 최우선으로 `Done`으로 판정한다
   (`src-tauri/src/status/engine.rs:6-9`). 결과적으로 **설치 안 된 에이전트가 초록색 "완료"로 표시된다.**
3. **모든 실패가 단일 문구로 뭉개진다.** `actionErrors.report()`는 인자를 통째로 버리고 id만 저장하며
   (`src/lib/stores/actionErrors.svelte.ts:5-7`), 화면에는 항상 `"작업에 실패했습니다."`만 뜬다
   (`src/lib/components/context-menu/ActionErrorRegion.svelte:10`, `src/lib/i18n/messages.ts:507`).
4. **새 worktree 초기화 수단이 전혀 없다.** `setup_script`/`postCreate` 계열 코드는 저장소 전체에 0건이다.
   `git worktree add`는 추적 파일만 체크아웃하므로 `.env`·`node_modules`가 없는 상태로 에이전트가 시작한다.
   Superset은 이 문제를 **Setup/Teardown Scripts**로 정면 해결한다.

정량으로는 **첫 프로젝트 등록까지는 Orca와 거의 동률(5클릭)** 이지만, **두 번째 워크스페이스부터
Worklane이 왕복 조작 2회 + 타이핑 10~20타를 더 요구**하고, **실패 시 복구 경로가 코드상 존재하지 않는다.**

---

## 1. 첫 실행 경로 코드 추적

### 1-1. 빈 상태(프로젝트 0개)에서 실제로 보이는 화면

| 영역 | 코드 | 0개일 때 렌더 결과 |
|---|---|---|
| 사이드바 | `Sidebar.svelte:182-185` | "아직 프로젝트가 없습니다." + `프로젝트 추가` 링크 (유일한 실질 CTA) |
| 메인 패널 | `MainPanel.svelte:12-19` → `OverviewGrid.svelte:161-166` | "표시할 에이전트가 없습니다." + `전체 에이전트 보기` 버튼 |
| 타이틀바 | `TitleBar.svelte:70,74` | `새 에이전트`·`팬아웃` 버튼 `disabled={projects.length === 0}` |
| 커맨드 팔레트 | `src/lib/palette/model.ts:10-17` | 액션 5개 그대로 노출(비활성화 없음) |

화면 면적의 80%를 차지하는 메인 패널이 **"전체 에이전트 보기"** 라는, 프로젝트가 0개일 때는
아무 의미 없는 버튼(`shell.setFilter("all")`)만 제시한다. 첫 실행자가 가장 먼저 보는 문장이
"에이전트가 없다"이지, "저장소를 추가하세요"가 아니다.

### 1-2. 프로젝트 추가 → 첫 워크스페이스 실행 (기본 작업환경 경로)

```
Sidebar "프로젝트 추가"          [클릭 1]
  → ProjectDialog.svelte
      이름           (필수, 폼 첫 필드)          [타이핑 N 또는 자동]
      첫 작업환경 에이전트 (기본 claude-code)      [0]
      경로           (readonly, 피커 강제)        [클릭 1 + 네이티브 탐색 2]
      "추가"                                    [클릭 1]
  → projectStore.addProject()                  (projects.svelte.ts:60-70)
  → ipc.createProject()                        (ipc/projects.ts:13-20)
  → create_project_with_default_agent          (commands.rs:669-690)
      validate_default_workspace_input         (commands.rs:656-667)
      git::inspect_existing_workspace          (git/mod.rs:17-38)   ← 여기서 처음 git 검사
      insert_project_with_default_agent        (repo.rs:244-262)
  → shell.selectAgent(defaultAgent.id)         (ProjectDialog.svelte:44)
  → AgentDetail → Terminal.svelte:139-160
  → terminalPool.acquire → createSession       (terminal/pool.ts:145-165)
  → pty::create → build_command                (pty/manager.rs:36-51, 74-81)
      $SHELL -l -i -c "claude"
```

**최소 상호작용: 클릭 5회 + 네이티브 폴더 탐색.** Orca의 `Add Repo → 경로 선택` 과 동수다.
여기까지는 경쟁 제품과 대등하다.

### 1-3. 두 번째 워크스페이스(격리 worktree) 생성

```
TitleBar "새 에이전트"                         [클릭 1]
  → App.svelte:38-40  newAgentProject = projects[0] 고정
  → AgentDialog.svelte
      작업 이름  (선택)                          [0]
      종류      (기본 claude-code)               [0]
      실행 커맨드 (kind 기본값 자동)               [0]
      브랜치     필수 · 기본값 없음 · 자동완성 없음   [타이핑 10~20]
      분기 기준   "main" 하드코딩 (line 22)         [0 또는 타이핑 6~8]
      worktree 경로 (선택)                       [0]
      "추가"                                    [클릭 1]
  → create_agent (commands.rs:793-880)
      wt_path = app_data_dir/worktrees/<project uuid>/<branch>  (816-828)
      git::create_worktree (git/mod.rs:42-65)
```

**최소 상호작용: 클릭 2회 + 브랜치 타이핑.** 단, 저장소 기본 브랜치가 `main`이 아니면
`git worktree add -b <branch> <path> main` 이 `fatal: invalid reference: main`으로 실패하고,
사용자는 다이얼로그 하단에서 raw git 문자열을 읽은 뒤 필드를 고쳐 다시 제출해야 한다
(**왕복 조작 +2회**).

---

## 2. 마찰 목록

심각도 = 첫 실행 성공을 얼마나 방해하는가 / 사용빈도 = 온보딩 구간에서 마주칠 확률 /
구현난이도 S(≤반나절) · M(1~3일) · L(3일 초과)

| # | 마찰 | 근거(파일:줄) | 심각도 | 사용빈도 | 난이도 | 개선안 |
|---|---|---|---|---|---|---|
| A-01 | 빈 상태 메인 화면에 프로젝트 추가 CTA가 없다. 0개일 때도 "표시할 에이전트가 없습니다 / 전체 에이전트 보기"만 뜨고, 이 버튼은 `setFilter("all")`이라 아무 변화도 없다 | `OverviewGrid.svelte:161-166`, `shell.svelte.ts:75-78` | 상 | 상 | S | `projects.length === 0` 분기를 추가해 "저장소 추가" 히어로(1클릭)와 3단계 체크리스트를 메인에 렌더. 클릭 경로를 사이드바 전용 → 메인/사이드바 2경로로 |
| A-02 | `ProjectDialog`가 `Sidebar` 안에만 마운트돼 있어, 사이드바를 닫은 채 앱을 재시작하면 **프로젝트를 추가할 방법이 0개**가 된다 | `Sidebar.svelte:191`, `App.svelte:108-119`, `shell.svelte.ts:101-104`(localStorage `shell:left-open` 영속) | 상 | 중 | S | `ProjectDialog`를 `App.svelte`로 승격하고 `shell` 스토어에 `projectDialogOpen`을 둬 사이드바 상태와 분리 |
| A-03 | 커맨드 팔레트에 "프로젝트 추가"가 없고, 0개일 때 `새 에이전트`/`팬아웃`을 실행하면 **아무 일도 일어나지 않는다**(가드 `{#if newAgentProject}`가 false라 다이얼로그 자체가 미마운트). 타이틀바는 같은 액션을 disable 하는데 팔레트만 살아 있어 동작이 불일치 | `palette/model.ts:10-17`, `CommandPalette.svelte:41-60`, `App.svelte:133-143`, `TitleBar.svelte:70,74` | 상 | 상 | S | 팔레트에 `addProject` 액션 추가 + 프로젝트 0개일 때 project 의존 액션을 목록에서 제거하거나 "먼저 프로젝트를 추가하세요" 안내 항목으로 대체 |
| A-04 | 프로젝트 경로 입력이 `readonly`라 붙여넣기·타이핑·드래그드롭이 전부 막혀 있고 네이티브 피커만 허용 | `ProjectDialog.svelte:88` | 중 | 상 | S | `readonly` 제거 + blur 시 경로 검증. Superset처럼 **Git URL 입력 → clone** 경로도 추가하면 "로컬에 체크아웃부터 해야 함"이라는 선행 조건이 사라진다 |
| A-05 | 폼 순서가 자동 채움을 무력화한다. `pickDir()`은 폴더명을 이름에 자동 대입하지만(`!name`일 때만), 폼은 **이름 → 종류 → 경로** 순이라 위에서부터 채우는 사용자는 이름을 손으로 친다 | `ProjectDialog.svelte:24-30`(자동 채움), `62-65`(이름 필드), `84-90`(경로 필드) | 하 | 상 | S | 경로를 첫 필드로 올리고, 경로 선택 후 이름을 자동 채움(사용자가 수정했으면 유지). 타이핑 5~15타 → 0타 |
| A-06 | 선택한 경로가 git 저장소인지, 기본 브랜치가 무엇인지 **제출 후에야** 확인한다. 실패하면 이미 다이얼로그를 다 채운 뒤다 | `git/mod.rs:17-38`, `commands.rs:677-678` | 중 | 중 | M | 디렉터리 선택 직후 `inspect_existing_workspace` 상당의 검사 명령을 호출해 다이얼로그 안에 "저장소 확인됨 · 기본 브랜치 `master` · 최근 커밋 …" 인라인 프리뷰를 표시. 실패 왕복 1회 → 0회 |
| A-07 | 분기 기준이 문자열 `"main"`으로 하드코딩. 저장소 기본 브랜치를 전혀 참조하지 않는다 | `AgentDialog.svelte:22`, `FanoutDialog.svelte:63,115,208` | **상** | 상 | S | 프로젝트 등록 시 얻은 기본 브랜치(`ExistingWorkspace.branch`, `git/mod.rs:11-15`)를 프로젝트 레코드에 저장하고 두 다이얼로그의 초기값으로 사용. `master` 저장소에서 **실패 왕복 2회 → 0회** |
| A-08 | 브랜치·분기 기준이 자유 텍스트다. 브랜치 목록을 조회하는 IPC 명령 자체가 백엔드에 없다(`list_branches` 검색 0건). 오타는 검증 없이 새 브랜치로 생성된다 | `AgentDialog.svelte:80-87`, `src-tauri/src/git/mod.rs` 전체(브랜치 열거 함수 부재), `git/mod.rs:49-60`(존재하면 attach, 없으면 `-b`) | **상** | 상 | M | `list_branches` 명령 신설 + 두 필드를 콤보박스(검색형)로 교체. Orca의 "start-from ref 피커", Superset의 "New branch from main / Existing branch / Pull request" 3선택과 동등 수준. **타이핑 10~20타 → 0~3타** |
| A-09 | 워크스페이스 이름 기본값이 브랜치명 그대로라 사이드바에서 브랜치 칩과 제목이 중복 표시된다 | `agentDialogModel.ts:31-35`, `commands.rs:783-791`, `Sidebar.svelte:159-167`(제목 + 브랜치 동시 노출) | 하 | 상 | S | 비었을 때 읽기 쉬운 자동 이름을 생성(Orca는 해양생물 이름). 최소한 브랜치와 다른 값이면 중복 표시가 사라진다 |
| A-10 | 기본 worktree 경로가 `app_data_dir/worktrees/<project UUID>/<branch>`라 사람이 식별할 수 없다. 외부 에디터·터미널에서 어느 프로젝트인지 알 수 없다 | `commands.rs:815-828`, `repo.rs:199`(UUID 발급) | 중 | 상 | S | `<project 이름 slug>/<branch>` 로 변경(충돌 시 짧은 해시 suffix). 저장소 밖 경로라 git 안전성은 동일 |
| A-11 | 에이전트 CLI 설치·인증 프리플라이트가 없다. PTY는 `$SHELL -l -i -c "claude"`를 그냥 실행하고, 미설치면 셸이 `command not found` 후 종료한다. `createSession` 자체는 성공하므로 앱은 오류를 인지조차 못 한다 | `pty/manager.rs:36-51`(셸 래핑), `74-81`(spawn), `terminal/pool.ts:141-167`(성공 처리) | **상** | 상 | M | 종류 선택 시 `firstCommandToken()`(`agentKinds.svelte.ts:38-42`) 기반으로 `command -v` 프로브 명령을 호출해 다이얼로그 안에 ✓/✗ 배지 표시. ✗면 설치 명령을 복사 가능한 형태로 제시 |
| A-12 | 그 결과 **설치되지 않은 CLI가 "완료(done)"로 표시된다.** 상태 리듀서는 프로세스 종료를 최우선 게이트로 `Done`을 반환하고(250ms 폴러가 즉시 반영), 사이드바·오버뷰·상태칩 전부 초록 "완료"가 된다 | `status/engine.rs:6-9`, `status/poller.rs:21-62`, `messages.ts:514`(`"status.done": "완료"`), `derived.ts:24-29` | **상** | 상 | M | 종료 코드와 세션 수명을 구분해 `failed` 상태를 추가하거나, 최소한 "출력 없이 N초 내 종료"를 `done`에서 제외. 거짓 성공 신호는 상태 트래킹이 핵심 차별화인 제품에서 치명적이다 |
| A-13 | 액션 실패 원인이 전부 폐기된다. `report(_reason)`은 인자를 쓰지 않고 id만 증가시키며, 화면에는 언제나 `"작업에 실패했습니다."` 한 줄만 뜬다 | `stores/actionErrors.svelte.ts:5-7`, `ActionErrorRegion.svelte:10`, `messages.ts:47,507` | **상** | 중 | S | `report(reason)`가 원인 문자열/코드를 보존하고, 표시 컴포넌트가 코드→i18n 메시지로 매핑. 최소한 "자세히" 토글로 원문 노출 |
| A-14 | 백엔드 오류 문자열이 i18n 밖에서 하드코딩된 한국어이거나 raw git stderr다. AGENTS.md의 "사용자 노출 문자열은 `t()` 경유" 규칙 위반이며, 영어 로케일에서도 한국어가 나온다 | `commands.rs:658,661,664,702,705,716,727`, `git/mod.rs:19,22,25,27,32`, `git/mod.rs:1039`(`git {:?} 실패: {stderr}`), 소비부 `AgentDialog.svelte:50`·`ProjectDialog.svelte:50` (`error = String(e)`) | 상 | 중 | M | 백엔드는 `PROJECT_NOT_A_REPO`·`BRANCH_ALREADY_CHECKED_OUT` 같은 **에러 코드**를 반환하고, 프런트가 `t()`로 실행 가능한 문장(원인 + 다음 행동 + 관련 경로)으로 변환 |
| A-15 | 새 worktree 초기화 수단이 없다. `setup_script`·`postCreate` 류 코드는 저장소 전체 0건이고, `verify` 명령은 팬아웃 검증 전용이다. `git worktree add`는 추적 파일만 체크아웃하므로 첫 에이전트는 `.env`·`node_modules` 없는 디렉터리에서 시작한다 | `commands.rs:830-837`(worktree 생성 후 후처리 없음), `src-tauri/src/verify/mod.rs:20-24`(팬아웃 검증 전용), `docs/backlog.md`에도 항목 없음 | **상** | 상 | M | 프로젝트별 "워크스페이스 생성 후 실행" 스크립트 필드 추가 + 생성 직후 실행/로그 노출. Superset의 Setup Scripts와 동일 개념. 이게 없으면 첫 에이전트의 첫 명령이 대개 실패한다 |
| A-16 | 같은 저장소 경로를 중복 등록할 수 있다. `projects.path`에 UNIQUE 제약이 없고 `insert_project`도 검사하지 않는다. 사이드바에 동일 프로젝트가 2개 생기고 각각 같은 경로의 기본 작업환경을 갖는다 | `repo.rs:11-17`(스키마), `repo.rs:193-213`, `commands.rs:669-690` | 중 | 중 | S | 등록 전 정규화 경로로 중복 조회 후 "이미 등록된 프로젝트입니다 — 열기" 로 유도 |
| A-17 | 타이틀바 `새 에이전트`는 항상 `projects[0]`을 대상으로 한다. 다중 프로젝트 사용자가 특정 프로젝트에 워크스페이스를 만들려면 먼저 그 프로젝트의 워크스페이스를 선택해야 한다(다중 프로젝트가 이 앱의 차별화 포인트인데 정작 생성 진입점이 이를 무시) | `App.svelte:38-40`, `AgentDialog.svelte:16`(project를 prop으로만 받음) | 상 | 상 | S | `AgentDialog`에 프로젝트 선택 Select 추가(현재 컨텍스트를 기본값으로). **왕복 조작 3회 → 1회** |
| A-18 | 실패 경로 복구 안내가 없다. worktree 생성 실패·브랜치 충돌·더러운 워킹트리 모두 raw git 문자열만 보여주고, 다음 행동(다른 브랜치명 / 기존 worktree 재사용 / 강제 옵션)을 제시하지 않는다. dirty 처리는 **삭제** 시점에만 존재한다 | `AgentDialog.svelte:48-51`, `git/mod.rs:56-60`(브랜치 존재 시 attach), `DeleteAgentDialog.svelte:30-40`(dirty는 삭제 흐름에만 대응), `git/mod.rs:67-84`(`ERR_WORKTREE_DIRTY`) | 상 | 중 | M | 생성 실패를 코드로 분류하고 각 코드에 1클릭 복구 액션을 붙인다(예: 브랜치 중복 → "`feat/login-2`로 만들기", 이미 체크아웃 → "그 worktree 열기") |
| A-19 | 기본 작업환경 복구 다이얼로그가 브랜치를 고를 수 없다. 저장소의 **현재 checkout 브랜치**로만 만들어지고, detached HEAD면 "현재 checkout이 브랜치를 가리키지 않습니다"로 막힌다 | `DefaultWorkspaceDialog.svelte:34-36`, `commands.rs:719-720`, `git/mod.rs:26-33` | 하 | 하 | S | 브랜치 선택 필드 추가(A-08의 `list_branches` 재사용) |
| A-20 | 온보딩 투어·체크리스트·샘플 프로젝트가 전혀 없다. 첫 실행 시 안내 문구는 사이드바 한 줄(`"아직 프로젝트가 없습니다."`)이 전부이고, "worktree", "분기 기준(start-point)", "기본 작업환경" 같은 앱 고유 개념을 설명하는 UI가 없다 | `messages.ts:563`, `App.svelte:61-101`(첫 실행 분기 없음), `Sidebar.svelte:182-185` | 중 | 상 | M | 프로젝트 0개일 때 3단계 온보딩 카드(저장소 추가 → CLI 확인 → 첫 작업 실행)를 메인에 표시하고 각 개념에 1줄 설명 툴팁 |
| A-21 | `create_project` 명령이 등록돼 있으나 프런트가 호출하지 않는다(프런트는 항상 `create_project_with_default_agent` 사용). 죽은 IPC 표면 | `lib.rs:106`, `commands.rs:638-646`, `ipc/projects.ts:13-20` | 하 | 하 | S | 제거하거나 "기본 작업환경 없이 등록" 옵션으로 실제 연결 |

**총 21건.**

---

## 3. Orca / Superset 첫 실행 경험 비교

출처: Orca `https://www.onorca.dev/docs/first-session`, `https://www.onorca.dev/docs`,
Superset `https://docs.superset.sh/first-workspace`, `https://superset.sh/`.

| 단계 | Orca | Superset | Worklane(현재) | 격차 |
|---|---|---|---|---|
| 저장소 등록 | `Add Repo` → 로컬 체크아웃 지정. **저장소 git 상태를 읽어 기본 브랜치를 base ref로 자동 채택** | 로컬 폴더 **또는 Git URL**. `gh auth status` 전제 명시 | 로컬 폴더만, 경로 입력은 readonly. 기본 브랜치 미조회 | Git URL 미지원 · **기본 브랜치 자동 인식 부재** |
| 워크스페이스 생성 | `+` → 작업 이름(**비우면 자동 명명**) → **start-from ref 피커**(기본 = base ref) | **New branch from main / Existing branch / Pull request** 3택 + 프롬프트 우선 흐름 | 브랜치 자유 타이핑(필수) + 분기 기준 `"main"` 하드코딩 | **ref 피커 부재**, 프롬프트 우선 흐름 부재, PR 기반 생성 부재 |
| 에이전트 선택 | 터미널의 **에이전트 콤보박스**, **기본 에이전트 프리셀렉트**(Settings→Agents), 빈 터미널 옵션도 제공. "correct working directory와 구독 자격증명을 forward" 명시 | CLI 에이전트 무관하게 터미널에서 실행 | 종류 Select + 커맨드 자동 채움, 빈 터미널 옵션 있음 | **대등**(이 단계는 Worklane이 밀리지 않는다) |
| 워크스페이스 초기화 | 워크스페이스 환경 개념 보유 | **Setup / Teardown / Run Scripts** 로 `.env`·`bun install` 자동화 | **없음** | **결정적 격차** — 첫 에이전트가 빌드 불가 상태에서 시작 |
| 첫 작업 지시 | 프롬프트 붙여넣기 | 프롬프트 우선 생성 흐름 | 팬아웃/태스크 경로에만 시드 프롬프트 주입(`terminal/pool.ts:15,206-239`), 단일 워크스페이스 생성 시에는 프롬프트 입력란 없음 | 단일 생성 경로에 프롬프트 필드 부재 |
| 실패 안내 | 전용 Troubleshooting/GitHub errors 문서 | `gh auth status` 선행 조건 명시 | `"작업에 실패했습니다."` 또는 raw git stderr | **실행 가능한 안내 부재** |

### 단계 수 정량 비교

| 시나리오 | Orca | Worklane | 차이 |
|---|---|---|---|
| 앱 실행 → 첫 저장소 등록 | 클릭 ~4 | 클릭 5 + 이름 타이핑(폼 순서 때문) | +1 클릭 +N 타이핑 |
| 두 번째 격리 워크스페이스 생성 (기본 브랜치 = `main`) | 클릭 3 (`+` → 이름 생략 → ref 기본값 → 생성) | 클릭 2 + 브랜치 타이핑 10~20타 | 타이핑 +10~20 |
| 두 번째 격리 워크스페이스 생성 (기본 브랜치 = `master`) | 클릭 3 (base ref가 이미 `master`) | 클릭 2 + 브랜치 타이핑 + **실패** + 분기 기준 수정 + 재제출 = **왕복 2회** | **왕복 +2회** |
| CLI 미설치 상태에서 첫 실행 | 에이전트 목록에서 미설치가 드러남 | 실행 → 즉시 "완료" 배지 → 사용자는 성공했다고 오인 | **복구 불가능한 오해** |
| 새 worktree에서 `pnpm dev` | Setup Script로 사전 설치(Superset) | 실패 → 사용자가 수동으로 `.env` 복사·설치 | **수동 작업 3~5분** |

---

## 4. Top 5 즉시 개선 제안

우선순위는 **(첫 실행 성공률에 미치는 영향) × (사용빈도) ÷ (구현난이도)** 순.

### 1위 — 저장소의 기본 브랜치를 프로젝트에 저장하고 모든 기본값의 원천으로 삼는다 (A-07, A-19)

- **왜 1위인가**: 난이도 S인데 `master`/`develop` 저장소 사용자의 **워크스페이스 생성 실패를 100% 제거**한다.
  현재는 `"main"` 리터럴 하나 때문에 첫 격리 워크스페이스가 raw git 에러로 죽는다.
- **바꿀 파일**
  - `src-tauri/src/store/repo.rs:11-17` — `projects` 테이블에 `default_branch TEXT` 컬럼 추가(마이그레이션 신규 버전).
  - `src-tauri/src/commands.rs:669-690` — `create_project_with_default_agent`가 이미 호출하는
    `git::inspect_existing_workspace`(`git/mod.rs:17-38`)의 `workspace.branch`를 그대로 저장.
  - `src/lib/types.ts` / `src/lib/ipc/projects.ts` — `Project`에 `defaultBranch` 추가.
  - `src/lib/components/shell/AgentDialog.svelte:22` — `let startPoint = $state("main")`
    → `$state(project.defaultBranch ?? "main")`.
  - `src/lib/components/shell/FanoutDialog.svelte:63,115,208` — 동일 처리.
- **효과**: `master` 저장소에서 **왕복 조작 2회 → 0회**.

### 2위 — 에이전트 CLI 프리플라이트 + `done` 오판 차단 (A-11, A-12)

- **왜 2위인가**: 미설치 CLI가 **초록색 "완료"** 로 보이는 건 단순 불편이 아니라 **거짓 정보**다.
  상태 트래킹이 이 제품의 핵심 차별화라고 문서에 명시(`README.ko.md:50-62`)한 이상 여기가 무너지면 신뢰가 사라진다.
- **바꿀 파일**
  - `src-tauri/src/commands.rs` — `probe_agent_command(kind_command: String) -> Result<bool, String>` 신설.
    `$SHELL -lic "command -v <token>"` 실행. 토큰 추출은 프런트의 `firstCommandToken()`
    (`src/lib/stores/agentKinds.svelte.ts:38-42`)과 같은 규칙으로.
  - `src-tauri/src/lib.rs:105-110` — invoke_handler에 등록.
  - `src/lib/components/shell/AgentDialog.svelte:65-75`, `ProjectDialog.svelte:67-80`,
    `DefaultWorkspaceDialog.svelte:52-62` — 종류 Select 옆에 ✓/✗ 배지와 미설치 시 안내(설치 명령 복사 버튼).
  - `src-tauri/src/status/engine.rs:6-9` — 프로세스 종료 판정을 세분화. 예: 세션 생성 후
    `EARLY_EXIT_MS`(예 3000ms) 이내에, 유의미한 출력 없이 종료하면 `Done` 대신 신규 `Failed` 상태.
  - `src-tauri/src/status/inputs.rs` · `src/lib/types.ts` · `src/lib/components/shell/{StatusDot,StatusBadge,StatusChips}.svelte`
    · `src/lib/i18n/messages.ts`(en/ko 양쪽에 `status.failed`) — 상태 1종 추가에 따른 연쇄 반영.
- **효과**: 첫 실행에서 "왜 아무 일도 안 일어나지"를 겪는 사용자가 **즉시 원인을 안다.**

### 3위 — 브랜치/분기 기준을 검색형 콤보박스로 (A-08, A-06, A-19)

- **왜 3위인가**: Orca의 start-from ref 피커, Superset의 3택 생성 흐름과 정면으로 맞서는 항목.
  타이핑 10~20타와 오타 브랜치 생성을 동시에 제거한다.
- **바꿀 파일**
  - `src-tauri/src/git/mod.rs` — `list_branches(repo_path) -> Vec<BranchInfo>` 추가.
    `git for-each-ref --format='%(refname:short)|%(committerdate:relative)' refs/heads refs/remotes/origin`
    로 로컬+원격, 체크아웃 여부(`git worktree list --porcelain` 대조) 포함.
  - `src-tauri/src/commands.rs` + `src-tauri/src/lib.rs` — `list_project_branches` 명령 등록.
  - `src/lib/ipc/projects.ts` — 래퍼 추가.
  - `src/lib/components/shell/AgentDialog.svelte:80-87` — 브랜치는 "새 브랜치 이름(자유입력) /
    기존 브랜치 선택" 세그먼트, 분기 기준은 콤보박스. 이미 다른 worktree에 체크아웃된 브랜치는
    비활성 + 사유 표기.
  - `src/lib/components/shell/DefaultWorkspaceDialog.svelte` — 브랜치 선택 필드 추가.
  - `src/lib/i18n/messages.ts` — 신규 키를 en/ko 동시 추가(자리표시자 집합 일치 필수).
- **효과**: 워크스페이스 생성 시 **타이핑 10~20타 → 0~3타**, 브랜치 오타로 인한 정리 작업(삭제 다이얼로그
  왕복 3회) **완전 제거**.

### 4위 — 실패 메시지를 실행 가능한 안내로 (A-13, A-14, A-18)

- **왜 4위인가**: 난이도 대비 체감 효과가 크다. 지금은 실패의 **원인 정보가 코드상 존재조차 하지 않는다**.
- **바꿀 파일**
  - `src/lib/stores/actionErrors.svelte.ts:5-7` — `report(reason)`가 `{ id, code, detail }`을 보존하도록 변경.
    현재 시그니처는 `_reason`을 아예 쓰지 않는다.
  - `src/lib/components/context-menu/ActionErrorRegion.svelte:10` — 코드→메시지 매핑, "자세히" 토글로 원문 노출.
  - `src-tauri/src/commands.rs:656-667,701-706,716,727` — 한국어 리터럴을
    `PROJECT_NAME_REQUIRED`·`AGENT_KIND_REQUIRED`·`AGENT_COMMAND_REQUIRED`·`PROJECT_NOT_FOUND`·
    `DEFAULT_WORKSPACE_EXISTS` 같은 코드로 교체(`update_agent_title`의 `AGENT_TITLE_REQUIRED`
    (`commands.rs:891`)가 이미 이 패턴을 쓰고 있으므로 기존 컨벤션과 정합).
  - `src-tauri/src/git/mod.rs:19,22,25,27,32` — `NOT_A_GIT_REPO`, `DETACHED_HEAD` 등으로 교체.
  - `src-tauri/src/git/mod.rs:42-65` — `create_worktree` 실패를 `BRANCH_ALREADY_CHECKED_OUT`,
    `INVALID_START_POINT`, `WORKTREE_PATH_EXISTS` 로 분류.
  - `src/lib/components/shell/{ProjectDialog,AgentDialog}.svelte:50` — `error = String(e)` 대신
    코드→`t()` 변환 + 복구 버튼 렌더.
  - `src/lib/i18n/messages.ts` — 코드별 메시지를 en/ko 양쪽에 추가.
- **효과**: 첫 실행 실패가 "무엇이 잘못됐고 다음에 무엇을 누르면 되는지"로 바뀐다. AGENTS.md의 i18n 규칙
  위반(하드코딩 한국어)도 동시에 해소된다.

### 5위 — 빈 상태 온보딩 + 프로젝트 추가 진입점 정리 (A-01, A-02, A-03, A-17, A-20)

- **왜 5위인가**: 개별 항목은 작지만 첫 화면 인상을 결정한다. 특히 A-02(사이드바를 닫으면 프로젝트 추가
  불가)는 **완전한 막다른 길**이라 반드시 같이 고쳐야 한다.
- **바꿀 파일**
  - `src/App.svelte:130-143` — `ProjectDialog`를 여기로 승격(현재는 `Sidebar.svelte:191`에만 존재).
    `newAgentProject` 가드(`133-135`) 때문에 팔레트 액션이 무반응인 문제도 이 위치 변경과 함께 해소.
  - `src/lib/stores/shell.svelte.ts` — `projectDialogOpen` 상태와 `openProjectDialog()` 추가.
  - `src/lib/components/shell/Sidebar.svelte:32,78,184,191` — 로컬 `$state` 대신 `shell` 스토어 사용.
  - `src/lib/palette/model.ts:10-17` — `addProject` 액션 추가, 프로젝트 0개일 때 project 의존 액션 필터링.
  - `src/lib/components/shell/CommandPalette.svelte:41-60` — `addProject` 케이스 처리.
  - `src/lib/components/shell/OverviewGrid.svelte:159-168` — `projects.length === 0` 전용 분기.
    "① 저장소 추가 → ② 에이전트 CLI 확인 → ③ 첫 작업 실행" 3단계 카드.
  - `src/lib/components/shell/AgentDialog.svelte:16` — 프로젝트 선택 Select 추가(`App.svelte:38-40`의
    `projects[0]` 고정 해소). 다중 프로젝트 사용자의 **왕복 조작 3회 → 1회**.
  - `src/lib/components/shell/ProjectDialog.svelte:63-90` — 경로 필드를 첫 번째로 이동, `readonly` 제거.
  - `src/lib/i18n/messages.ts` — 온보딩 카드 문구를 en/ko 양쪽에 추가.
- **효과**: 첫 화면에서 다음 행동이 **한 번에 보이고**, 사이드바 상태와 무관하게 항상 프로젝트를 추가할 수 있다.

---

## 5. 후속(이 레인 범위 밖이지만 기록)

- **워크스페이스 셋업 스크립트(A-15)** 는 영향이 Top 5급이지만 제품 결정(스크립트 실행 정책, 보안,
  실패 시 롤백)이 선행돼야 해 즉시 개선에서 제외했다. Superset의 Setup/Teardown Scripts가 참조 모델이다.
  `docs/backlog.md`에도 아직 항목이 없으므로 별도 제안이 필요하다.
- **Git URL 기반 프로젝트 추가(A-04 후반부)** 도 clone 위치·인증 정책 결정이 필요하다.
- **단일 워크스페이스 생성 시 프롬프트 입력란** — 현재 시드 프롬프트 주입 인프라
  (`src/lib/terminal/pool.ts:15,206-239`)는 이미 있고 팬아웃/태스크만 사용한다. `AgentDialog`에
  프롬프트 필드 하나를 추가하면 Superset의 "prompt-first flow"에 근접한다. 난이도 S.
