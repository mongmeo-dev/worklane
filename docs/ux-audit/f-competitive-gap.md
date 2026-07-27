# Lane F — 경쟁 제품(Orca/Superset) 기능·UX 갭 분석

- 작성자: worker-3 (Lane F)
- 작성일: 2026-07-27
- 대상 앱: 본 저장소(Worklane). 코드 커밋 기준 실측.
- 비교 대상: **Orca**(onorca.dev, `stablyai/orca`, MIT, GitHub ★29.7k) / **Superset**(superset.sh, `superset-sh/superset`, ELv2)
- 원칙: README를 믿지 않고 저장소 코드를 직접 읽어 `있음/부분/없음`을 판정한다. 모든 판정에 `파일:줄` 또는 함수/컴포넌트명을 붙인다. 경쟁 제품 주장에는 §부록의 출처 URL을 단다.

---

## 0. 30초 요약

- 본 앱은 **"다중 프로젝트 × 다중 에이전트" 오케스트레이션 레이어**로서 fan-out·자동검증·태스크보드·체크포인트·인앱 PR 리뷰·주의 인박스·i18n 등 **워크플로 자동화 폭이 넓다**. 이 부분은 Superset보다 앞서고 Orca와 대등하거나 일부 앞선다.
- 그러나 **개발자가 "손으로 만지는" 표면**(에디터, 터미널 레이아웃, 브라우저 상호작용, 입력 방식)에서 두 경쟁 제품에 크게 뒤진다. 사용자가 "Orca/Superset보다 불편하다"고 느끼는 실체는 대부분 여기서 나온다.
- 가장 뼈아픈 4대 갭: ① **내장 코드 에디터 없음(읽기 전용 뷰어뿐)** ② **터미널 분할 없음(탭만)·재시작 시 스크롤백 소실** ③ **이미지/파일 드래그·붙여넣기 입력 없음** ④ **외부에서 앱을 제어할 API(MCP/CLI/SDK) 없음**. 이 넷은 두 경쟁 제품 모두(또는 한쪽이) 핵심 셀링포인트로 내세운다.

---

## 1. 기능 매트릭스

범례: ✅ 있음 · 🟡 부분적/제약 있음 · ❌ 없음. "본 앱" 칸의 괄호는 근거 파일.

### 1-1. 에이전트 실행·격리 (기반)

| 기능 | Orca | Superset | 본 앱 (근거) |
|---|---|---|---|
| CLI 에이전트 병렬 실행 | ✅ | ✅ | ✅ 세션당 PTY 스폰 (`src-tauri/src/commands.rs:31` `create_session`, `src-tauri/src/pty/manager.rs`) |
| Git worktree 격리 | ✅ | ✅ | ✅ (`src-tauri/src/commands.rs:795` `create_agent`, `src-tauri/src/git/mod.rs`) |
| 임의 CLI 에이전트 지원 | ✅ (any terminal) | ✅ (any terminal) | 🟡 프리셋 5종 + 사용자 커스텀 kind (`src/lib/stores/agentKinds.svelte.ts:19` BUILTIN_KINDS: claude-code/codex/cursor/gemini/gajae-code, `addKind`) |
| 공유 worktree(여러 에이전트가 한 worktree) | ❌(문서상 미언급) | ❌(문서상 미언급) | ✅ **본 앱 고유** (`src/lib/shell/derived.ts` `agentsForWorktree`, `worktreePath` 동일성 판별) |
| 프로젝트 단위 그룹핑(다중 프로젝트) | 🟡 Projects 사이드바 | 🟡 workspace/project | ✅ 1급 개념 (`src/lib/stores/projects.svelte.ts`, `src/lib/components/shell/Sidebar.svelte`) |
| 세션 복원(재시작 후 스크롤백/세션 유지) | ✅ scrollback survives restart / session restore | ✅ persistent terminals | ❌ PTY는 인메모리(`PtyState` HashMap), xterm serialize addon 없음(`src/lib/terminal/pool.ts:2-4`은 fit/unicode11/webgl만). 재시작 시 세션·스크롤백 소실 |
| 에이전트 hibernation/세션 히스토리 | ✅ | 🟡 | ❌ |
| 계정 hot-swap(무재로그인 전환) | ✅ Codex/Claude | ❌ | ❌ |

### 1-2. 상태·알림 (본 앱 선언 차별화)

| 기능 | Orca | Superset | 본 앱 (근거) |
|---|---|---|---|
| 실시간 에이전트 상태 | ✅ real-time status | ✅ monitor dashboard | ✅ 3계층 하이브리드 (`src-tauri/src/status/engine.rs`, `poller.rs`, `hooks/gjc.rs`) |
| tmux/멀티플렉서 경유 상태 정확도 | 🟡(PTY 기반) | 🟡(PTY 기반) | ✅ 출력 스트림 분석으로 경계 관통 (본 앱 선언 차별화, `src-tauri/src/status/`) |
| 완료/주의 알림 + 인박스 | ✅ Notifications & Inbox | 🟡 | ✅ 전역 주의 인박스 + OS 알림 (`src/lib/attention/notifier.ts`, `src/lib/components/shell/AttentionInbox.svelte`) |
| 알림 → 해당 에이전트 딥링크 | ✅ | 🟡 | 🟡 (`src/App.svelte:67` notifier 콜백으로 agent 조회) — Lane E 판정 참조 |
| 사용량/레이트리밋 추적 | ✅ usage & reset | ❌(자체 없음) | 🟡 Claude/Codex만 (`commands.rs:599` `read_codex_usage`, `:606` `read_claude_usage`) |
| 사용량 예산 경고 | ❌ | ❌ | ✅ **본 앱 우위** (`src/lib/stores/budget.svelte.ts`, `src/lib/usage/budget.ts`) |

### 1-3. 검토·머지 (코드 shipping)

| 기능 | Orca | Superset | 본 앱 (근거) |
|---|---|---|---|
| Diff 뷰어 | ✅ | ✅ dashboard | ✅ 읽기 전용 (`src/lib/components/shell/FileViewer.svelte`, `commands.rs:575` `git_file_diff`) |
| Diff 라인 코멘트 → 에이전트로 재전달 | ✅ Annotate AI Diff | ❌ | ❌ |
| 커밋/푸시 | ✅ | 🟡 | ✅ (`commands.rs:99` `git_commit_all`, `:112` `git_push`) |
| PR 생성 | ✅ | 🟡 | ✅ (`commands.rs:124` `git_open_pull_request`) |
| 인앱 PR 리뷰 + CI 체크 + 병합 | ✅ hosted reviews/Actions | 🟡 | ✅ (`commands.rs:197` `git_pr_status`, `:209` `git_pr_merge` squash/rebase/merge) |
| PR 없이 로컬 병합 + 충돌 사전감지 | 🟡 | ❌ | ✅ **본 앱 우위** (`commands.rs:222` `git_merge_preview`, `:234` `git_merge_into_base`) |
| 이슈/보드 인앱 연동 | ✅ GitHub + Linear + **Jira** | 🟡 task 트래킹 | 🟡 GitHub 이슈(`commands.rs:173`) + Linear(`commands.rs:189`), **Jira 없음** |

### 1-4. 편집·브라우저·입력 (개발자가 손으로 만지는 표면)

| 기능 | Orca | Superset | 본 앱 (근거) |
|---|---|---|---|
| 내장 코드 에디터 | ✅ Monaco + autosave | ❌(외부 IDE 딥링크로 대체) | ❌ 읽기 전용 뷰어뿐 (`FileViewer.svelte`는 `readWorktreeFile`만, 쓰기 경로 없음) |
| 외부 에디터 딥링크 | 🟡 | ✅ Cursor 등 | ✅ VS Code/Cursor/Zed/Windsurf/Sublime/IntelliJ (`src-tauri/src/external/mod.rs:77-87` `editor_binary`) |
| 파일/이미지 드래그 → 프롬프트 주입 | ✅ Drag Files to Agents | ❌ | ❌ 터미널에 drop 핸들러 없음(copy/paste만, `src/lib/components/shell/Terminal.svelte:72-74`) |
| 리치 프리뷰(md/PDF/이미지/mermaid) | ✅ | 🟡 | ❌ 텍스트/diff 뷰만 |
| 내장 브라우저 프리뷰 | ✅ per-worktree | 🟡 ports 관리 | 🟡 dev 서버 iframe(view-only) + 외부 브라우저 (`src/lib/components/shell/Preview.svelte:208` iframe, `commands.rs:261` `detect_preview_ports`) |
| Design Mode(UI 클릭 → HTML/CSS/스샷을 프롬프트로) | ✅ | ❌ | ❌ |
| 터미널 렌더러 | ✅ WebGL(Ghostty급) | ✅ | ✅ WebGL (`src/lib/terminal/pool.ts:4` WebglAddon) |
| 터미널 분할(split/pane) | ✅ 무한 split | 🟡 | ❌ 워크스페이스당 **탭만** (`AgentDetail.svelte:132-192` 탭 UI) |
| 한글 IME 지원 | 🟡 | 🟡 | ✅ **본 앱 우위** (`src/lib/terminal/HangulImeAddon.ts`) |
| 음성 입력 | ❌ | ❌ | ❌ (세 제품 모두 없음 → 투자 우선순위 낮음) |

### 1-5. 자동화·확장성·원격 (오케스트레이션 상위 레이어)

| 기능 | Orca | Superset | 본 앱 (근거) |
|---|---|---|---|
| Fan-out(한 프롬프트 → N 에이전트) | ✅ Parallel Worktrees | ✅ | ✅ (`src/lib/components/shell/FanoutDialog.svelte`, `src/lib/fanout/model.ts`) |
| Fan-out 결과 자동 검증 + 채택 추천 | 🟡(compare merge winner) | ❌ | ✅ **본 앱 우위** (`commands.rs:246` `run_verification`, `src/lib/fanout/ranking.ts`) |
| 결과 나란히 비교 | ✅ | 🟡 | ✅ (`src/lib/components/shell/CompareDialog.svelte`) |
| 태스크 보드 | 🟡(GitHub/Linear/Jira 보드) | ✅ task | ✅ 프로젝트 횡단 (`commands.rs:423` `list_tasks`, `src/lib/components/shell/TaskBoard.svelte`) |
| 프롬프트 라이브러리/플레이북 | 🟡 skills | 🟡 skills | ✅ (`commands.rs:284` `list_prompts`, `:514` `list_playbooks`) |
| worktree 체크포인트 + 롤백 | ✅ worktree checkpoints | ❌ | ✅ 자동 체크포인트 포함 (`commands.rs:331` `create_checkpoint`, `:373` `rollback_checkpoint`, `src/lib/stores/autoCheckpoint.svelte.ts`) |
| 활동 타임라인/감사 로그 | ✅ Agents feed/activity | 🟡 | ✅ (`commands.rs:491` `record_event`, `:504` `list_events`, `Timeline.svelte`) |
| 스케줄/크론 자동화 | ✅ Scheduled automations | ✅ Automations(cron) | ❌ |
| 외부 제어 API — MCP 서버 | ✅ skills registry & MCP | ✅ MCP(27 tools)+A2A card | ❌ |
| 외부 제어 API — CLI | ✅ `orca` CLI(worktree/snapshot/click/fill) | ✅ `superset` CLI(brew) | ❌ |
| 외부 제어 API — SDK/OpenAPI | 🟡 | ✅ TS SDK + OpenAPI 3.1 + OAuth2.1 | ❌ |
| Computer use(에이전트가 데스크톱 조작) | ✅ | ❌ | ❌ |
| SSH/원격 worktree | ✅ SSH + Remote servers + ephemeral VM | ❌(로컬) | ❌ |
| 모바일 컴패니언 | ✅ iOS/Android | ❌ | ❌ |
| 클라우드 동기화/계정 | 🟡(원격 서버/모바일 연동) | ✅ 클라우드 API(api.superset.sh) | ❌ 로컬 SQLite 단일 (`src-tauri/src/store/`, workspace.db) |
| Slack/Discord 웹훅 알림 | ❌ | ❌ | ✅ **본 앱 우위** (`commands.rs:181` `send_webhook`) |
| 다국어(i18n) | ✅ 7개국어(README) | ❌ | 🟡 ko/en (`src/lib/i18n/messages.ts`) |
| 자동 업데이트(서명 릴리스) | ✅ | ✅ | ✅ (`src-tauri/src/lib.rs:37` updater 플러그인, `src/lib/stores/updater.svelte.ts`) |

---

## 2. 카테고리별 심층 갭 (브리핑 지정 항목)

### (d-1) IDE/에디터 통합 — **최대 갭**
- Orca: **Monaco(=VS Code) 내장 에디터 + autosave + 파일 탐색기**를 앱 안에 둔다. 에이전트가 만든 diff를 그 자리에서 고치고 커밋한다. Superset: 자체 에디터 대신 **Cursor 등 외부 IDE 딥링크**로 명시적 위임.
- 본 앱: `FileViewer.svelte`는 `readWorktreeFile`+diff 표시뿐이며 편집 경로가 없다. 외부 에디터 딥링크는 있으나(`external/mod.rs:77-87`) "앱을 떠나야" 손댈 수 있다 → Orca 대비 큰 마찰, Superset 대비는 위임 UX가 덜 매끄러움(딥링크가 상세 헤더의 OpenExternal 버튼 하나로만 노출).
- 판정: **없음(에디터)**, 외부 딥링크는 부분.

### (d-2) 에이전트 간 전환·이어받기(handoff)
- Orca: **agent session history + hibernation**으로 세션을 재개·인계. README 샘플 브랜치명에도 "Improve agent handoff summary"가 등장할 만큼 handoff를 UX 주제로 다룸.
- 본 앱: 워크스페이스당 여러 터미널 탭으로 "에이전트 전환"은 되지만(`AgentDetail.svelte:41`), **재시작/일시중단 후 이어받기(세션 복원)** 는 없다(§1-1 세션 복원 ❌). 한 에이전트의 컨텍스트를 다른 에이전트로 넘기는 명시적 장치 없음.
- 판정: 전환=부분, 이어받기=없음.

### (d-3) 이미지/드래그앤드롭 입력
- Orca: 파일·이미지를 프롬프트에 **드래그 주입** + Design Mode로 스크린샷 크롭 주입.
- 본 앱: 터미널 컨텍스트 메뉴에 copy/paste만 존재(`Terminal.svelte:72-74`), `ondrop`/이미지/클립보드 이미지 핸들러 전무(grep 결과 drop 핸들러 없음). 멀티모달 에이전트(예: 스샷 붙여 UI 버그 지시)를 못 쓴다.
- 판정: **없음**.

### (d-4) 음성
- 세 제품 모두 없음. 투자 우선순위 최하. (과잉 투자 방지 대상)

### (d-5) 모바일/원격
- Orca: iOS/Android 컴패니언 + SSH worktree + 원격 서버 + ephemeral VM. Superset: 로컬 중심이나 **클라우드 API/MCP로 원격 제어** 가능.
- 본 앱: 데스크톱 로컬 전용. 원격 실행/모바일 모니터링 전무. (단, 프로젝트 로드맵상 모바일은 "아직 생각 안 함"이라 의도적 범위 밖 — 과잉 투자 경계)
- 판정: **없음**(의도적).

### (d-6) 클라우드 동기화
- Superset: 클라우드 계정 + OAuth2.1 + 원격 API. Orca: 원격 서버/모바일 동기화.
- 본 앱: `workspace.db` 로컬 SQLite 단일 저장(`src-tauri/src/store/`). 기기 간 동기화·백업 없음.
- 판정: **없음**.

### (d-7) 플러그인/확장성 — **전략적 갭**
- Superset: **MCP 서버(27 tools) + TS SDK + CLI + OpenAPI + A2A/Skills**로 "다른 에이전트가 Superset을 조종"하게 설계. Orca: `orca` CLI + skills registry + MCP.
- 본 앱: 확장 표면이 **사용자 커스텀 CLI kind 등록**(`agentKinds.svelte.ts` addKind/localStorage)에 국한. 외부 자동화·타 에이전트 연동 진입점 전무. (참고: `src-tauri/src/hooks/gjc.rs`의 `.gjc/state/sdk` 디스커버리는 상태 훅 수신용 내부 채널이지 공개 제어 API가 아님.)
- 판정: **없음(공개 API)**, 커스텀 kind는 부분.

---

## 3. 사용자 체감 순 갭 순위 (Top 10, 높을수록 아픔)

1. **내장 코드 에디터 부재** — 매 리뷰마다 앱을 떠나 외부 IDE로. "IDE를 표방하는데 편집을 못 한다"는 인상. (Orca 대비 절대 열세)
2. **터미널 분할 없음 + 재시작 시 세션/스크롤백 소실** — 다중 에이전트를 한 화면에 못 펼치고, 앱을 껐다 켜면 대화 로그가 날아감. (Orca/Superset 모두 강조하는 기본기)
3. **이미지/파일 드래그·붙여넣기 입력 없음** — 스샷 기반 UI 지시·파일 첨부 불가. 멀티모달 워크플로 차단.
4. **외부 제어 API(MCP/CLI/SDK) 없음** — "다른 에이전트/스크립트로 자동화" 불가. Superset의 핵심 셀링포인트를 통째로 결여.
5. **스케줄/크론 자동화 없음** — 반복 작업 예약 불가(양사 모두 보유).
6. **원격/SSH worktree 없음** — 무거운 빌드를 원격 박스에 못 위임.
7. **Diff 라인 코멘트 → 에이전트 재전달 없음** — Orca "Annotate AI Diff"의 검토 루프를 못 함.
8. **리치 프리뷰(md/PDF/mermaid/이미지) 없음** — 문서·설계 검토가 텍스트뷰로 제한.
9. **Design Mode(브라우저 클릭 → 프롬프트) 없음** — 프리뷰가 view-only.
10. **모바일 컴패니언/클라우드 동기화 없음** — 자리 비운 사이 모니터링·follow-up 불가(단 로드맵상 의도적 후순위).

> 음성 입력은 세 제품 모두 없어 순위에서 제외(투자 금지 권고).

---

## 4. 본 앱이 이미 앞서 있는 지점 (과잉 투자 방지)

아래는 경쟁 제품이 없거나 약한 영역이다. **여기에 추가 투자하기보다 §3 상위 갭을 메우는 데 리소스를 몰아야 한다.**

| 강점 | 근거 | 비고 |
|---|---|---|
| 공유 worktree(N 에이전트/1 worktree) | `src/lib/shell/derived.ts` agentsForWorktree | 양사 모두 미언급 — 고유 |
| 3계층 하이브리드 상태(tmux 관통) | `src-tauri/src/status/**`, `hooks/gjc.rs` | 양사는 PTY exit code 의존 |
| Fan-out **자동 검증 + 채택 랭킹 추천** | `commands.rs:246`, `src/lib/fanout/ranking.ts` | Orca는 수동 compare, Superset 없음 |
| 사용량 **예산 경고** + 웹훅(Slack/Discord) | `budget.svelte.ts`, `commands.rs:181` | 양사 모두 없음 |
| PR 없이 **로컬 병합 + 충돌 사전감지** | `commands.rs:222`,`:234` | Superset 없음 |
| worktree 체크포인트 + **자동 체크포인트** | `commands.rs:331`,`:373`, `autoCheckpoint.svelte.ts` | Superset 없음, Orca 대등 |
| 한글 IME 애드온 | `src/lib/terminal/HangulImeAddon.ts` | 한국어 사용자 체감 우위 |
| 프로젝트 1급 그룹핑(다중 프로젝트 축) | `Sidebar.svelte`, `projects.svelte.ts` | 제품 아이덴티티 — 지켜야 할 차별화 |

**과잉 투자 경계**: 음성 입력, 모바일 앱(로드맵상 후순위), 클라우드 SaaS 백엔드는 현 단계에서 착수 금지. 다중 프로젝트 오케스트레이션 강점은 이미 충분하므로 신규 기능보다 위 §3 기본기 보강이 ROI가 높다.

---

## 5. 각 갭의 MVP + 건드릴 파일 (한 줄)

> Lane F는 조사 전용이라 코드 미수정. 아래는 후속 착수 시 진입점 제안이다.

1. **내장 편집(MVP: 읽기전용 뷰어에 저장 가능한 textarea/CodeMirror 1개 파일 편집 + 저장 IPC)** — FE `src/lib/components/shell/FileViewer.svelte`(편집 모드), BE 신규 `write_worktree_file` 커맨드(`src-tauri/src/commands.rs` + `src-tauri/src/files/mod.rs`) + `src-tauri/src/lib.rs` invoke_handler 등록.
2. **터미널 분할(MVP: 워크스페이스당 좌우 2-pane)** — `src/lib/components/shell/AgentDetail.svelte`(탭 영역을 `Resizable.PaneGroup`로 감싸 2개 Terminal 동시 마운트), 상태는 `src/lib/stores/shell.svelte.ts`.
3. **세션 스크롤백 복원(MVP: `@xterm/addon-serialize`로 종료 시 직렬화→localStorage/DB 저장, 재시작 시 복원)** — `src/lib/terminal/pool.ts`(addon 추가·serialize/restore), 지속 저장은 `src-tauri/src/store/repo.rs`.
4. **이미지/파일 드래그 입력(MVP: 터미널/입력영역 `ondrop`→파일을 임시경로 저장 후 경로 텍스트 주입, 이미지 클립보드 붙여넣기)** — `src/lib/components/shell/Terminal.svelte`(drop/paste 핸들러), 저장 IPC는 `src-tauri/src/files/mod.rs`.
5. **외부 제어 API(MVP: 로컬 소켓/HTTP로 `create_agent`,`create_session`,`list_tasks` 3개만 노출하는 최소 명령 서버)** — 신규 `src-tauri/src/api/mod.rs` + `src-tauri/src/lib.rs`(플러그인 등록). 이후 MCP 어댑터로 확장.
6. **스케줄 자동화(MVP: 태스크에 cron 문자열 필드 + 백엔드 타이머가 도달 시 팬아웃 시드)** — `src-tauri/src/store/models.rs`(Task 스키마), `src-tauri/src/commands.rs`(create_task 확장), FE `src/lib/components/shell/TaskBoard.svelte`.
7. **Diff 라인 코멘트→프롬프트(MVP: FileViewer diff 라인 클릭→코멘트 수집→활성 터미널에 주입)** — `src/lib/components/shell/FileViewer.svelte` + `src/lib/terminal/promptInjection.ts`.
8. **리치 프리뷰(MVP: 파일 확장자가 md/이미지면 렌더 분기)** — `src/lib/components/shell/FileViewer.svelte`(md 렌더러/`<img>` 분기), `src/lib/files/viewModel.ts`.
9. **원격/SSH(MVP: worktree 생성 시 원격 호스트 지정 → 커맨드를 `ssh host --`로 래핑)** — `src-tauri/src/pty/manager.rs`(spawn 래핑), `src-tauri/src/git/mod.rs`(원격 worktree), `src/lib/components/shell/AgentDialog.svelte`(호스트 입력). *난이도 L, 후순위.*
10. **Jira 시드(MVP: `linear/mod.rs` 패턴 복제로 Jira 이슈 조회 커맨드 1개)** — 신규 `src-tauri/src/jira/mod.rs`, `commands.rs`, `src/lib/components/settings/IntegrationsSettings.svelte`.

---

## 6. 대략적 우선순위 결론

- **지금 당장(체감·난이도 균형)**: #1 내장 편집, #3 세션 복원, #4 이미지 드래그 입력. 개발자가 매 순간 부딪히는 기본기이며 파일 진입점이 명확하다.
- **다음(제품 포지션)**: #5 외부 제어 API(→MCP), #6 스케줄 자동화. Superset이 "에이전트가 조종하는 오케스트레이션 레이어"로 잡은 자리를 방어.
- **후순위/보류**: #9 원격/SSH, 모바일, 클라우드, 음성. 리소스 대비 ROI 낮거나 로드맵상 의도적 후순위.

---

## 부록 A. 출처 URL (검증용)

- Orca 랜딩: https://www.onorca.dev/
- Orca 문서 인덱스(사이드바 전 기능): https://www.onorca.dev/docs
- Orca GitHub(README 기능표): https://github.com/stablyai/orca
- Orca 기능 문서:
  - Monaco 에디터/autosave: https://www.onorca.dev/docs/editing/monaco
  - 파일 탐색기·외부 드래그드롭: https://www.onorca.dev/docs/editing/file-explorer
  - Design Mode: https://www.onorca.dev/docs/browser/design-mode
  - Annotate AI Diff: https://www.onorca.dev/docs/review/annotate-ai-diff
  - SSH worktree: https://www.onorca.dev/docs/ssh · 원격 서버: https://www.onorca.dev/docs/remote-servers
  - CLI: https://www.onorca.dev/docs/cli/overview · 스케줄 자동화: https://www.onorca.dev/docs/cli/automations · skills/MCP: https://www.onorca.dev/docs/cli/skills
  - 세션 복원: https://www.onorca.dev/docs/model/session-restore · hibernation: https://www.onorca.dev/docs/agents/hibernation
  - 모바일 컴패니언: https://www.onorca.dev/docs/mobile
  - Jira 드로어: https://www.onorca.dev/docs/review/jira
- Superset 랜딩(기능/FAQ): https://superset.sh/
- Superset 문서: https://docs.superset.sh
- Superset MCP 서버(27 tools): https://api.superset.sh/api/v2/agent/mcp · MCP 문서: https://docs.superset.sh/mcp-server
- Superset OpenAPI: https://api.superset.sh/openapi.json
- Superset CLI: https://docs.superset.sh/cli/getting-started · TS SDK: https://docs.superset.sh/sdk/getting-started
- Superset GitHub: https://github.com/superset-sh/superset

## 부록 B. 본 앱 근거 파일 인덱스 (재확인용)

- Tauri 커맨드 등록 목록: `src-tauri/src/lib.rs:58-117`
- 전체 커맨드 정의: `src-tauri/src/commands.rs`
- 셸/화면 구조: `src/App.svelte`, `src/lib/components/shell/AgentDetail.svelte`
- 에디터(뷰어): `src/lib/components/shell/FileViewer.svelte`
- 외부 에디터 매핑: `src-tauri/src/external/mod.rs:77-87`
- 터미널 풀/애드온: `src/lib/terminal/pool.ts`
- 에이전트 kind 확장점: `src/lib/stores/agentKinds.svelte.ts:19`
- 상태 엔진: `src-tauri/src/status/**`, `src-tauri/src/hooks/gjc.rs`
- 프리뷰 iframe: `src/lib/components/shell/Preview.svelte:208`
