# 핸드오프: 메인 화면 리디자인 (Codex 이어받기용)

이 문서는 Claude Code 세션에서 진행하던 "메인 화면 리디자인" 작업을 Codex(또는 다른 에이전트)가 이어받기 위한 인수인계 문서다. 아래 "Codex 프롬프트" 섹션을 그대로 Codex에 붙여넣으면 된다.

---

## 0. 현재 상태 요약 (2026-07-22 기준)

- **브랜치**: `feature/main-screen-redesign` (main에서 분기)
- **로컬 HEAD = 원격 HEAD = `3d87dae`** (GitHub `origin`에 push 완료, 이중 백업됨)
- **완료**: Phase A 전체(4개 태스크, 리뷰 통과, 커밋됨)
- **소실**: Phase B(B1~B3)는 구현·커밋했으나 **로컬 사고로 커밋이 유실됨**(원격에 push 전이었음). 아래 "사고 경위" 참조. **Phase B는 처음부터 다시 구현해야 함.**
- **재구현 자료**: `docs/superpowers/handoff/phase-b-briefs/`에 Phase B 각 태스크의 상세 브리프(`task-b*-brief.md`)와, 유실 전 구현자가 남긴 리포트(`task-b1~b3-report.md`)가 있음. 리포트에는 당시 구현 요지·주의점이 담겨 있어 재구현에 참고 가능.

### ⚠️ 사고 경위 (반드시 인지)
직전 세션에서 코드 리뷰 서브에이전트가 **셸 인젝션 취약점을 정적 분석이 아니라 실제 페이로드 실행으로 "검증"**하다가 `rm -rf`가 홈 디렉토리 하위를 삭제했다. 이로 인해 이 프로젝트의 미push 커밋(Phase B)과 **다른 여러 프로젝트**가 소실됐다.
- **교훈 1**: 보안 취약점(특히 셸 인젝션/명령 실행)은 **절대 실제 페이로드를 실행해 검증하지 말 것.** 코드를 읽는 것만으로 판정한다.
- **교훈 2**: 각 Phase(또는 태스크) 완료 시 **즉시 `git push`로 원격 백업**할 것. Phase A는 push해서 살았고 Phase B는 push 안 해서 죽었다.

---

## 1. 프로젝트 컨텍스트

- **제품**: 여러 CLI 코딩 에이전트(Claude Code·Codex·Cursor·Gemini)를 병렬 실행·관리하는 macOS 우선 데스크톱 앱.
- **스택**: Tauri v2(Rust) + Svelte 5(룬) + Vite SPA + Tailwind CSS v4 + shadcn-svelte(bits-ui/paneforge) + xterm.js + portable-pty.
- **작업 규칙** (`CLAUDE.md` 필독):
  - 모든 문서·주석·커밋 메시지·UI 텍스트는 **한글**(코드/고유명사 제외). 사용자 인터랙션 경어체.
  - 커밋: 기능 단위, 한 커밋에 한 기능, 한글 메시지, **Co-Author 절대 금지**.
  - 문서-only 커밋에만 `[ci skip]`. 코드 수정 커밋에는 붙이지 않음(체크 미보고로 머지 막힘).
  - 환경변수 필요한 커맨드는 앞에 `mise exec -- ` 프리픽스 (예: `mise exec -- pnpm check`).
  - main 작업 시 `git pull` 선행, non-main은 base branch rebase.

---

## 2. 설계·계획 문서 (필독 순서)

1. `docs/superpowers/specs/2026-07-22-main-screen-redesign-design.md` — **설계 스펙**. 무엇을 만드는지, 확정된 결정 사항 전부.
2. `docs/superpowers/plans/2026-07-22-main-screen-redesign-master.md` — **마스터 계획**. Phase A~E 구성, 의존성, **Phase 간 인터페이스 계약**(IPC 시그니처/토큰/store 타입 고정).
3. `docs/superpowers/plans/2026-07-22-redesign-phase-a-tokens.md` — Phase A 상세(완료됨, 참고용).
4. `docs/superpowers/plans/2026-07-22-redesign-phase-b-backend.md` — **Phase B 상세(다음 작업)**.
5. `docs/design-overview.md` — 기존 UI 구조·디자인 토큰 진입점 개요.
6. 원본 디자인 프로토타입: Claude Design 프로젝트 `decfe9b5-f912-4dd4-8d97-8ab5b18074fa` (파일 `AI Agent Workspace 프로토타입.dc.html` + 핸드오프 README). Codex가 접근 불가하면 위 스펙 문서가 프로토타입 내용을 충실히 요약하고 있으니 그걸로 충분.

### 확정된 핵심 결정 (스펙에서 발췌)
- **공유 worktree**: 여러 에이전트가 같은 물리적 worktree 경로를 실제 공유. `worktreePath`가 같으면 공유. 삭제 시 **참조 카운트**로 마지막 참조자만 디렉토리 제거.
- **CLI 사용량 (하단 상태 바)**:
  - **Codex**: `~/.codex/sessions/**/rollout-*.jsonl`의 `rate_limits` 파싱(마지막 non-null 폴백).
  - **Claude Code**: statusLine 훅 설치 방식(`~/.claude/settings.json`에 스풀 스크립트 설치, 기존 command 보존·위임). ⚠️ 이 부분이 셸 인젝션 사고의 원인 코드였음 — **재구현 시 위임 경로를 셸에 삽입할 때 반드시 `shell-quote`(예: 작은따옴표 감싸기 + 내부 `'` 이스케이프)로 처리**할 것. `format!("{:?}", …)`는 Rust 디버그 이스케이프이지 셸 이스케이프가 아니므로 금지.
  - **Cursor/Gemini**: 로컬 사용량 소스 없음 → "연동 안 됨" 배지.
  - **CPU/RAM**: Rust `sysinfo` crate로 실제 폴링.
- **파일 에디터**: 실제 worktree 파일 트리 + 파일 읽기(읽기 전용) + git diff 기반 라인 하이라이트. 기존 `DiffView.svelte` 대체.

---

## 3. 완료된 것 (Phase A — 손대지 말 것)

`app.css` 시맨틱 토큰, JetBrains Mono 번들, StatusDot/StatusBadge 컴포넌트. 커밋 `44f47ce`, `47accca`, `97afa99`, `3d87dae`. 모두 리뷰 통과.
- 생성된 Tailwind 유틸: `bg-status-{running,idle,blocked,done}`, `text-status-*-fg`, `text-status-blocked-on`, `text-diff-{add,remove}`, `text-accent-share`, `bg-terminal`, `bg-editor`, `bg-editor-chrome`.
- 컴포넌트: `src/lib/components/shell/StatusDot.svelte`(+`statusDot.ts`), `StatusBadge.svelte`(+`statusBadge.ts`). 순수 함수는 `*.test.ts`로 테스트됨.
- **주의**: 컴포넌트에 hex 직접 사용 금지, 토큰만.

---

## 4. 다음 작업 (Phase B — 백엔드, 재구현)

`docs/superpowers/plans/2026-07-22-redesign-phase-b-backend.md`의 5개 태스크. 각 태스크 완료 시 **커밋 후 즉시 `git push`**.

| 태스크 | 내용 | 재구현 참고 |
|--------|------|------------|
| B1 | `sysinfo` 추가 + `read_system_resources`(CPU/RAM) | brief+report 있음. sysinfo 0.32.1 API가 브리프와 일치했었음. |
| B2 | Codex 사용량 파서 + `read_codex_usage` (usage/mod.rs 공통 UsageInfo/UsageMetric 타입 포함) | brief+report 있음. "마지막 non-null 폴백" 핵심. |
| B3 | Claude statusLine 훅 설치(`install_claude_statusline`) + 스풀 읽기(`read_claude_usage`) | brief+report 있음. ⚠️ **셸 인젝션 주의**(위 참조). 이전 구현이 `format!("{:?}")`로 위임 경로를 넣어 취약했음. 반드시 셸 이스케이프. |
| B4 | 파일 트리/읽기/파일별 diff 3종 명령(+경로 이스케이프 방지) | brief 있음(report 없음, 미구현이었음). |
| B5 | 공유 worktree: create_agent 재사용 분기 + delete_agent 참조 카운트 | brief 있음(report 없음, 미구현이었음). |

- 브리프 위치: `docs/superpowers/handoff/phase-b-briefs/task-b{1..5}-brief.md`.
- IPC 계약(TS 시그니처)은 마스터 계획의 "B가 제공" 섹션에 고정돼 있음 — 그대로 따를 것.
- 검증: `cd src-tauri && cargo test`(또는 `mise exec -- cargo test`), 프론트 `mise exec -- pnpm check`.
- 각 신규 명령은 `commands.rs`에 추가하고 `lib.rs`의 `invoke_handler`에 등록.

### Phase B 이후 (C~E)
마스터 계획 참조. C~E 상세 계획은 아직 미작성 — B 완료 후 확정된 백엔드 인터페이스에 맞춰 작성. C(shell store/TitleBar/StatusChips/Sidebar), D(OverviewGrid/AgentDetail/FilePanel/FileViewer), E(StatusBar/UsagePopover/Settings/AgentDialog).
**실제 프로토타입 화면은 Phase C(화면 배선)부터 눈에 보이기 시작함.**

---

## 5. 검증 커맨드
- 프론트 타입: `mise exec -- pnpm check`
- 프론트 테스트: `mise exec -- pnpm test`
- 백엔드 테스트: `cd src-tauri && cargo test`
- 앱 실행: `mise exec -- pnpm tauri dev` (네이티브 창)

---

## Codex 프롬프트 (아래를 복사해서 사용)

```
이 저장소의 "메인 화면 리디자인" 작업을 이어받아 진행해줘.

먼저 docs/superpowers/handoff/HANDOFF.md 를 정독해. 현재 상태·사고 경위·규칙·다음 작업이 모두 거기 있다.

핵심:
- 브랜치 feature/main-screen-redesign, HEAD=3d87dae(원격과 동일). Phase A 완료.
- 다음 작업은 Phase B(백엔드 5개 태스크). 계획: docs/superpowers/plans/2026-07-22-redesign-phase-b-backend.md, 브리프: docs/superpowers/handoff/phase-b-briefs/.
- Phase B는 이전에 구현했다가 로컬 사고로 유실됐다. 브리프/리포트를 참고해 재구현한다.
- ⚠️ B3(Claude 훅)에서 셸 인젝션 주의: 위임 경로를 셸 스크립트에 넣을 때 반드시 셸 이스케이프(작은따옴표 감싸기 등). format!("{:?}")는 금지. 그리고 어떤 경우에도 보안 취약점을 실제 페이로드 실행으로 검증하지 말 것 — 코드 리딩으로만 판정.

규칙(CLAUDE.md):
- 문서·주석·커밋 메시지·UI 텍스트는 한글(코드/고유명사 제외), 경어체.
- 커밋: 기능 단위, 한글 메시지, Co-Author 금지, 코드 커밋에 [ci skip] 금지.
- 환경변수 필요한 커맨드는 앞에 "mise exec -- ".
- TDD로 진행하고, 각 태스크 완료 시 커밋 후 즉시 git push로 원격 백업할 것.

검증: cd src-tauri && cargo test / mise exec -- pnpm check / mise exec -- pnpm test.

Phase B의 B1부터 순서대로, 각 태스크의 브리프를 요구사항으로 삼아 구현하고, 완료마다 검증→커밋→push 해줘.
```
