# Worklane

**여러 프로젝트와 여러 CLI 코딩 에이전트를 하나의 데스크톱 작업공간에서 관리하세요.**

[English](README.md)

> [!WARNING]
> **초기 개발 단계** — Worklane은 현재 활발히 개발 중입니다. 아직 공식 릴리스나 설치 파일이 없으며 제품이 발전함에 따라 워크플로우가 변경될 수 있습니다.

## 왜 Worklane인가요?

하나의 저장소에서 여러 코딩 에이전트를 실행하는 것만으로는 충분하지 않습니다. 개발자는 보통 여러 프로젝트를 오가며 각 프로젝트의 에이전트, 브랜치, 터미널, 검토 맥락을 함께 관리해야 합니다.

Worklane은 이러한 **다중 프로젝트 × 다중 에이전트** 워크플로우를 중심으로 만든 데스크톱 작업공간입니다. 에이전트 세션을 프로젝트별로 묶고, Git worktree로 병렬 작업을 격리하며, 상태와 터미널 출력, 코드 변경사항을 한곳에 모읍니다.

장기적인 목표는 코딩 에이전트나 에디터를 대체하는 것이 아닙니다. 여러 프로젝트에 걸친 에이전트 조율을 더 쉽게 만드는 것입니다.

## 현재 제공 기능

- **다중 프로젝트 작업공간** — 로컬 Git 저장소를 등록하고 프로젝트와 에이전트 정보를 로컬 SQLite 데이터베이스에 저장합니다.
- **CLI 에이전트 프리셋** — Claude Code, Codex, Cursor, Gemini 명령을 실행하며 작업환경별 실행 명령을 직접 수정할 수 있습니다.
- **Worktree 격리** — 에이전트용 브랜치 기반 Git worktree를 만들거나 여러 에이전트가 기존 worktree를 공유하도록 구성할 수 있습니다.
- **내장 터미널** — 네이티브 PTY와 xterm.js 터미널을 통해 대화형 CLI 세션을 실행합니다.
- **통합 현황판** — 프로젝트 전체 에이전트의 실행 중, 대기, 입력 대기, 완료 상태와 최근 터미널 출력을 확인합니다.
- **변경사항 검토** — 추적되지 않은 파일을 포함해 worktree의 파일, 추가·삭제 줄 수, 파일별 diff를 검토합니다.
- **사용량과 시스템 자원** — Codex와 Claude Code 사용량을 로컬 CPU·메모리 활동과 함께 표시합니다.
- **환경설정 유지** — 설치된 시스템 폰트를 포함한 화면 및 터미널 설정을 사용자화할 수 있습니다.

## 하이브리드 에이전트 상태 추적

대부분의 에이전트 관리 도구는 자신이 실행한 프로세스를 상태 판단의 기준으로 사용합니다. 하지만 에이전트가 `tmux` 같은 멀티플렉서 뒤에서 실행되면 이 신호만으로 실제 상태를 파악하기 어렵습니다.

Worklane의 상태 엔진은 세 가지 신호를 결합합니다.

| 신호 | 목적 |
| --- | --- |
| PTY 프로세스 상태 | 직접 관리하는 프로세스가 살아 있는지 확인 |
| 출력 활동 | 실제로 작업 중인 세션과 살아 있지만 조용한 세션을 구분 |
| 에이전트 훅 상태 | 최신 에이전트 신호를 통해 작업 중, 입력 대기, 완료 상태를 우선 판정 |

상태 리듀서는 프로세스 종료를 가장 먼저 확인하고, 그다음 최신 훅 데이터를 사용하며, 훅이 없으면 최근 터미널 활동으로 판단합니다. 하나의 신호에만 의존하지 않고 `running`, `idle`, `blocked`, `done` 상태를 표현합니다.

## 기술 스택

| 계층 | 기술 |
| --- | --- |
| 데스크톱 셸 | [Tauri v2](https://v2.tauri.app/) |
| 백엔드 | Rust |
| 프런트엔드 | Svelte 5, TypeScript, Vite |
| 스타일링 | Tailwind CSS, Bits UI |
| 터미널 | xterm.js |
| PTY | portable-pty |
| 영속 저장 | rusqlite 기반 SQLite |

Worklane은 macOS, Windows, Linux를 대상으로 하며 현재는 macOS 개발을 우선합니다. 크로스플랫폼 동작은 초기 개발 과정에서 계속 검증하고 있습니다.

## 시작하기

아직 공식 패키지는 제공하지 않습니다. Worklane을 사용해 보려면 소스에서 빌드해 주세요.

### 사전 요구사항

- [Node.js](https://nodejs.org/)
- [pnpm](https://pnpm.io/)
- [Rust](https://www.rust-lang.org/tools/install)
- [Git](https://git-scm.com/)
- 공식 문서에 안내된 [Tauri v2 시스템 요구사항](https://v2.tauri.app/start/prerequisites/)

실행하려는 CLI 에이전트도 별도로 설치하고 인증해야 합니다. Worklane은 에이전트 자체를 포함하지 않습니다.

### 데스크톱 앱 실행

```bash
git clone https://github.com/mongmeo-dev/worklane.git
cd worklane
pnpm install
pnpm tauri dev
```

### 애플리케이션 번들 빌드

```bash
pnpm tauri build
```

생성된 결과물은 `src-tauri/target/release/bundle/` 아래의 플랫폼별 Tauri 번들 디렉터리에 저장됩니다.

## 개발

| 명령 | 설명 |
| --- | --- |
| `pnpm dev` | Vite 프런트엔드 개발 서버 실행 |
| `pnpm tauri dev` | 개발 모드로 데스크톱 앱 실행 |
| `pnpm check` | Svelte 및 TypeScript 진단 실행 |
| `pnpm test` | Vitest 테스트 스위트 실행 |
| `pnpm build` | 프런트엔드 빌드 |
| `pnpm tauri build` | 데스크톱 애플리케이션 번들 빌드 |

## 로드맵

현재 다음 영역을 탐색하고 있습니다.

- 더 명확한 다중 프로젝트 대시보드와 빠른 컨텍스트 전환
- 더 많은 CLI 코딩 에이전트를 위한 상태 훅 연동 강화
- 에이전트가 만든 변경사항의 검토 및 병합 워크플로우 강화
- macOS 우선의 제품 완성도 개선과 Windows·Linux 검증 확대
- 서명된 설치 파일과 문서화된 릴리스 절차

위 항목은 개발 방향이며 확정된 출시 일정이나 최종 기능이 아닙니다.

## 기여하기

Worklane은 초기 단계이므로 범위가 명확한 버그 제보, 디자인 피드백, 작은 Pull Request가 특히 유용합니다. 큰 변경을 시작하기 전에는 Issue를 열어 범위와 제품 방향을 먼저 맞춰 주세요.

## 라이선스

Worklane은 MIT License로 배포됩니다.
