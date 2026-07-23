# Design

## Source of truth
- 상태: Active
- 마지막 갱신: 2026-07-23
- 주요 제품 화면: 전체 오버뷰, 에이전트 상세, 파일 미리보기, 설정
- 검토한 근거:
  - `worklane-task/AGENTS.md`
  - `worklane-task/AI Agent Workspace 프로토타입.dc.html`
  - `docs/superpowers/specs/2026-07-22-main-screen-redesign-design.md`
  - `docs/superpowers/plans/2026-07-22-main-screen-redesign-master.md`
  - 현재 `src/lib/components/shell/*`, `src/app.css`, Tauri IPC 구현

## Brand
- 성격: 집중된 개발 도구, 침착함, 높은 정보 밀도, 빠른 상태 파악
- 신뢰 신호: 실제 PTY·Git·사용량·시스템 리소스 데이터를 명확한 상태로 표현
- 피해야 할 것: 장식적 그라디언트 남용, 과도한 그림자, 상태를 색 하나로만 전달, 컴포넌트 내 하드코딩 색상

## Product goals
- 목표: 여러 프로젝트와 에이전트의 상태를 한 화면에서 파악하고 필요한 작업으로 즉시 이동한다.
- 목표: 공유 worktree와 파일 변경을 에이전트·작업 단위로 이해할 수 있게 한다.
- 목표: 터미널, 파일 미리보기, 사용량, 설정을 한 셸 안에서 끊김 없이 전환한다.
- 비목표: 모바일 화면, 전체 IDE 기능, Cursor·Gemini 사용량의 비공식 추정
- 성공 신호: 프로토타입의 모든 명시적 클릭 흐름이 실제 데이터와 연결되고, 키보드·감소된 모션 환경에서도 사용할 수 있다.

## Personas and jobs
- 주요 사용자: 여러 저장소에서 여러 CLI 코딩 에이전트를 동시에 운용하는 개발자
- 사용자 작업: 입력 대기 감지, 실행 현황 확인, 에이전트 전환, 변경 파일 검토, 사용량 확인, 터미널 환경 조정
- 사용 맥락: macOS 우선 데스크톱 환경, 장시간 켜 둔 상태에서 짧고 빈번한 컨텍스트 전환

## Information architecture
- 주요 내비게이션: 좌측 전체 오버뷰와 프로젝트별 에이전트 목록
- 핵심 화면: 전체 오버뷰 → 에이전트 상세 → 터미널 또는 파일 미리보기
- 콘텐츠 계층: 전역 상태 → 프로젝트/공유 worktree → 에이전트 → 터미널·파일

## Design principles
- 상태 우선: 입력 대기와 실행 상태를 가장 빠르게 인지하게 한다.
- 컨텍스트 보존: 파일 탭, 패널 열림 상태, 필터, 터미널 설정을 전환 후에도 보존한다.
- 실제 경계 반영: 공유 worktree는 브랜치명이 아니라 동일한 `worktreePath`로 판별한다.
- 절제된 밀도: 개발 도구에 필요한 정보를 유지하되 작은 메타 정보와 명확한 계층으로 소음을 낮춘다.
- 트레이드오프: 미니 터미널은 별도 xterm 인스턴스 대신 최근 평문 출력 요약을 사용해 자원 사용을 억제한다.

## Visual language
- 색상: `src/app.css`의 시맨틱 상태·diff·표면 토큰만 사용한다.
- 타이포: UI는 시스템 폰트, 코드·브랜치·수치는 JetBrains Mono를 사용한다.
- 간격/레이아웃 리듬: 4px 기반, 화면 주요 간격 13~22px, 행 28~40px
- 모양/반경/고도: 행 8~9px, 카드·타일 10~12px, 모달 14px, pill 999px
- 모션: 실행 상태 opacity pulse, 입력 대기 ring pulse, `prefers-reduced-motion`에서 정지
- 이미지/아이콘: Worklane 병렬 레인 앱 아이콘과 Lucide 선형 아이콘만 사용

## Components
- 재사용: Button, Dialog, ScrollArea, Select, Tabs, Resizable, StatusDot, StatusBadge, Terminal
- 신규/변경: StatusChips, OverviewGrid, AgentDetail, FilePanel, FileViewer, StatusBar, UsagePopover, AgentSettings
- 변형/상태: running, blocked, idle, done, 선택, 로딩, 빈 상태, 오류, 비활성, 공유 worktree
- 소유권: 전역 화면 상태는 `shell.svelte.ts`, 디자인 토큰은 `app.css`, 제품 라벨은 `labels.ts`

## Accessibility
- 목표 표준: WCAG 2.2 AA 수준의 대비와 조작 가능성
- 키보드/포커스: 모든 버튼·탭·파일 행은 키보드로 접근하고 명시적 `aria-label`을 제공한다.
- 대비/가독성: 상태는 색과 텍스트·형태를 함께 사용한다.
- 스크린리더: 상태 요약과 배지는 읽을 수 있는 한글 라벨을 제공한다.
- 감소된 모션: 상태 pulse와 기타 전환 애니메이션을 중지한다.

## Responsive behavior
- 지원 화면: 데스크톱 최소 900×600, 기준 1280×800
- 레이아웃 적응: 오버뷰는 컨테이너 폭에 따라 2~4열, 좌 패널은 paneforge 비율을 보존한다.
- 터치/호버: 주 대상은 포인터·키보드이며, 핵심 액션은 호버에만 숨기지 않는다.

## Interaction states
- 로딩: 프로젝트·파일·사용량·리소스 영역별 로딩 상태
- 빈 상태: 프로젝트 없음, 필터 결과 없음, 파일 없음, 변경 없음
- 오류: 영역 안에서 오류 메시지와 재시도 액션 제공
- 성공: 선택·탭·필터·설정 변경을 즉시 반영
- 비활성: 미연동 사용량과 사용할 수 없는 액션을 명시
- 느린 소스: 마지막 성공 값을 유지하고 갱신 실패를 전체 화면 오류로 승격하지 않는다.

## Content voice
- 톤: 짧고 침착한 한국어, 행동 결과가 분명한 동사 사용
- 용어: 실행 중, 입력 대기, 대기, 완료, 공유 worktree, 변경 검토
- 마이크로카피: 기술적 실패를 숨기지 않되 사용자가 취할 다음 행동을 함께 제시한다.

## Implementation constraints
- 프레임워크/스타일: Svelte 5 룬, Tailwind CSS v4, shadcn-svelte/bits-ui, paneforge
- 토큰: 컴포넌트에 hex 직접 사용 금지
- 성능: 오버뷰에 다수 xterm 인스턴스를 생성하지 않고 출력 tail을 사용한다.
- 호환성: Tauri v2, macOS 우선, Windows·Linux 유지
- 검증: Vitest, svelte-check, Vite build, Cargo test, 가능하면 1280×800 화면 캡처와 상호작용 스모크

## Open questions
- 없음. 이번 구현은 `worklane-task/AGENTS.md`와 프로토타입을 승인된 기준으로 따른다.
