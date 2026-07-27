# 성능·반응성·리소스 마찰점 조사 (Lane G)

## 1. 주기적 타이머 현황
| # | 위치 (파일:줄) | 주기 | 설명 | IPC 호출 추정 |
|---|----------------|------|------|----------------|
| 1 | `src/lib/stores/updater.svelte.ts:34` | 86 400 000 ms (24 시간) | 자동 업데이트 확인 타이머. 하루 1회 IPC (`checkUpdate`). |
| 2 | `src/lib/components/shell/AgentDetail.svelte:88` | 2 000 ms | 에이전트 감지 `agentDetection.refreshAll` 호출. 20 Agent 시 초당 10 IPC (20 × 0.5 calls). |
| 3 | `src/lib/components/shell/StatusBar.svelte:84` | 30 000 ms | 사용량(`readClaudeUsage`, `readCodexUsage`) 조회. 20 Agent 환경에서는 0.033 IPC/s (1 call per 30 s). |
| 4 | `src/lib/components/shell/StatusBar.svelte:85` | 5 000 ms | 시스템 리소스(`readSystemResources`) 조회. 0.2 IPC/s (1 call per 5 s). |
| 5 | `src-tauri/src/hooks/gjc.rs:36` | 3 000 ms | 상태 파일 하트비트 쓰기. 0.33 IPC/s (파일 I/O) – 백엔드와 무관하지만 디스크 I/O 부하. |

### 1‑1. IPC 빈도 계산 (예시: 20 Agent)
* AgentDetail 타이머: `20 agents ÷ 2 s = 10 calls / s`.
* StatusBar 사용량/리소스: 각각 1 call / 30 s, 1 call / 5 s → 합계 약 `0.233 calls / s`.
* 자동 업데이트: 하루 1 call → 무시 가능.
* GJC 하트비트: 파일 쓰기 0.33 calls / s.

## 2. 불필요한 백그라운드 폴링
* **AgentDetail** 타이머는 UI 가시성에 관계없이 전역적으로 실행됩니다. 화면에 보이지 않는 워크스페이스(예: 비활성 탭)에서도 `agentDetection.refreshAll`이 수행되어 서버에 불필요한 상태 조회가 발생합니다. (파일: `src/lib/components/shell/AgentDetail.svelte:85‑88`)

## 3. 스크롤백·버퍼 메모리 관리
* `src/lib/terminal/pool.ts` 의 `snapshot` 및 `snapshot` 내부 `buf.length` 순회는 전체 버퍼를 매번 스캔합니다. xterm 기본 버퍼는 무제한이며, 대용량 출력 시 메모리 사용량이 급증합니다. (파일: `src/lib/terminal/pool.ts:270‑277`)
* 버퍼 상한 설정이 전혀 없으며, 스크롤백을 가상화(virtual scroll)하거나 최대 라인 수 제한을 적용하지 않아 메모리 누수가 발생할 가능성이 높습니다.

## 4. 앱 초기화 비용
* `src/App.svelte` 의 `onMount` 에서 여러 스토어를 동시에 `load()` 합니다. 각각은 백엔드 IPC (`ipc.listProjects`, `ipc.listPrompts`, `ipc.listTasks`, `ipc.listPlaybooks` 등) 호출을 수행합니다.
  * `projectStore.load()` – 파일: `src/lib/stores/projects.svelte.ts:55‑59` – 1 IPC (프로젝트 목록).
  * `promptStore.load()` – 파일: `src/lib/stores/prompts.svelte.ts:12‑14` – 1 IPC.
  * `taskStore.load()` – 파일: `src/lib/stores/tasks.svelte.ts:12‑14` – 1 IPC.
  * `playbookStore.load()` – 파일: `src/lib/stores/playbooks.svelte.ts:12‑14` – 1 IPC.
* 이들 로드가 순차적으로 실행되며, 네트워크/프로세스 경계 IPC가 4 ~ 5 회 발생해 초기 화면까지 도달 시간을 크게 늘릴 수 있습니다. (앱 시작 지연 ≈ Σ latency of 4 IPC).

## 5. 고비용 명령 (src-tauri/src/commands.rs)
* `git diff`, `lsof`, 폰트 열거 등 비용 큰 명령은 `src-tauri/src/commands.rs` 에 정의돼 있습니다. 현재 사용 빈도는 코드에서 직접 호출되는 부분이 없으나, 미래에 UI 버튼이나 자동 스크립트에 연결될 경우 성능 병목이 될 수 있습니다.

## 6. 개선 방안 요약
| # | 마찰 | 근거 | 심각도 | 사용빈도 | 구현 난이도 | 개선안 |
|---|------|------|--------|----------|------------|--------|
| 1 | AgentDetail 타이머가 비가시 터미널에도 실행 | `AgentDetail.svelte:85‑88` | 상 | 높은 (20 Agent) | S | UI 가시성 기반 **pause** 로직: `if (!isVisible) clearInterval(timer)` 또는 `requestIdleCallback` 으로 백그라운드 폴링 전환. |
| 2 | StatusBar 사용량/리소스 폴링頻度 | `StatusBar.svelte:84‑85` | 중 | 중 | S | 가시 탭에만 타이머 활성화; 숨김 시 `clearInterval`; 혹은 **debounce** 10 s 로 감축. |
| 3 | xterm 스크롤백 무제한 | `pool.ts:270‑277` | 상 | 고 (대용량 출력) | M | 버퍼 상한 설정 (`term.setOption('scrollback', 1000)`) 및 가상 스크롤 구현. |
| 4 | 앱 초기화 다중 IPC | `App.svelte:onMount` 및 각 `load()` 구현 | 중 | 앱 시작 시 | S | **병렬** 로드 + **프리패치**: `Promise.all([...])` 로 동시에 요청; 필요한 경우 **lazy‑load**(프로젝트 목록만 먼저, 나머지는 탭 전환 시). |
| 5 | GJC 하트비트 파일 I/O | `gjc.rs:36` | 하 | 지속 | S | 파일 쓰기를 **배치**(예: 10 s 간격) 혹은 메모리‑전용 상태 유지; 디스크 I/O 감소. |

## 7. Top 5 즉시 개선 제안 (우선순위)
1. **AgentDetail 가시성 기반 타이머 중단** – 비가시 에이전트에 대한 2 s 폴링을 멈춰 초당 10 IPC를 크게 감소.
2. **xterm 스크롤백 제한** – `Terminal` 옵션 `scrollback`을 1000 라인 이하로 제한하고, `snapshot` 로직에 라인 수 제한 적용.
3. **StatusBar 타이머 가시성 제어** – 사용량/리소스 폴링을 화면에 보일 때만 실행하거나 30 s → 60 s 로 늘림.
4. **앱 시작 IPC 병렬화** – `App.svelte` 초기화 시 `Promise.all([...])` 로 `load()` 호출을 병렬화하고, 필요 시 lazy load 적용.
5. **GJC 하트비트 배치** – 3 s 하트비트를 10 s 배치하거나 메모리‑전용 상태로 전환하여 디스크 쓰기 부하 감소.

---
*본 문서는 실제 코드 라인 번호와 파일 경로에 기반하여 작성되었습니다. 모든 제안은 기존 로직을 최소 변경하면서 성능·리소스 사용량을 크게 개선할 수 있도록 설계되었습니다.*