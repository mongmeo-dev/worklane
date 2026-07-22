# 메인 화면 리디자인 — 설계 문서

> 출처: Claude Design 프로토타입 `AI Agent Workspace 프로토타입.dc.html` + 핸드오프 README.
> 목표: UI를 프로토타입에 맞게 재구현하고, 프로토타입에 있는 모든 기능을 실제로 동작하게 구현한다.
> 참고 컨텍스트: `docs/design-overview.md`, `CLAUDE.md`.

---

## 1. 개요

기존 3영역 구조(타이틀바 / 좌 사이드바 / 메인 패널)를 유지하면서 다음을 추가·개편한다.

1. **전역 상태 요약 칩** — 타이틀바 중앙, 상태별 개수 + 필터 진입
2. **전체 오버뷰(그리드 뷰)** — 모든 에이전트를 타일로 동시 모니터링 (신규 화면)
3. **좌/우 패널 토글** — 타이틀바에서 사이드바·파일 패널 접기
4. **상태 시맨틱 토큰화** — StatusDot/DiffView 하드코딩 색을 `app.css` 토큰으로 승격
5. **blocked(입력 대기) 3중 강조** — 솔리드 뱃지 + 앰버 링 펄스 + 배너
6. **공유 worktree** — 여러 에이전트가 물리적으로 같은 worktree 디렉토리를 공유 (모델 확장)
7. **우측 파일 패널 + 읽기 전용 에디터** — 기존 변경사항 탭 대체, 실제 worktree 파일 읽기
8. **하단 상태 바** — CLI 사용량 한도(Codex만 실제, 나머지 연동 안 됨) + PC 리소스(CPU/RAM 실제)
9. **설정 모달 개편** — 좌 세로 탭(화면 / 에이전트)

### 결정 사항 (사용자 확정)

- **공유 worktree**: "단일 디렉토리 실제 공유". 여러 에이전트가 같은 물리적 worktree 경로에서 동작. AgentDialog에 "기존 worktree 재사용" 옵션 추가. 모델 확장 필요.
- **CLI 사용량**: 로컬 파일 파싱 가능한 것만 실제 구현.
  - **Codex**: `~/.codex/sessions/**/rollout-*.jsonl`의 `rate_limits`를 파싱 (마지막 non-null 폴백).
  - **Claude Code / Cursor / Gemini**: 로컬에 신뢰할 수 있는 사용량 파일이 없음 → "연동 안 됨" 배지로 명시.
- **CPU/RAM**: Rust `sysinfo` crate로 실제 폴링.
- **파일 에디터**: 실제 worktree 파일 트리 열거 + 파일 내용 읽기(읽기 전용). 변경 파일은 실제 git diff 기반 +/− 및 라인 하이라이트.

---

## 2. 디자인 토큰 (`src/app.css`)

프로토타입은 hex 다크 팔레트를 쓰지만, 기존 코드베이스는 OKLch 기반 라이트/다크 토큰 체계다. **컴포넌트에 hex 직접 사용 금지** — 아래 시맨틱 토큰을 `:root`(라이트)/`.dark`(다크)에 등록하고 `@theme inline`으로 Tailwind 유틸에 노출한다.

### 2.1 상태 토큰 (신규)

기존 `StatusDot.svelte`/`DiffView.svelte`의 하드코딩 색을 대체한다.

| 토큰 | 다크 값 | 용도 |
|------|--------|------|
| `--status-running` | `oklch`(≈`#34d399`) | 실행 중 점/텍스트 |
| `--status-running-fg` | ≈`#6ee7b7` | 실행 중 틴트 텍스트 |
| `--status-idle` | ≈`#8b8f98` | 대기 |
| `--status-blocked` | ≈`#fbbf24` | 입력 대기 (솔리드 뱃지 배경) |
| `--status-blocked-fg` | ≈`#fde68a`/`#fcd34d` | 입력 대기 틴트 텍스트 |
| `--status-blocked-on` | ≈`#1c1503` | 솔리드 뱃지 위 텍스트 |
| `--status-done` | ≈`#38bdf8` | 완료 |
| `--status-done-fg` | ≈`#7dd3fc` | 완료 틴트 텍스트 |
| `--diff-add` | ≈`#34d399` | diff 추가 |
| `--diff-remove` | ≈`#f87171` | diff 삭제 |
| `--accent-share` | ≈`#a5b4fc` | 공유 worktree/링크 강조 |

- 라이트 세트는 같은 hue로 채도/명도를 조정한다(개발자 도구 특성상 다크 우선이나 라이트도 깨지지 않게).
- `@theme inline`에 `--color-status-running` 등으로 노출해 `text-status-running`, `bg-status-blocked` 같은 유틸을 쓸 수 있게 한다.

### 2.2 표면/텍스트 매핑

프로토타입의 세분화된 표면색을 기존 토큰 체계에 매핑한다. 필요한 경우에만 신규 토큰을 추가한다.

| 프로토타입 | 매핑 |
|-----------|------|
| 배경 `#17181d` | `--background` (다크값 조정) |
| 사이드바/하단바 `#13141a` | `--sidebar` |
| 카드 `#1b1d25` | `--card` |
| 타일 `#1e2027` | 신규 `--surface-tile` 또는 `--card` 재사용 |
| 선택 `#242630` + 링 `#3a3d4a` | `--accent` / `--ring` 조합 |
| 터미널 `#0b0c0f` | 신규 `--terminal-bg` (항상 다크) |
| 에디터 본문 `#101116` / 크롬 `#15161c` | 신규 `--editor-bg` / `--editor-chrome` |

> 라이트 모드에서도 **터미널은 항상 다크**(`--terminal-bg` 고정). 에디터도 코드 가독성 위해 다크 유지 검토.

### 2.3 타이포

- UI: 시스템 폰트 (기존 유지). 기본 13px.
- 코드/터미널/브랜치/수치: **JetBrains Mono** (사용자 설정 가능). 웹폰트가 아니라 **번들 폰트**로 포함(오프라인 데스크톱 앱, 프로토타입의 Google Fonts 링크는 쓰지 않음). 폰트 파일을 `src/assets/fonts/`에 두고 `@font-face`로 등록.

---

## 3. 데이터 모델 변경

### 3.1 공유 worktree

현재: `Agent.worktreePath`가 에이전트마다 독립. 공유를 위해 **여러 에이전트가 같은 `worktreePath`를 갖도록 허용**한다.

- **모델 변경 없음** (필드 재활용): `worktreePath`가 같은 에이전트 = 같은 worktree 공유. `worktreeManaged`는 **worktree를 최초 생성한 에이전트만 true**, 재사용 에이전트는 false로 저장(삭제 시 실제 디렉토리 제거는 마지막 참조자 처리 필요 → 3.2 참조).
- **그룹핑 키**: `projectId + worktreePath`. (프로토타입은 `proj + branch`로 그룹핑하지만, 실제로는 worktree 경로가 정확한 공유 단위다. 같은 브랜치라도 다른 경로면 공유가 아니다.)
- 공유 그룹은 UI 파생값으로 계산 — 사이드바 중첩 컨테이너, 상세의 다중 터미널 탭, 파일 패널 diff 병합.

### 3.2 공유 worktree 생성/삭제 백엔드

- **create_agent 확장**: `worktreePath`가 이미 존재하는 다른 에이전트의 경로와 같으면(재사용) → git worktree를 새로 만들지 않고 기존 경로를 그대로 사용. `worktreeManaged=false`로 저장.
  - 재사용 판별: 프론트에서 "기존 worktree 재사용"을 선택하면 해당 worktree 경로와 branch를 그대로 넘긴다. 백엔드는 그 경로에 이미 worktree가 있는지 확인하고 있으면 생성 스킵.
- **delete_agent 확장**: worktree 실제 제거는 **그 worktree를 참조하는 다른 에이전트가 없을 때만** 수행. 참조 카운트는 DB에서 같은 `worktree_path`를 가진 에이전트 수로 계산. 마지막 참조자 삭제 시에만 `git worktree remove`.

### 3.3 신규 백엔드 명령 (IPC)

| 명령 | 반환 | 용도 |
|------|------|------|
| `list_worktree_files(worktreePath)` | `FileEntry[]` (경로, 디렉토리, 변경상태: none/modified/new, +add/−del) | 파일 패널 트리 |
| `read_worktree_file(worktreePath, relPath)` | `{ content, isBinary }` | 에디터: 무변경 파일 원문 |
| `git_file_diff(worktreePath, relPath)` | 라인별 diff(`add`/`del`/`ctx` + 원/신 라인번호 + 텍스트) | 에디터: 변경 파일 라인 하이라이트 |
| `read_codex_usage()` | `UsageInfo \| null` | 하단 바 Codex 사용량 |
| `read_system_resources()` | `{ cpuPercent, ramUsedGb, ramTotalGb }` | 하단 바 CPU/RAM |

- 파일 트리/diff는 기존 `git/mod.rs` 패턴(`Command::new("git")`)을 확장. 파일 목록은 `git ls-files` + `git status --porcelain` + 무변경 파일까지 포함하려면 worktree 디렉토리 walk(단, `.gitignore`/`.git` 제외).
- `read_worktree_file`은 경로 이스케이프 방지(worktreePath 밖 접근 차단) 필수.
- `sysinfo` crate 추가 (Cargo.toml).

---

## 4. 프론트엔드 컴포넌트 구조

### 4.1 상태 (App.svelte 또는 신규 shell store)

```ts
selectedAgentId: string | null   // null = 오버뷰
overviewFilter: 'all' | 'running' | 'blocked' | 'done'
openFilePath: string | null      // 열린 파일(상대경로)
showEditor: boolean              // 터미널/에디터 전환
leftPanelOpen: boolean           // localStorage 'shell:left-open'
rightPanelOpen: boolean          // localStorage 'shell:right-open'
usagePopover: providerId | null
```

파생값: 상태별 카운트(칩), worktree 그룹, worktree 합산 diff 통계.

### 4.2 컴포넌트 인벤토리

| 파일 | 상태 | 역할 |
|------|------|------|
| `TitleBar.svelte` | 개편 | 좌/우 토글, 앱명, 중앙 상태 칩 ×4, 새 에이전트, 설정 |
| `StatusChips.svelte` | 신규 | 상태별 개수 pill (칩 클릭 → 오버뷰+필터) |
| `Sidebar.svelte` | 개편 | "전체 오버뷰" 항목, 프로젝트 카드, 2줄 에이전트 행, 공유 그룹, blocked 강조 |
| `MainPanel.svelte` | 개편 | 오버뷰/상세 라우팅 |
| `OverviewGrid.svelte` | 신규 | 타일 그리드 + 필터 pill + 미니 터미널 |
| `AgentDetail.svelte` | 신규(분리) | 헤더, blocked 배너, 탭 바, 터미널/에디터 |
| `FilePanel.svelte` | 신규 | 우측 worktree 파일 트리 |
| `FileViewer.svelte` | 신규 | 읽기 전용 에디터 (무변경=원문, 변경=diff) |
| `StatusBar.svelte` | 신규 | 하단 바: 사용량 + CPU/RAM |
| `UsagePopover.svelte` | 신규 | CLI 사용량 상세 팝오버 |
| `StatusDot.svelte` | 개편 | 하드코딩 색 → 토큰, running pulse, blocked ring |
| `StatusBadge.svelte` | 신규 | 상태 pill (blocked만 솔리드) |
| `SettingsDialog.svelte` | 개편 | 좌 세로 탭 |
| `settings/ScreenSettings.svelte` | 개편 | 테마 segmented + 폰트 + 폰트크기 스테퍼 |
| `settings/AgentSettings.svelte` | 신규 | kind별 기본 커맨드 표시 |
| `AgentDialog.svelte` | 개편 | "기존 worktree 재사용" 옵션 추가 |
| `DiffView.svelte` | 제거/대체 | FilePanel+FileViewer로 대체 |
| `data/labels.ts` | 확장 | `agentKindDefaults` cursor→`cursor-agent` 등 프로토타입 정합 |

### 4.3 미니 터미널 (오버뷰 타일)

- 오버뷰 타일의 미니 터미널은 **각 에이전트 PTY의 최신 출력 마지막 N줄**을 하단 정렬로 표시(overflow hidden). 실제 xterm 인스턴스를 타일마다 띄우는 것은 비용이 크므로, **PTY 출력 tail을 텍스트로 버퍼링**해 표시(ANSI 파싱은 최소한 또는 평문). 상세 진입 시 실제 xterm.

> **주의**: 프로토타입의 미니 터미널·오버뷰 출력은 모두 목업. 실제로는 세션 store가 각 에이전트의 출력 tail을 유지해야 함. 이는 상당한 작업이므로 아래 단계에서 별도 처리.

---

## 5. 상호작용 흐름 (프로토타입 재현)

1. 사이드바 행/타일 클릭 → 상세(터미널 탭, 에디터 닫힘)
2. "전체 오버뷰" 항목·상태 칩 클릭 → 오버뷰 (칩은 필터 적용)
3. 오버뷰 done 타일 "변경 검토 →" → 상세 + 첫 변경 파일 에디터
4. 파일 클릭 → 에디터 + 파일 탭 생성. 터미널 탭으로 돌아가도 파일 탭 유지, ×로 닫기
5. 공유 worktree: 터미널 탭 전환 = 에이전트 전환(사이드바 선택 동기화)
6. 하단 사용량 클릭 → 팝오버(재클릭 닫힘)
7. 좌/우 패널 토글 (localStorage 저장)

### 애니메이션

- running 점: `opacity 1↔0.35` 1.6s 무한
- blocked 점/칩: 링 펄스 `box-shadow 0→7px` 1.8s
- 터미널 커서: blink (xterm 기본)
- **`prefers-reduced-motion` 시 모두 정지** (필수)

---

## 6. 구현 단계 (커밋 단위)

> CLAUDE.md 커밋 규칙 준수: 기능 단위 커밋, 한 커밋에 한 기능, 한글 메시지, Co-Author 없음. 코드 수정 커밋에는 `[ci skip]` 미사용.

**Phase A — 토큰·기반**
- A1. `app.css` 상태/표면/diff 시맨틱 토큰 등록 + `@theme inline` 노출
- A2. JetBrains Mono 번들 폰트 등록
- A3. `StatusDot`/`StatusBadge` 토큰화 + 애니메이션 + reduced-motion

**Phase B — 백엔드**
- B1. `sysinfo` 추가 + `read_system_resources` 명령
- B2. Codex 사용량 파서 + `read_codex_usage` 명령
- B3. 파일 트리/읽기/파일별 diff 명령 3종 (+경로 이스케이프 방지)
- B4. 공유 worktree: create_agent 재사용 분기 + delete_agent 참조 카운트

**Phase C — 셸 레이아웃/라우팅**
- C1. shell store(selected/filter/panels/editor) + localStorage
- C2. TitleBar 개편 + StatusChips + 패널 토글
- C3. Sidebar 개편(오버뷰 항목/카드/2줄 행/공유 그룹/blocked)

**Phase D — 메인 콘텐츠**
- D1. OverviewGrid(필터 pill + 타일 + 미니 터미널 tail)
- D2. AgentDetail(헤더/blocked 배너/탭 바/다중 터미널 탭)
- D3. FilePanel + FileViewer(실제 파일/diff)

**Phase E — 하단 바·설정**
- E1. StatusBar + UsagePopover (사용량 + CPU/RAM 폴링)
- E2. SettingsDialog 세로 탭 + ScreenSettings 개편 + AgentSettings
- E3. AgentDialog "기존 worktree 재사용"

각 Phase 후 `pnpm check`/`vitest`/`cargo test`로 검증하고, 코드 리뷰 패스를 별도 레인으로 돌린다.

---

## 7. YAGNI / 범위 밖

- 사용량 대시보드 외부 링크의 실제 브라우저 오픈은 `tauri-plugin-opener`로 연결(이미 있음), 대시보드 URL은 provider별 상수.
- Claude/Cursor/Gemini 사용량 실제 조회는 **범위 밖**(연동 안 됨 배지). 향후 사용자가 원하면 statusLine 훅 설치 옵션 별도 논의.
- 프로토타입의 `density`(컴팩트) / `overviewCols` props는 프로토타입 편집용 노브 — 설정 UI에는 넣지 않되, 오버뷰 열 수는 컨테이너 폭 기반 반응형(2~4열)으로 자동 처리.
- 모바일/반응형은 데스크톱 최소폭(1180px) 기준만.

---

## 8. 리스크

- **미니 터미널 tail**: 모든 에이전트의 PTY 출력을 버퍼링하려면 세션 store 확장이 큼. Phase D1에서 범위를 "최근 출력 평문 tail"로 제한하고, 과한 ANSI 렌더링은 하지 않는다.
- **공유 worktree 삭제 참조 카운트**: 동시성(락) 주의. 기존 delete 패턴(락 밖 git 호출)을 유지하며 참조 조회→제거 판단을 원자적으로.
- **파일 트리 성능**: 대형 저장소에서 전체 walk는 느릴 수 있음 → `git ls-files` 기반(추적 파일) + 변경 파일 우선, 무변경 파일은 지연 로드 고려.
