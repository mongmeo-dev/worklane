# 설계: 설정 화면 Phase 1 — '화면' 탭 (다크모드 · 터미널 폰트)

- 작성일: 2026-07-20
- 상태: 승인 대기
- 관련 문서: `CLAUDE.md`의 "Technical Stack" 섹션, `docs/superpowers/specs/2026-07-20-pty-terminal-and-status-tracking-design.md`

## 1. 목표와 범위

여러 탭으로 구성된 설정 화면을 도입하고, 그 첫 번째 탭인 **'화면' 탭**을 구현한다. '화면' 탭은 두 가지 설정을 제공한다.

1. **다크모드** — 라이트 / 다크 / 시스템 3단 선택. 앱 전역 테마에 즉시 반영.
2. **터미널 폰트** — 폰트 이름(자유 입력 + 시스템 폰트 자동완성)과 폰트 크기 조절. xterm.js 터미널에 즉시 반영.

설정 화면 자체의 골격(탭 구조 + 모달)을 이번에 세우되, '화면' 외의 탭은 만들지 않고 이후 확장할 수 있는 형태만 남긴다.

### 확정된 결정사항 (clarifying 결과)

- **표시 형태**: 모달 오버레이. TitleBar의 설정 아이콘 클릭 시 화면 중앙에 다이얼로그로 뜬다.
- **다크모드**: 라이트 / 다크 / 시스템 3단. `시스템` 선택 시 OS 설정(`prefers-color-scheme`)을 실시간으로 따른다.
- **폰트 선택**: 자유 입력 + 시스템 설치 폰트 자동완성 + 폰트 크기 조절.
- **폰트 목록 소스**: Rust 백엔드에서 `font-kit` crate로 시스템 폰트를 열거해 IPC로 전달. WKWebView는 브라우저 폰트 열거 API를 신뢰할 수 없기 때문.
- **테마 선택 UI**: 정식 `select` 드롭다운 (shadcn-svelte / bits-ui).

## 2. 전체 아키텍처

```
┌──────────────────────────────────────────────────────────┐
│  프론트엔드 (Svelte 5)                                      │
│                                                          │
│  TitleBar(설정 아이콘) ──클릭──> settingsUi.open()          │
│                                     │                    │
│                                     ▼                    │
│                        SettingsDialog.svelte (모달)       │
│                        ├─ 좌: 세로 탭 목록 ('화면' …)       │
│                        └─ 우: ScreenSettings.svelte       │
│                              ├─ 테마 select ──> themeStore │
│                              └─ 폰트 입력/크기 ──> termStore│
│                                                          │
│  themeStore ──> <html>.dark 토글 (app.css 규칙과 연동)     │
│  termStore  ──> Terminal.svelte $effect ──> xterm 옵션    │
│                                     │ invoke              │
└─────────────────────────────────────┼────────────────────┘
                                      ▼
┌──────────────────────────────────────────────────────────┐
│  Rust 백엔드 (Tauri v2)                                    │
│  commands.rs: list_monospace_fonts() ─ font-kit 열거      │
└──────────────────────────────────────────────────────────┘
```

기존 셸 구조(`App.svelte` → `TitleBar` / `Sidebar` / `MainPanel`)를 유지하고, 설정 UI는 그 위에 얹는 모달로 격리한다. 상태는 두 개의 독립 store로 분리해 각각 하나의 책임만 갖는다.

## 3. 상태 관리 (신규 store 2개)

### 3.1 `src/lib/stores/theme.svelte.ts`

- 상태: `mode: 'light' | 'dark' | 'system'`, localStorage 키 `settings:theme-mode`에 영속.
- 적용: `document.documentElement.classList`에 `dark` 클래스를 붙이거나 뗀다. app.css의 `@custom-variant dark (&:where(.dark, .dark *))` 규칙이 이 클래스에 반응한다.
- `system` 모드: `window.matchMedia('(prefers-color-scheme: dark)')`를 구독해 OS 테마 변경 시 실시간 반영. `light`/`dark` 고정 모드에서는 미디어쿼리 구독을 해제한다.
- 초기화: FOUC(깜빡임) 방지를 위해 `App.svelte`가 렌더되기 전 `main.ts`에서 저장된 모드를 즉시 적용한다.
- 손상값 방어: localStorage 값이 세 리터럴 중 하나가 아니면 `system`으로 폴백.

### 3.2 `src/lib/stores/terminalSettings.svelte.ts`

- 상태: `fontFamily: string`(기본 `"monospace"`), `fontSize: number`(기본 13). localStorage 키 `settings:terminal-font`.
- `Terminal.svelte`가 이 store를 구독한다. `$effect`로 `term.options.fontFamily` / `term.options.fontSize`를 갱신하고 `fit.fit()` + `resizePty()`를 재호출해 셀 크기 변화를 PTY에 알린다.
- 손상값 방어: `fontSize`는 8~32 범위로 clamp(기존 `App.svelte`의 사이드바 clamp 패턴 준용), `fontFamily`가 빈 문자열이면 `"monospace"` 폴백.

### 3.3 `src/lib/stores/settingsUi.svelte.ts`

- 모달 열림/닫힘 상태(`isOpen: boolean`)와 현재 탭(`activeTab`)만 갖는 가벼운 UI store. 영속 불필요.

## 4. 폰트 열거 (Rust IPC)

- `src-tauri/Cargo.toml`에 `font-kit` 의존성 추가.
- `src-tauri/src/commands.rs`에 `list_monospace_fonts` 커맨드 추가. `SystemSource`로 폰트 패밀리 이름을 열거하고, 중복 제거 + 정렬한 `Vec<String>`을 반환한다. (monospace 판별이 crate에서 간단치 않으면 전체 패밀리를 반환하고 프론트에서 필터 없이 자동완성으로 노출.)
- `src-tauri/src/lib.rs`의 `invoke_handler`에 커맨드 등록.
- 프론트: `src/lib/ipc/fonts.ts`에 `listFonts(): Promise<string[]>` 래퍼. 설정 다이얼로그가 열릴 때 1회 조회한다.

## 5. UI 컴포넌트 추가 (shadcn-svelte / bits-ui)

`bits-ui`가 이미 설치되어 있으므로 shadcn-svelte 규격에 맞춰 필요한 primitive를 `src/lib/components/ui/`에 추가한다.

- `dialog` — 모달 컨테이너
- `select` — 테마 3단 선택
- `label`, `input` — 폰트 이름/크기 입력

폰트 자동완성은 `<input list=...>` + `<datalist>`로 구현해 목록에 없는 폰트명도 자유 입력이 가능하게 한다(별도 combobox 컴포넌트 불필요).

### 신규 컴포넌트 파일

- `src/lib/components/shell/SettingsDialog.svelte` — 모달 + 세로 탭 레이아웃
- `src/lib/components/settings/ScreenSettings.svelte` — '화면' 탭 본문

## 6. 연동 지점 (기존 파일 수정)

- `src/lib/components/shell/TitleBar.svelte`: 설정 아이콘 버튼에 `onclick={() => settingsUi.open()}` 연결.
- `src/App.svelte`: `<SettingsDialog />`를 셸 최상위에 마운트.
- `src/main.ts`: 앱 부팅 시 `theme.init()` 호출(FOUC 방지).
- `src/lib/components/shell/Terminal.svelte`: 하드코딩된 `fontFamily`/`fontSize`를 `terminalSettings` store 구독으로 교체.

## 7. 에러 처리 / 엣지 케이스

- 폰트 열거 IPC 실패 → 자동완성 목록만 비게 되고 자유 입력은 계속 동작(조용한 degrade). 사용자에게 치명적 오류를 띄우지 않는다.
- localStorage 손상값 → 각 store에서 기본값 폴백(테마: `system`, 폰트 크기: clamp).
- `system` 모드에서 OS 테마 변경 → matchMedia 리스너가 실시간 반영.
- 폰트 크기 입력에 숫자가 아닌 값 → 무시하고 이전 값 유지.

## 8. 테스트

기존 `src/lib/terminal/ime-core.test.ts` 패턴(vitest)을 따른다.

- `theme.svelte.ts`: `light`/`dark`/`system` 전환 시 `<html>.dark` 클래스 토글 및 localStorage 저장 검증. 손상값 폴백 검증.
- `terminalSettings.svelte.ts`: 폰트 크기 clamp(8~32) 및 빈 fontFamily 폴백 검증.
- Rust 폰트 열거, 모달 UI, xterm 반영 같은 I/O 경계는 수동/시각 검증.

## 9. 범위 밖 (이후 작업)

- '화면' 외 다른 설정 탭(예: 에이전트, 단축키 등).
- 폰트 미리보기 렌더링.
- 설정값의 파일 기반 영속(현재는 localStorage로 충분).
