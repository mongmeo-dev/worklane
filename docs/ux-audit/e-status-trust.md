# Lane E — 상태 트래킹 신뢰성과 알림/주의 흐름 감사

> 작성: worker-2 · 조사 방식: 리포지토리 코드 정독 + Orca/Superset 공개 문서 조사(읽기 전용)
> 이 문서는 제품 소스를 수정하지 않는다. 모든 지적에는 `파일:줄` 또는 함수/상수명을 근거로 붙였다.

---

## 0. 한 줄 판정

**이 앱이 "핵심 차별화"라고 선언한 3계층 하이브리드 상태 트래킹은, 정작 이 앱이 관리 대상이라고 홍보하는 에이전트(Claude Code·Codex·Cursor·Gemini)에서는 2계층(프로세스 생존 + 출력 무변화)으로만 동작한다.** 3번째 계층(에이전트 훅)은 오직 `gjc` 커맨드에만 붙는다(`src-tauri/src/hooks/mod.rs:42`). 그 결과 이 제품의 대표 신뢰 신호인 **"입력 대기(blocked)"가 대상 에이전트에서 구조적으로 판정 불가**이고, "질문 대기 중인 CLI가 idle로 보이는" 바로 그 실패가 코드상 확정되어 있다. 여기에 알림은 클릭해도 해당 에이전트로 점프하지 않고(fire-and-forget), 상태에는 신뢰도·마지막 신호 시각·근거가 전혀 노출되지 않아 사용자가 "이 초록 점을 믿어도 되나"를 검증할 방법이 없다.

---

## 1. 3계층 상태 트래킹의 실제 구현 지도

선언(README.ko.md:54-62)과 구현을 코드로 대조한다.

| 계층 | 선언된 역할 | 실제 구현 위치 | 실제 동작 |
| --- | --- | --- | --- |
| ① 프로세스 트리 | 직접 스폰 프로세스 생존 | `pty/session.rs:48 is_alive()` → `engine.rs:7-9` | 죽으면 무조건 `Done`. **exit code는 판정에 안 씀** |
| ② 출력 무변화 | tmux 경계를 뚫는 idle 판정 | `engine.rs:23-27`, 임계값 `inputs.rs:38 IDLE_THRESHOLD_MS=2000` | 마지막 출력 2초 경과 → `Idle`, 그 안이면 `Running` |
| ③ 에이전트 훅 | 작업/입력대기/완료를 1차 신호로 우선 판정 | `hooks/mod.rs:41-43 probes()` | **등록된 프로브는 `gjc` 단 하나** (`hooks/gjc.rs`) |

핵심 리듀서 `reduce()`(`src-tauri/src/status/engine.rs:5-28`) 우선순위:

```
process_alive == false            → Done      (7-9)   // exit_code 무시
hook_fresh && hook_status 존재      → Working/WaitingInput/Done 매핑 (12-20)
else ms_since_last_output < 2000  → Running   (23-24)
else                              → Idle      (25-27)
```

폴러(`src-tauri/src/status/poller.rs:21-68`)는 250ms마다 전 세션을 재계산하고 변경분만 `status-changed` 이벤트로 emit한다. 이벤트 페이로드는 `{ session_id, status }` 뿐이다(`poller.rs:15-18`, `src/lib/ipc/status.ts:4`) — **타임스탬프도, 어느 계층이 판정했는지도, 신뢰도도 실려 있지 않다.**

프론트는 `SessionStatusStore`(`src/lib/stores/sessions.svelte.ts`)가 이 이벤트를 받아 터미널 id별 상태를 저장하고, `projects.svelte.ts:42-49`가 `aggregateStatus`(`src/lib/shell/derived.ts:24-30`)로 에이전트 단위 상태를 합성한다.

> 참고: `install_claude_statusline`(`commands.rs:613`, `usage/claude.rs`)은 **토큰 사용량 표시용 statusline**이지 실행 상태 훅이 아니다. Claude Code의 실행 상태(작업중/입력대기/완료)를 계층 ③으로 끌어오는 코드는 존재하지 않는다.

---

## 2. (a) running/idle/blocked 오판정 시나리오 (코드 근거)

| # | 시나리오 | 실제 판정 | 올바른 판정 | 코드 근거 |
| --- | --- | --- | --- | --- |
| S1 | **Claude/Codex가 권한·확인 프롬프트("proceed? y/n")를 띄우고 출력 멈춤** | 2초 뒤 `Idle` | `Blocked`(입력 대기) | 비-gjc는 계층③ 없음(`hooks/mod.rs:42`) → `engine.rs:23-27`이 무출력을 idle로만 판정. `WaitingInput`은 훅에서만 나옴(`engine.rs:16`) |
| S2 | **긴 도구 호출/추론 중(스트리밍 출력 없음)** | 2초 뒤 `Idle` | `Running` | `IDLE_THRESHOLD_MS=2000`(`inputs.rs:38`)만으로 "생각 중"과 "멈춤"을 구분 못 함 |
| S3 | **CLI가 애니메이션 스피너를 돌리다 질문에서 멈춤** | 스피너 동안 `Running` → 멈추면 `Idle` | 멈춘 순간 `Blocked` | `mark_output`(`session.rs:35-40`)은 바이트 종류를 안 봄. 스피너 프레임=활동으로 계수, 멈추면 곧장 idle |
| S4 | **크래시(exit 1)로 죽은 에이전트** | 정상 완료와 **동일한 `Done`(초록)** | `Failed`/에러 구분 | `reduce()`가 `exit_code`를 안 읽음(`engine.rs:7-9`), 폴러는 `exit_code: None` 하드코딩(`poller.rs:48`). 팬아웃 "채택" 흐름에서 크래시 결과를 성공으로 오인 위험 |
| S5 | **다중 터미널 에이전트: 한 탭 완료(done)+다른 탭 대기(idle)** | 에이전트 상태 `Idle`(done이 가려짐) | 완료 알림 필요 | `aggregateStatus` 우선순위 blocked>running>idle>**done**(`derived.ts:25-29`). done이 최하위라 idle에 마스킹됨 |
| S6 | **gjc 세션이 blocked인데 WS 프로브가 잠깐 끊김(>10s)** | 10초 뒤 stale → `Idle`로 강등 | `Blocked` 유지 | `HOOK_STALE_MS=10000`(`inputs.rs:40`) 초과 시 계층②로 폴백. 재접속하면 다시 blocked → **깜빡임(flapping)** |
| S7 | **앱 재시작 후** | 모든 에이전트 `Idle` | 실제 실행 상태 | PTY는 앱과 함께 죽고 상태는 라이브 이벤트로만 채워짐(`sessions.svelte.ts`). DB에 status 없음(`store/models.rs`). 재시작 직후 전부 idle로 보임 |

**S1이 이 제품의 존재 이유를 정면으로 무너뜨린다.** README.ko.md:52-53은 "tmux 뒤에서도 입력 대기를 정확히 알려준다"고 하지만, 그 정확도는 `gjc`에만 해당하고 홍보 대상 에이전트에는 적용되지 않는다. `hooks/gjc.rs:13-15` 주석도 "입력 대기(blocked)는 출력 스트림만으로는 유휴와 구분 불가"라고 스스로 인정한다 — 그런데 그 해결책(계층③)이 대상 에이전트엔 없다.

---

## 3. (b) 오판정의 비용과, 그걸 줄일 UX 장치의 부재

**사용자가 치르는 비용**
- S1/S2(무출력→idle 오판): 사용자는 "대기(Idle)"를 "이 에이전트는 지금 놀고 있음 = 볼 필요 없음"으로 읽고 딴 일로 이동 → 실제로는 CLI가 y/n 답을 기다리며 **영구 정지**. 다중 프로젝트를 오갈수록 놓칠 확률이 상승(이 앱의 주 사용 시나리오와 정면 충돌).
- S4(크래시=완료): 초록 "완료"만 믿고 diff를 채택/머지 → 실패한 산출물을 반영.
- 오판이 반복되면 사용자는 상태 배지 전체를 신뢰하지 않게 되고(경보 피로), 결국 터미널을 일일이 눈으로 확인 — 이 앱의 대시보드 가치가 0이 된다.

**현재 완전히 없는 신뢰 장치(모두 미구현 확인)**
- **마지막 신호 시각**: `StatusChanged`에 타임스탬프 없음(`poller.rs:15-18`). `Agent.lastActivity`는 타입엔 있으나(`types.ts:48-49`) 백엔드가 **한 번도 채우지 않는다**(`store/models.rs:3` 주석, `repo.rs:151 list_projects`에 미설정) → 오버뷰 타일 푸터는 항상 `t("common.waitingActivity")` placeholder만 출력(`OverviewGrid.svelte:149`). "마지막 활동"이라는 UI가 **죽은 텍스트**다.
- **신뢰도/근거 표시**: 어느 계층이 판정했는지(hook/output/process) 프론트에 전달되지 않음. "이 상태는 훅 기반인가 추정인가"를 알 방법 없음.
- **수동 재스캔**: `commands.rs`에 상태 재평가 커맨드 없음(push-only). 사용자가 "지금 다시 확인" 할 수 있는 버튼이 없다.
- **성공/실패 구분**: exit code 미사용(S4).

---

## 4. (c) '주의 필요(attention)' 파이프라인 분석

파이프라인 두 갈래:
1. **인앱 인박스** — `attention/model.ts`. `needsAttention = blocked || done`(`model.ts:4-6`). `attentionItems`가 전 프로젝트를 훑어 blocked 우선 정렬(`model.ts:27-49`). 벨 UI는 `AttentionInbox.svelte`, 클릭 시 `shell.selectAgent`로 인앱 이동(`AttentionInbox.svelte:17-19, 71`).
2. **OS 알림/웹훅** — `attention/notifier.ts`. `status-changed` 구독 → `shouldNotify(prev,next)`가 blocked/done "진입 전이"에서만 true(`notifier.ts:14-17`), 세션별 prev로 시작 스팸/중복 억제(`notifier.ts:44,53-55`).

**반응하는 이벤트가 좁다**: blocked는 gjc에서만 발생하므로(§1) 대상 에이전트의 attention은 사실상 **"done 전용"**이다. 이 앱의 대표 알림("에이전트가 입력을 기다려요", `agentDetail.blockedTitle`)은 gjc 세션에서만 뜬다.

**알림 피로/중복/놓침 처리의 공백**
- **놓치면 끝**: 폴러는 상태 변경 시에만 emit → blocked를 계속 유지하면 재알림/에스컬레이션 없음. 첫 배너를 놓치면 다시 알려주지 않는다.
- **깜빡임 = 중복 알림**: S6처럼 blocked↔idle이 왕복하면 blocked 재진입마다 `shouldNotify`가 다시 true → 같은 대기에 대해 **알림 중복**.
- **버스트 병합 없음**: 팬아웃으로 5개가 동시에 done되면 OS 알림 5연발(`notifier.ts:52-61`은 건별 발송). 묶음(coalesce) 없음.
- **클릭 딥링크 없음(치명적)**: `sendAttentionNotification`은 `sendNotification({title, body})`만 호출(`src/lib/ipc/notify.ts:26`). `onAction`/이벤트 핸들러가 없어 **OS 알림을 클릭해도 해당 에이전트로 이동하지 않는다.** 사용자는 알림을 받고도 수동으로 그 에이전트를 찾아야 한다.
- **지속 미확인(unread) 개념 없음**: 벨 배지는 "현재 blocked/done인 라이브 개수"를 파생할 뿐(`AttentionInbox.svelte:14-15`), 확인/미확인 히스토리가 없다. 상태가 풀리면 항목이 그냥 사라져 "놓친 것"이 남지 않는다. Dock 배지, 카테고리/사운드 설정, 스누즈, 우클릭 미확인 표시 전부 없음.

---

## 5. (d) 여러 에이전트가 동시에 대기할 때 안내 장치

- **정렬만 있고 처리 유도가 없다**: `attentionItems`는 blocked 우선 후 `updatedAt` 내림차순 정렬(`model.ts:45-47`). 그런데 이 `updatedAt`은 **DB의 에이전트 갱신 시각(제목 변경 등)**이지 "언제 blocked가 됐는가"가 아니다(상태 전이 시각을 어디에도 기록하지 않음). 따라서 "가장 오래 기다린 순"이 아니라 사실상 임의 순서.
- **큐/점프/일괄 처리 없음**: "다음 대기로 점프" 단축키, 일괄 응답, 대기열 진행 표시가 없다. 인박스에서 항목을 하나 클릭해 이동하면 인박스는 outside-click으로 닫힌다(`AttentionInbox.svelte:21-23`) → 하나 처리하고 다시 열어야 다음으로 감. 5개 대기 처리 시 마찰이 5배.

---

## 6. (e) 프롬프트 자동 주입(INJECT_IDLE_MS=900ms) 실패 가시성

구현: `src/lib/terminal/pool.ts:15, 206-239`. 출력이 900ms 잦아들면 시드 프롬프트를 1회 전송, 성공 시 `markInjected`.

**실패 모드와 가시성**
- **타이밍 오발화**: 타이머는 출력마다 리셋(`pool.ts:209`). CLI가 배너/로고를 뿌린 뒤 프롬프트 입력란이 준비되기 전에 900ms 정적이 생기면, **아직 입력 못 받는 시점에 프롬프트가 주입되어 유실/깨짐**. backlog.md:30도 "일부 TUI에서 타이밍이 어긋난다"고 인정.
- **의미적 실패가 비가시**: 성공 판정 기준이 `writeToPty` 성공(`pool.ts:225-232`)뿐이다. PTY에 바이트가 들어간 것과 CLI가 실제로 그 프롬프트를 소비한 것은 다르다. writeToPty가 성공하면 곧장 `markInjected` → 사용자는 "보냈다"고 믿지만 CLI는 무시했을 수 있다. **주입 성공/실패를 알려주는 UI 지표가 없다**(터미널 탭·에이전트 어디에도 armed/injected/failed 표식 없음).
- **표면화되는 유일한 실패**: IPC 레벨 예외만 `actionErrors`(범용 토스트)로 뜬다(`pool.ts:234-236`). "언제·왜" 실패인지 특정 불가.

---

## 7. (f) 폴링 비용·반응성 균형

- **고정 4Hz, 무조건**: `poller.rs:24-25` 250ms 루프. 앱 포커스 여부·활성 세션 여부와 **무관하게 항상** 돈다.
- **세션당 시스템콜 2종/틱**: 각 세션마다 `is_alive()`(child mutex 락 + `try_wait`=waitpid, `session.rs:48-53`)와 `read_hook()`(파일 `metadata` stat, `session.rs:59`)을 매 틱 수행(`poller.rs:42-44`).
- **브리프 시나리오(프로젝트 10 × 에이전트 5 = 50세션)**: 초당 200 waitpid + 200 stat + pump 스레드와 child mutex 경합이 **백그라운드에서도 지속**. 배터리/CPU에 불리하고 적응형 백오프가 없다.
- **아이러니**: pump 스레드는 EOF를 즉시 감지하지만(`manager.rs:107`) done 신호를 직접 쏘지 않아, 종료 반영이 최대 250ms 지연된다. 이미 있는 출력 이벤트(`sessions...noteOutput`)를 신호원으로 쓰면 waitpid 폴링을 크게 줄일 수 있는데 활용 안 함.

---

## 8. 경쟁 제품의 상태·알림 UX 비교

출처: Orca 공식 문서(https://www.onorca.dev/docs/notifications , https://www.onorca.dev/docs , https://www.onorca.dev/), Superset(https://superset.sh/ , https://docs.superset.sh/llms.txt).

| 항목 | Orca | Superset | 본 앱 (근거) |
| --- | --- | --- | --- |
| 상태 신호원 | "터미널이 아니라 에이전트를 실행 → 진짜 완료 vs 일시정지 구분"(에이전트 통합/훅) | 실시간 다중 세션 모니터링 대시보드 | 3계층이나 훅은 `gjc` 전용, 대상 에이전트는 2계층(`hooks/mod.rs:42`) |
| 완료 알림 | working→idle 전이 시 시스템 알림+사운드+worktree 칩 | 대시보드 실시간 표시 | blocked/done 전이 시 OS 알림(`notifier.ts:14-17`) |
| 알림 클릭 → 딥링크 | **클릭 시 해당 worktree·pane로 점프** | IDE 딥링크 지원 | **없음**(`notify.ts:26`, onAction 미사용) |
| 지속 미확인함 | 헤더 벨 전역 unread + **macOS Dock 배지** + 우클릭 미확인 표시 | — | 라이브 파생 카운트뿐, unread 히스토리 없음(`AttentionInbox.svelte:14`) |
| 알림 튜닝 | 카테고리별(시스템/사운드/칩) on-off + **커스텀 사운드** | — | 없음 |
| 입력 대기 감지 | 에이전트 훅 기반 | (문서상 명시적 표기 적음) | gjc만 가능, 대상 에이전트 불가(§2 S1) |
| 세션 지속성 | 세션 복원(Session restore) | **"터미널이 앱 재시작에도 유지"** | PTY가 앱과 함께 소멸(§2 S7) |
| 모바일 알림 | iOS/Android 컴패니언 푸시 | — | 없음 |

**요지**: 이 앱이 "차별화"라 부른 상태 트래킹은, 대상 에이전트 기준으로 보면 Orca/Superset보다 **앞선 게 아니라 뒤처져** 있다. Orca는 에이전트 통합으로 완료/일시정지를 구분하고 알림을 worktree·pane까지 딥링크하며 Dock 배지·미확인함·사운드 튜닝을 갖췄는데, 본 앱은 대상 에이전트에서 blocked 판정 자체가 불가하고 알림은 클릭해도 이동하지 않는다.

---

## 9. 마찰 항목 종합표

| # | 마찰 | 근거(파일:줄) | 심각도 | 사용빈도 | 구현난이도 | 개선안 |
| --- | --- | --- | --- | --- | --- | --- |
| E1 | 계층③ 훅이 `gjc` 전용 → 대상 에이전트 blocked 판정 불가 | `hooks/mod.rs:42`, `engine.rs:16` | 상 | 상 | L | Claude/Codex 훅(Stop/Notification 등)·상태파일 프로브 추가 |
| E2 | 무출력→2초→Idle: "질문 대기"가 idle로 보임 | `engine.rs:23-27`, `inputs.rs:38` | 상 | 상 | M | 프롬프트 패턴 감지 + blocked 후보 상태(`awaiting?`) 추가 |
| E3 | 크래시(exit≠0)와 정상 완료가 동일한 Done | `engine.rs:7-9`, `poller.rs:48` | 상 | 중 | S | exit_code 전달·`Failed` 상태 신설, 색/아이콘 구분 |
| E4 | OS 알림 클릭이 에이전트로 딥링크 안 됨 | `ipc/notify.ts:26` | 상 | 상 | S | notification onAction→`shell.selectAgent` 라우팅 |
| E5 | 상태에 마지막 신호 시각·근거·신뢰도 없음 | `poller.rs:15-18`, `StatusChanged` | 상 | 상 | M | 페이로드에 `ts`,`source(layer)` 추가 + 배지 툴팁 |
| E6 | `lastActivity` UI가 항상 placeholder(죽은 텍스트) | `types.ts:48`, `OverviewGrid.svelte:149`, `repo.rs:151` | 중 | 상 | S | 백엔드가 last_output_ms를 상대시간으로 채움 |
| E7 | done이 aggregate 최하위 → 완료가 idle에 마스킹 | `derived.ts:25-29` | 중 | 중 | S | 우선순위 재설계(done을 idle보다 위로/별도 표기) |
| E8 | 놓친 blocked 재알림·에스컬레이션 없음 | `poller.rs:55-61`, `notifier.ts:14-17` | 중 | 중 | M | 미해결 N분 후 재알림, unread 지속함 |
| E9 | 동시 대기 정렬이 상태전이 시각 아닌 DB updatedAt 기준 | `model.ts:45-47` | 중 | 중 | M | 상태전이 타임스탬프 기록 후 그걸로 정렬 |
| E10 | 동시 대기 처리 큐/점프/일괄 없음, 인박스 즉시 닫힘 | `AttentionInbox.svelte:21-23` | 중 | 중 | M | "다음 대기로" 단축키 + 인박스 sticky |
| E11 | 자동 주입 성공/실패 비가시(의미적 실패 무표시) | `pool.ts:225-236` | 중 | 중 | M | 탭에 주입 상태 표식 + 준비신호 기반 주입 |
| E12 | 깜빡임(hook stale 10s) 시 blocked→idle 강등·중복 알림 | `inputs.rs:40`, `hooks/gjc.rs:36` | 중 | 하 | M | 상태 히스테리시스(강등 전 유예)·알림 디바운스 |
| E13 | 고정 4Hz 폴링, 백그라운드에도 waitpid/stat 반복 | `poller.rs:24-25,42-44` | 중 | 상 | M | 포커스/유휴 시 백오프, EOF 즉시 done emit |
| E14 | 수동 재스캔 수단 없음 | `commands.rs`(상태 커맨드 부재) | 하 | 중 | S | `rescan_status` 커맨드 + 새로고침 버튼 |
| E15 | 버스트 알림 병합 없음(팬아웃 done 5연발) | `notifier.ts:52-61` | 하 | 중 | S | 짧은 창 내 알림 coalesce |

---

## 10. Top 5 즉시 개선 제안 (우선순위 순)

각 항목은 "무엇을·어느 파일을·어떻게"로 구체화한다. 실제 수정은 승인 후 별도 진행(본 문서는 조사만).

### 1위 — 상태 이벤트에 시각·근거를 실어 신뢰를 관측 가능하게 (E5·E6, 난이도 M)
현재 사용자는 "이 초록 점이 맞나"를 검증할 수 없다. 가장 값싸게 신뢰를 회복하는 지점.
- `src-tauri/src/status/inputs.rs`: `AgentStatus`에 판정 근거를 함께 낼 수 있도록 `reduce()`가 `(AgentStatus, StatusSource)`를 반환(`StatusSource = Process|Hook|Output`).
- `src-tauri/src/status/poller.rs:15-18,57-60`: `StatusChanged`에 `ts: u64`(now_ms)와 `source`, `last_output_ms`를 추가해 emit.
- `src/lib/ipc/status.ts:4` · `src/lib/stores/sessions.svelte.ts`: 페이로드 확장 반영, 세션별 `lastSignalAt`·`source` 저장.
- `src/lib/components/shell/StatusBadge.svelte`/`StatusDot.svelte`: 툴팁에 "훅/추정, N초 전 신호" 노출. `OverviewGrid.svelte:149`의 죽은 `lastActivity`를 이 값으로 대체.

### 2위 — 대상 에이전트의 "입력 대기"를 실제로 감지 (E1·E2, 난이도 L→우선 M 부분구현)
차별화 주장을 사실로 만드는 핵심. 완전 훅(L)은 크지만, **출력 기반 프롬프트 감지(M)**로 즉시 체감을 올릴 수 있다.
- 부분구현(우선): `src-tauri/src/status/engine.rs:23-27`에 "무출력 + 마지막 출력 tail이 입력 프롬프트 패턴(`(y/n)`, `?`, `❯` 등)" 조건을 추가해 `Idle` 대신 `Blocked` 후보로 승격. tail 텍스트는 pump에서 소량 유지.
- 정공법: `src-tauri/src/hooks/`에 `claude.rs`/`codex.rs` 프로브 추가하고 `hooks/mod.rs:41-43 probes()`에 등록. Claude Code의 Notification/Stop 훅(설정 주입)이나 Codex 상태 신호를 `status.json`으로 번역(`gjc.rs` 구조 재사용).

### 3위 — OS 알림 딥링크 + 크래시 구분 (E4·E3, 난이도 S)
둘 다 S 난이도인데 사용자 체감이 크다. "받은 알림을 눌러도 못 감", "실패를 완료로 오인"을 즉시 제거.
- E4: `src/lib/ipc/notify.ts:23-30`에서 `@tauri-apps/plugin-notification`의 액션/`onAction` 리스너를 등록하고, 알림 payload에 `agentId`를 실어 클릭 시 `shell.selectAgent(agentId)` 호출. `notifier.ts:56-59`가 meta에 agentId를 함께 전달하도록 `Resolver` 확장.
- E3: `src-tauri/src/status/poller.rs:48`에서 종료 시 실제 exit code를 채우고, `engine.rs:7-9`가 `exit_code != Some(0)`이면 새 상태 `Failed`(또는 `Done{ok:false}`)로 판정. `statusDot.ts`/`statusBadge.ts`/i18n에 실패 색·라벨 추가.

### 4위 — 지속 미확인함 + 놓침/중복 방지 (E8·E15·E10, 난이도 M)
Orca가 벨·Dock 배지·미확인으로 확보한 "walk away & come back" 신뢰를 따라잡는다.
- `src/lib/attention/`에 `inboxStore`(영속 unread) 신설: 상태 전이 이벤트를 항목으로 적재하고 read/unread·타임스탬프 보관. `AttentionInbox.svelte`가 라이브 파생 대신 이 스토어를 렌더, 클릭 이동 후에도 항목 유지(현행 `:21-23` outside-close 완화).
- 미해결 blocked N분 경과 시 재알림(에스컬레이션), 짧은 창 내 동일종류 알림 coalesce(`notifier.ts:52-61`).
- (선택) macOS Dock 배지: unread 수를 tray/badge로.

### 5위 — 적응형 폴링 + 상태 전이 시각 기록 (E13·E9·E12, 난이도 M)
비용을 낮추고, 동시 대기 정렬을 "가장 오래 기다린 순"으로 바로잡는다.
- `src-tauri/src/status/poller.rs:24-25`: 앱 포커스/전 세션 idle일 때 주기를 1~2s로 백오프(윈도우 focus 이벤트 구독). pump의 EOF(`manager.rs:107`)에서 done을 즉시 emit해 폴링 의존 축소.
- 상태 전이 시각을 백엔드/프론트에 기록해 `attention/model.ts:45-47` 정렬을 `enteredBlockedAt` 기준으로 변경(E9). `HOOK_STALE_MS`(`inputs.rs:40`) 폴백 전 짧은 유예(히스테리시스)로 깜빡임 완화(E12).

---

## 부록 — 검증한 방법(재현 가능)

- 상태 리듀서 로직: `src-tauri/src/status/engine.rs:5-28` 및 동봉 테스트 `engine.rs:30-133`(테스트는 gjc 훅 존재를 가정한 케이스만 커버, 비-gjc blocked 부재는 미검증).
- 프로브 등록 단일성: `src-tauri/src/hooks/mod.rs:41-43`(=`vec![Box::new(gjc::GjcProbe)]`).
- 알림 무딥링크: `src/lib/ipc/notify.ts:22-30`(onAction 미사용) + `src/lib/attention/notifier.ts:52-61`.
- lastActivity 미채움: `src/lib/types.ts:48-49` 선언 ↔ `src-tauri/src/store/models.rs:3`·`repo.rs:151`(미설정) ↔ `OverviewGrid.svelte:149`(placeholder).
- 경쟁 제품 사실: Orca Notifications & Inbox 문서(딥링크·Dock 배지·미확인·사운드), Superset 랜딩(지속 터미널·실시간 모니터링) — URL은 §8에 명시.
