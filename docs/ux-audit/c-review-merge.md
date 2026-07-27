# Lane C — 리뷰·머지·정리 워크플로 감사

> 작성: worker-3 · 조사 방식: 리포지토리 코드 정독 + Orca/Superset 공개 포지셔닝(프로젝트 문서 기준) 대조(읽기 전용)
> 이 문서는 제품 소스를 수정하지 않는다. 모든 지적에는 `파일:줄` 또는 함수/상수명 근거를 붙였다.
> 근거 커밋: `cd8bc81`(00-context 스냅샷과 동일). 조사 파일은 이 커밋 기준.

---

## 0. 한 줄 판정

**에이전트가 일을 끝낸 뒤의 "검토 → 반영 → 정리" 구간은, 기능 버튼은 다 있으나 *실제 판단에 필요한 정보를 사용자에게 주지 않는* 뷰어와, *부분 선택을 허용하지 않는* 올-오어-나싱 조작으로 이루어져 있다.** diff는 읽기 전용 인라인 단일 컬럼이라 사이드바이사이드·워드 단위·문법 하이라이트·헝크 구분이 전부 없고(더 나은 헝크 파서 `src/lib/diff/parse.ts`는 작성만 해놓고 어디서도 import하지 않는 죽은 코드다), 커밋은 항상 `git add -A` 전체 커밋뿐이라 "이 파일만 승인"이 불가능하며, "이 파일만 버리기"는 UI에 아예 없다. 롤백은 미추적 파일을 놓치고, 로컬 병합의 거부 조건은 클릭 후에야 에러로 통보되며, 병렬 worktree 간 충돌은 머지 시점까지 숨겨진다. gh 미인증은 "PR 없음"으로 오안내되고, 작업 종료 후 브랜치와 체크포인트 ref는 청소되지 않고 쌓인다. **경쟁 도구(Orca 인앱 PR 리뷰/승인, Superset의 IDE 통합 diff)가 "성숙한 리뷰 도구"를 전제로 삼는 자리에, 이 앱은 최소 뷰어 + 전체 커밋 버튼을 놓았다.**

---

## 1. 리뷰/머지/정리 워크플로 구현 지도

| 구간 | 진입점(UI) | 프론트 | 백엔드 | 실제 동작 |
| --- | --- | --- | --- | --- |
| 파일 목록 | 우패널(`rightPanelOpen`) `FilePanel` | `FilePanel.svelte`, `files/viewModel.ts` | `list_worktree_files`→`git::list_files`(`git/mod.rs:207`) | 추적 파일 **전체** + 변경 파일 트리. 기본 전부 접힘 |
| 파일/헝크 뷰어 | 파일 클릭 → 에디터 탭 `FileViewer` | `FileViewer.svelte` | `git_file_diff`→`file_diff_lines`(`git/mod.rs:398`), `read_worktree_file`→`files::read_file` | 인라인 diff 단일 컬럼, 읽기 전용 |
| 승인(커밋) | `ReviewActions` textarea+Commit | `ReviewActions.svelte:36-54` | `git_commit_all`→`commit_all`(`git/mod.rs:492`) | `git add -A` 후 커밋. **전체 커밋** |
| 푸시/PR | `ReviewActions` Push·PR 버튼 | `ReviewActions.svelte:56-87` | `git_push`, `git_open_pull_request`(`git/mod.rs:699`) | 푸시 후 PR 생성(gh) 또는 compare 폴백 |
| 로컬 병합 | `ReviewActions` "기준 브랜치로 병합" | `ReviewActions.svelte:93-131` | `git_merge_preview`/`git_merge_into_base`(`git/mod.rs:888`,`910`) | preview→confirm 2단. `merge-tree` 기반 |
| 인앱 PR 리뷰 | 툴바 `PrPanel` 팝오버 | `PrPanel.svelte` | `git_pr_status`/`git_pr_merge`(`git/mod.rs:645`,`684`) | 기존 PR 상태·체크 조회, Squash/Merge/Rebase |
| 체크포인트 | 툴바 `Checkpoints` 팝오버 | `Checkpoints.svelte` | `create/rollback/list/delete_checkpoint`(`commands.rs:331~418`) | `git stash create` 스냅샷·복원 |
| 타임라인 | 툴바 `Timeline` 팝오버 | `Timeline.svelte` | `list_events`(로컬 이벤트 로그) | 커밋/푸시/PR/검증/체크포인트/롤백 감사 로그 |
| 팬아웃 비교/채택 | `CompareDialog` | `CompareDialog.svelte`, `fanout/ranking.ts` | `list_worktree_files`, `run_verification` | 변경 규모·검증 결과로 승자 추천, 채택=나머지 삭제 |
| 정리 | 에이전트 삭제 | `projects.removeAgent`→`delete_agent`(`commands.rs:969`) | `git::remove_worktree`(`git/mod.rs:68`) | worktree만 제거. **브랜치/체크포인트 ref 미정리** |

이 구간의 진입 자체가 눈에 안 띈다: 리뷰 패널은 `AgentDetail` 우측(`MainPanel.svelte:15-16`)에 있고 체크포인트·타임라인·PR은 헤더 툴바의 알약 버튼 3개(`AgentDetail.svelte:107-109`)로 흩어져 있다. "지금 변경을 검토·반영·정리한다"는 하나의 흐름이 4곳(우패널·에디터 탭·툴바 팝오버·비교 다이얼로그)에 분산돼 있다.

---

## 2. (a) diff 뷰어의 품질

`FileViewer.svelte`가 유일한 diff/파일 뷰어다. 렌더 경로는 두 갈래로, `diff.length > 0`이면 diff 표(`FileViewer.svelte:70-81`), 아니면 원본 소스 표(`:82-93`)를 그린다.

| 항목 | 상태 | 코드 근거 |
| --- | --- | --- |
| 사이드바이사이드(split) | **없음** — old/new 줄번호 2컬럼 + 텍스트 1컬럼의 인라인 단일 뷰뿐 | `FileViewer.svelte:71-81` `<table>` 3 `<td>` |
| 워드 단위(intra-line) 하이라이트 | **없음** — 줄 전체를 add/del 색으로 칠함 | `rowClass`(`FileViewer.svelte:39-43`), 셀 렌더 `:74-77` |
| 문법 하이라이팅 | **없음** — `{line.text}` 평문 그대로 | `FileViewer.svelte:77`,`:88` |
| 헝크 구분/컨텍스트 접기 | **없음** — `@@` 헤더를 버리고 모든 헝크를 연속 라인으로 평탄화. 줄번호는 점프하나 구분자·"N줄 생략" 없음 | `parse_unified_diff`가 `@@`를 카운터 리셋에만 쓰고 버림(`git/mod.rs:336-340`), 헤더류 스킵(`:341-348`) |
| 대용량 파일 | **위험** — 파일 전체를 메모리로 읽고, 전 줄을 DOM `<tr>`로 렌더. 크기 상한·절단·가상화 없음 | `read_file`의 `std::fs::read`(`files/mod.rs:41`), FileViewer `{#each lines}`/`{#each diff}` 무가상화(`:73`,`:85`) |
| 바이너리 | 첫 8000바이트 NUL 스캔으로 판정 → "미리 볼 수 없습니다" placeholder | `files/mod.rs:41-46`, `fileViewer.binary`(`:68-69`) |
| 이미지 | **미리보기 전혀 없음** — 이미지는 바이너리로만 처리, 렌더링 분기 자체가 없음 | 위와 동일. `<img>`/이미지 경로 없음 |
| 파일 트리 탐색 | 트리는 있으나 기본 전부 접힘, 검색/필터/"변경만 보기" 없음 | `FilePanel.svelte:27`(빈 expanded), 검색 UI 부재. `list_files`가 변경 없는 추적 파일도 전부 포함(`git/mod.rs:223-225`) |
| 스테이징 단위 선택 | **불가** — 파일별/헝크별/줄별 스테이징 없음 | 뷰어 readonly(`fileViewer.readonly`), 커밋은 `git add -A`(`commit_all` `git/mod.rs:500`) |

**핵심 결함 — 죽은 diff 파서:** `src/lib/diff/parse.ts`에는 `DiffFile → DiffHunk → DiffLine` 구조를 보존하는 완전한 unified diff 파서 `parseDiff()`(`diff/parse.ts:62`)가 존재한다. 헝크 헤더·경계·바이너리 플래그·추가/삭제 카운트까지 파싱한다. 그런데 이 모듈은 `src` 어디에서도 import되지 않는다(전역 grep 결과 self 참조뿐, 테스트도 없음). 실제 뷰어는 Rust 쪽 평탄화 파서(`file_diff_lines`)의 결과만 쓴다. **더 나은 diff 표현을 위한 코드를 이미 작성해놓고 배선하지 않은 상태** — 헝크 구분·컨텍스트 접기·워드 diff의 토대가 죽어 있다.

바이너리 수정 파일의 함정: `git diff HEAD`가 "Binary files … differ" 한 줄만 내면 `parse_unified_diff`는 `+`/`-`/공백 프리픽스가 없어 전부 스킵 → **빈 diff**를 반환한다. 사용자는 "수정됨" 배지만 보고 무엇이 바뀌었는지 알 수 없다.

---

## 3. (b) '이 변경 승인/되돌리기'까지 몇 단계인가

리뷰 UI는 **개별 변경 단위 승인/되돌리기라는 개념이 없다.** 오직 worktree 전체 단위 조작만 있다.

| 의도 | 실제 조작 경로 | 단계 | 마찰 |
| --- | --- | --- | --- |
| 이 변경(들)을 승인 = 커밋 | 우패널 → textarea에 메시지 입력(필수) → Commit | 3+ | 메시지 없으면 버튼 disabled(`canCommit`이 메시지 빈 문자열 거부, `review/model.ts:17-19`). 승인 = 항상 커밋 메시지 타이핑 강제 |
| 파일 A만 승인, B는 보류 | **불가능** | — | `commit_all`이 `git add -A` 전체 커밋(`git/mod.rs:500`). 부분 스테이징 없음 |
| 방금 만든 이 파일 하나 버리기 | **UI에 없음** — git 터미널로 직접 | ∞ | 파일 컨텍스트 메뉴는 open/reveal/copy-path뿐(`filePanelContextActions.ts` `fileContextActions`) |
| 전체 되돌리기 | 사전에 체크포인트 저장 → Checkpoints 팝오버 → Undo 아이콘 → "되돌리기 확인" | 2단 확인 + 사전 준비 | 되돌리기 전 체크포인트를 미리 만들어놨어야 함. 안 만들었으면 되돌릴 대상 없음 |

즉 "에이전트 결과를 훑어보고 마음에 드는 파일만 반영, 나머지는 버린다"는 리뷰의 가장 기본 동작이 이 앱 UI만으로는 성립하지 않는다. 승인은 전부-커밋, 폐기는 터미널행이다.

---

## 4. (c) 체크포인트/롤백이 미추적 파일을 놓치는 문제의 실제 UX 영향

스냅샷은 `git stash create`(`snapshot_worktree` `git/mod.rs:773`), 복원은 `git restore --source <sha> --staged --worktree -- .`(`restore_snapshot` `git/mod.rs:796`)다. 둘 다 **추적 파일 변경만** 대상이다(백로그에서도 확인 `backlog.md:21`).

실제 시나리오와 결과:

- **S1 — 새 파일만 만든 에이전트:** 에이전트가 `src/new-a.ts`, `src/new-b.ts` 등 미추적 새 파일만 생성 → 사용자가 "지금 저장"(체크포인트) 클릭 → `stash create`가 추적 변경이 없으니 빈 sha 반환 → `create_checkpoint`가 **"저장할 변경이 없습니다"** 에러(`commands.rs:344`). **새 파일이 잔뜩인데도 "변경 없음"으로 거부** → 체크포인트조차 못 만든다.
- **S2 — 되돌렸는데 파일이 남음:** 추적 파일 수정 + 새 파일 5개 생성 상태에서 체크포인트 저장(추적 변경만 담김) → 결과가 이상해 롤백 → 추적 파일은 되돌아가지만 **새 파일 5개는 그대로 남는다**. "되돌렸는데 왜 안 사라지지?"라는 혼란. 롤백이 부분적이라는 사실은 팝오버 하단 note(`되돌리기는 추적 파일의 변경만 스냅샷 시점으로 복원합니다`, `checkpoints.note`)로만 고지 — 대부분 사용자는 이 미묘한 문장을 안 읽는다.
- **S3 — "롤백 전 자동" 체크포인트도 같은 구멍:** 롤백 직전 자동 스냅샷(`commands.rs:381-401`)도 `stash create` 기반이라 미추적 파일을 담지 않는다. 즉 "롤백을 취소(undo)"해도 원래 있던 새 파일 상태는 완전 복구되지 않는다.

에이전트(특히 스캐폴딩/신규 파일 생성 작업)에서 미추적 새 파일은 흔하다. 그런데 이 앱의 안전망(체크포인트/롤백)이 바로 그 케이스에서 조용히 무력화된다 — "안전하게 되돌릴 수 있다"는 신뢰가 깨진다.

---

## 5. (d) 로컬 병합 거부 조건의 사용자 대면 설명

`merge_preview`는 `base`, `branch`, `conflicts`, `already_merged`, **`base_checked_out`**(base 브랜치가 다른 worktree에 체크아웃돼 있는지) 5개 필드를 반환한다(`git/mod.rs:868-877`, `MergePreview`). 그런데 **`ReviewActions`는 `base_checked_out`을 전혀 사용하지 않는다.** `previewMerge`는 `alreadyMerged` → `conflicts` → else(pendingMerge)의 3분기만 처리한다(`ReviewActions.svelte:100-107`).

결과:

- 미리보기 단계에서 "기준 브랜치가 다른 worktree에서 열려 있어 병합이 막힐 수 있다"를 **사전 경고하지 않는다.** 사용자는 "기준 브랜치로 병합" 버튼을 눌러 `confirmMerge`를 실행한 **뒤에야** 백엔드 에러 `기준 브랜치 worktree에 커밋 안 된 변경이 있어 병합할 수 없습니다`(`git/mod.rs:927`)를 본다.
- 이 에러는 **어느 worktree가 문제인지, 어떻게 풀지**(그 worktree를 commit/stash 하라)를 안 알려준다. 사용자는 "어디의 무슨 변경?"을 스스로 추적해야 한다.
- 반대로 base가 다른 worktree에 있으나 clean이면, 병합이 **그 worktree에서 조용히 실행**되어(`run_git(&base_path, ["merge","--no-ff",...])` `git/mod.rs:929`) 사용자가 보고 있지 않은 worktree의 HEAD가 전진한다. 이 부수효과에 대한 UI 안내가 전혀 없다.
- 체크아웃된 worktree가 없으면 `merge-tree`+`commit-tree`+`update-ref`로 워킹트리 없이 base ref를 갱신한다(`git/mod.rs:931-941`). 이 역시 "체크아웃 없이 base 브랜치를 직접 옮겼다"는 사실을 성공 메시지 한 줄(`{base} 브랜치에 병합했습니다`)로만 처리한다.

요약: 거부 조건을 계산할 데이터(`base_checked_out`)는 이미 프론트까지 왔는데, 화면이 그걸 쓰지 않아 "사후 에러"로 전락했다. 프리뷰의 존재 이유(사전 안내)가 절반만 구현됐다.

---

## 6. (e) 병렬 worktree 간 충돌 사전 감지 부재의 비용

`merge_tree_conflicts`(`git/mod.rs:879`)는 오직 **내 브랜치 vs base**의 충돌만 계산한다. **형제 에이전트(다른 worktree/브랜치)끼리 같은 파일을 건드리는지 감지하는 코드는 없다**(백로그 확인 `backlog.md:20` "병렬 worktree 충돌 사전 감지는 후속").

`CompareDialog`(팬아웃 비교/채택)조차 이걸 안 본다 — 멤버별 변경 규모(`fileTotals`)와 검증 결과(`runVerification`)만 나란히 보여주고(`CompareDialog.svelte:72-87`,`52-70`), **어떤 두 멤버가 같은 파일을 수정해 서로 충돌하는지는 표시하지 않는다.** 승자 추천(`recommendWinner`)도 변경 최소·검증 통과·소요시간만 본다(`CompareDialog.svelte:40-50`).

비용 시나리오: 3개 에이전트가 병렬로 같은 모듈을 수정 → 각자 로컬에선 성공, 검증도 통과 → 사용자는 "다 잘됐네" → 첫 번째 머지 OK → 두 번째부터 충돌 폭발 → **뒤늦게 수동 충돌 해결**. 이 앱이 내세우는 핵심 가치가 "병렬 격리 작업으로 충돌 없이"인데, 정작 병렬 작업 사이의 충돌을 **머지 순간까지 숨긴다.** 병렬성이 클수록(이 앱의 주 사용 시나리오) 이 비용이 커진다.

---

## 7. (f) gh 미설치/미인증 시 PR 기능의 실패 UX

`gh_available()`은 `gh --version` 성공 여부(=설치 여부)만 본다. **인증 여부는 확인하지 않는다**(`git/mod.rs:570-576`).

| 상황 | 실제 동작 | 코드 근거 | 문제 |
| --- | --- | --- | --- |
| gh 미설치 + PR 조회 | Err "gh CLI가 설치되어 있지 않습니다." → 팝오버 에러 표시 | `pr_status` `git/mod.rs:646-648` | 그나마 명확. 다만 설치/인증 방법 링크·안내 없음 |
| **gh 설치 + 미인증 + PR 조회** | `gh pr view` 실패 → `Ok(None)` 반환 → **"이 브랜치의 PR이 없습니다"**(`prPanel.none`) 표시 | `pr_status` `git/mod.rs:658-660`, `PrPanel.svelte:104-105` | **인증 문제를 "PR 없음"으로 오안내.** 사용자는 왜 안 되는지 영영 모름 |
| gh 설치 + 미인증 + PR 생성 | `gh pr create` 실패 → compare 페이지로 **조용히 폴백**(mode="compare") | `open_pull_request` `git/mod.rs:720-734` | PR 만들려 눌렀는데 브라우저 compare 페이지가 뜸, 이유 설명 없음 |
| gh 미설치 + PR 생성 버튼 | compare 폴백(원격 있으면) | `open_pull_request` `git/mod.rs:740-746` | 정상 동작이나 "왜 gh가 아닌지" 안내 없음 |

추가 혼란: **PR 진입점이 두 개**다. `ReviewActions`의 "PR" 버튼(`ReviewActions.svelte:179-187`, PR 생성/compare)과 `AgentDetail` 툴바의 "PR" 팝오버(`AgentDetail.svelte:109`, 기존 PR 조회/머지)가 같은 라벨 "PR"을 쓴다. 하나는 만들고 하나는 본다 — 사용자가 어느 것이 무엇인지 알 방법이 없다.

`pr_merge`는 `--delete-branch=false`(`git/mod.rs:693`)로 병합해 원격 브랜치도 남긴다(정리 항목과 연결).

---

## 8. (g) 작업 종료 후 worktree/브랜치 정리(가비지) 흐름

`delete_agent`(`commands.rs:969-1004`)의 정리 범위:

- **worktree:** 마지막 관리 참조일 때만 `git worktree remove`(`should_remove_worktree` `commands.rs:1006`, `git/mod.rs:68`). 공유 worktree면 참조 카운트가 남아 제거 안 함 — 이건 합리적.
- **브랜치: 삭제하지 않는다.** `git worktree remove`는 브랜치를 지우지 않으므로 `feat/...` 브랜치가 저장소에 영구 잔류한다. 수십 개 에이전트를 돌리면 로컬 브랜치가 계속 쌓인다. "머지 완료됐으니 이 브랜치 삭제할까?" 프롬프트도 없다.
- **체크포인트 ref: 정리하지 않는다.** 체크포인트는 `refs/worklane/checkpoints/<id>`로 앵커링돼 스냅샷 커밋의 GC를 막는다(`anchor_checkpoint` `git/mod.rs:778-782`). 그런데 `delete_agent`는 `drop_checkpoint_ref`를 호출하지 않는다 — ref 삭제는 **오직 사용자가 체크포인트를 개별 삭제**할 때만 일어난다(`delete_checkpoint` → `commands.rs:416`). 따라서 에이전트를 지워도 그 에이전트가 남긴 앵커 ref들이 살아남아 스냅샷 커밋을 계속 붙잡는다 → 저장소에 dangling snapshot ref 누적, `.git` 비대.
- **원격 브랜치:** `pr_merge`가 `--delete-branch=false`(`git/mod.rs:693`)라 머지 후에도 원격 브랜치 잔류.

즉 "작업이 끝났다"에서 자동으로 청소되는 건 로컬 worktree 디렉터리 하나뿐이고, 브랜치·체크포인트 ref·원격 브랜치는 손대지 않는다. 청소를 위한 UI(브랜치 목록·일괄 정리·머지된 브랜치 표시)도 없다. 장기 사용 시 "쓰고 버리는 격리 작업"이라는 모델과 달리 잔여물이 계속 쌓인다.

---

## 9. Orca / Superset 대비 격차

프로젝트 문서(`AGENTS.md`, `README.ko.md`, `00-context.md`)에 기록된 경쟁 도구 포지셔닝과 대조한다.

| 리뷰/머지 역량 | Worklane(현재) | Orca | Superset |
| --- | --- | --- | --- |
| diff 표현 | 인라인 단일 컬럼, 읽기 전용, split/word/문법 하이라이트 없음 | 앱 내 diff + 내장(편집 가능) 에디터 | VS Code·JetBrains·Xcode **IDE 통합** → IDE의 성숙한 diff(split·헝크 스테이징·inline edit) |
| 부분 승인(헝크/파일 스테이징) | 없음(전체 커밋) | (IDE/에디터 수준 기대) | IDE의 부분 스테이징 그대로 |
| 인앱 PR 리뷰/승인 | 조회·머지는 됨(gh 의존), 인라인 코멘트·리뷰 승인 없음, 미인증 오안내 | **앱 내 PR 검토/승인** 제공 | GitHub/IDE 흐름 위임 |
| 이미지/바이너리 리뷰 | 이미지 미리보기 없음 | 실시간 브라우저 미리보기 등 리치 뷰 | IDE 위임 |
| 병렬 충돌 사전 감지 | 없음(머지 시점에야) | worktree 격리 + 앱 내 리뷰로 완화 | worktree 격리 |
| 정리(브랜치/ref) | worktree만, 브랜치·ref 잔류 | (IDE/PR 흐름에 위임) | IDE·git 흐름 위임 |

핵심: Orca/Superset은 "리뷰는 성숙한 도구(자체 리뷰 UI 또는 IDE)에서"를 전제로 설계됐다. Worklane은 IDE에 위임하지도(외부 열기 버튼은 있으나 흐름의 중심이 아님), 성숙한 자체 뷰어를 갖추지도 못한 **어중간한 최소 뷰어 + 전체 커밋 버튼**에 머물러 있어, "불편하다"는 체감이 바로 이 구간에서 발생한다.

---

## 10. 마찰 요약표

심각도(High/Med/Low) · 빈도(리뷰/머지를 할 때마다 얼마나 자주) · 난이도(구현 비용).

| # | 마찰 | 근거 | 심각도 | 빈도 | 난이도 |
| --- | --- | --- | --- | --- | --- |
| C-01 | diff가 인라인 단일 컬럼, split 없음 | `FileViewer.svelte:71-81` | High | 항상 | 중 |
| C-02 | 워드 단위·문법 하이라이트 없음(줄 전체 색만) | `FileViewer.svelte:39-43` | Med | 항상 | 중 |
| C-03 | 헝크 구분/컨텍스트 접기 없음(평탄화) | `git/mod.rs:336-348` | Med | 항상 | 중 |
| C-04 | **완전한 헝크 파서가 죽은 코드**(미배선) | `diff/parse.ts:62`(참조 0) | High | — | 저(배선만) |
| C-05 | 대용량 파일 전량 로드 + 무가상화 렌더 | `files/mod.rs:41`, `FileViewer.svelte:73,85` | High | 큰 파일 리뷰 시 | 중 |
| C-06 | 이미지 미리보기 없음(바이너리 취급) | `files/mod.rs:41-46` | Med | 이미지 변경 시 | 중 |
| C-07 | 바이너리 수정이 빈 diff로 표시 | `git/mod.rs:331-348` | Low | 드묾 | 저 |
| C-08 | 파일 트리 기본 전부 접힘·검색/필터 없음 | `FilePanel.svelte:27` | Med | 항상 | 저 |
| C-09 | 부분 스테이징(파일/헝크) 불가, 전체 커밋 | `git/mod.rs:500` | **High** | 항상 | 상 |
| C-10 | 승인에 커밋 메시지 타이핑 강제 | `review/model.ts:17-19` | Med | 항상 | 저 |
| C-11 | 파일별 "변경 버리기" UI 없음 | `filePanelContextActions.ts` | **High** | 자주 | 중 |
| C-12 | 체크포인트/롤백이 미추적 파일 누락 | `git/mod.rs:773,796` | **High** | 신규 파일 작업 시 | 중 |
| C-13 | 미추적만 있으면 체크포인트 생성 거부 | `commands.rs:344` | Med | 신규 파일 작업 시 | 저 |
| C-14 | 병합 거부 조건(`base_checked_out`) 사전 미표시 | `ReviewActions.svelte:100-107` | Med | 병합 시 | 저 |
| C-15 | 병합 실패 에러가 해결법·대상 worktree 미안내 | `git/mod.rs:927` | Med | 병합 실패 시 | 저 |
| C-16 | 병렬 worktree 간 충돌 사전 감지 없음 | `git/mod.rs:879-896`, `backlog.md:20` | **High** | 팬아웃/병렬 시 | 상 |
| C-17 | gh 미인증을 "PR 없음"으로 오안내 | `git/mod.rs:658-660`, `PrPanel.svelte:104` | **High** | 미인증 사용자 | 저 |
| C-18 | PR 생성 실패의 compare 조용한 폴백(이유 미표시) | `git/mod.rs:720-734` | Med | 미인증 사용자 | 저 |
| C-19 | "PR" 진입점 2개 동명 혼란 | `ReviewActions.svelte:186`, `AgentDetail.svelte:109` | Low | 항상 | 저 |
| C-20 | 에이전트 삭제 시 브랜치 미정리(영구 잔류) | `commands.rs:990-994` | Med | 정리 시 | 중 |
| C-21 | 체크포인트 앵커 ref 미정리(GC 방해 누적) | `commands.rs:969-1004`(drop 호출 없음) | Med | 장기 사용 | 중 |
| C-22 | 리뷰 흐름이 4곳에 분산(우패널·탭·툴바·다이얼로그) | `MainPanel.svelte:15`, `AgentDetail.svelte:107-109` | Med | 항상 | 상 |

---

## 11. Top 5 즉시 개선 제안 (파일:줄 + 기대 효과)

> 발굴 전용 과제이므로 아래는 제안이며 코드를 수정하지 않았다. 각 제안은 수정 지점과 정량적 효과를 명시한다.

1. **[C-17/C-18] gh 인증 상태를 구분해 정확히 안내한다 (난이도 저, 효과 큼).**
   `gh_available()`(`git/mod.rs:570`)에 `gh auth status`(또는 `pr view` 실패 stderr 판별)를 더해 "미설치 / 미인증 / 정상" 3상태를 만들고, `pr_status`의 `Ok(None)`(`git/mod.rs:658-660`)이 인증 실패를 삼키지 않도록 별도 에러 종류로 반환. `PrPanel`은 "PR 없음"(`prPanel.none`) 대신 "gh 인증 필요"를 표시하고 `gh auth login` 안내. → 미인증 사용자가 겪는 최악의 "왜 안 되는지 모름"을 제거.

2. **[C-04/C-03/C-02] 죽은 헝크 파서를 배선해 헝크 구분·워드 diff의 토대를 살린다 (난이도 저~중).**
   이미 존재하는 `parseDiff()`(`diff/parse.ts:62`)를 `FileViewer`에 연결해 `@@` 헝크 경계와 "N줄 생략" 컨텍스트 접기를 그린다(현재 `git/mod.rs:336-340`이 헤더를 버려 평탄화). 후속으로 헝크 내 워드 단위 하이라이트. → 이미 작성된 코드를 활용하므로 비용 대비 diff 가독성 즉시 향상.

3. **[C-11/C-09] 파일 단위 "변경 버리기"와 파일 선택 커밋을 추가한다 (난이도 중).**
   `fileContextActions`(`filePanelContextActions.ts`)에 "이 파일 변경 되돌리기"(`git restore -- <path>` / 미추적은 삭제) 액션을 추가하고, `commit_all`의 `git add -A`(`git/mod.rs:500`)를 선택 파일 목록 기반 `git add -- <paths>`로 확장. → 리뷰의 기본 동작("일부만 반영, 나머지 폐기")을 UI만으로 가능하게 만들어 터미널 이탈 제거.

4. **[C-12/C-13] 체크포인트를 미추적 파일까지 포함하도록 확장한다 (난이도 중).**
   `snapshot_worktree`(`git/mod.rs:773`)의 `git stash create`를 미추적 포함 스냅샷(`stash create` 후 미추적 별도 tree 병합, 또는 임시 인덱스 `add -A` + `write-tree` + `commit-tree`)으로 바꾸고 `restore_snapshot`(`:796`)이 미추적 신규 파일도 정리/복원. `create_checkpoint`의 "변경 없음" 거부(`commands.rs:344`)도 미추적만 있어도 통과하도록. → "되돌렸는데 파일이 남는" 신뢰 붕괴 케이스 해소.

5. **[C-14/C-16] 병합 프리뷰를 사전 경고 중심으로 완성한다 (난이도 중, 병렬 감지는 상).**
   먼저 이미 프론트까지 온 `base_checked_out`(`MergePreview`)을 `previewMerge`(`ReviewActions.svelte:100-107`)에서 읽어 "기준 브랜치가 다른 worktree에서 열려 있음/dirty" 경고와 해결법을 확정 클릭 **전에** 표시. 다음 단계로 `merge_tree`(`git/mod.rs:879`)를 형제 worktree 브랜치 쌍에도 돌려 팬아웃 멤버 간 파일 겹침/충돌을 `CompareDialog`에 표기. → 머지 시점까지 숨던 충돌을 검토 시점으로 당김.

---

## 부록 — 조사 커버리지

- 프론트: `ReviewActions.svelte`(227), `FilePanel.svelte`(189), `FileViewer.svelte`(100), `CompareDialog.svelte`(243), `Checkpoints.svelte`(181), `Timeline.svelte`(107), `PrPanel.svelte`(155), `AgentDetail.svelte`·`MainPanel.svelte`(진입), `filePanelContextActions.ts`
- 모델: `review/model.ts`, `files/viewModel.ts`, `diff/parse.ts`(**미사용 확인**)
- IPC: `ipc/files.ts`, `ipc/review.ts`, `ipc/merge.ts`, `ipc/checkpoints.ts`, `ipc/pr.ts`, `ipc/projects.ts`
- 백엔드: `src-tauri/src/git/mod.rs`(1356), `src-tauri/src/files/mod.rs`, `src-tauri/src/commands.rs`(diff/merge/checkpoint/PR/delete_agent 명령)
- 문서: `docs/backlog.md`(항목 20~22 등 미해결 확인), `README.ko.md`, `docs/ux-audit/00-context.md`, `AGENTS.md`
- 검증: `parseDiff`/`DiffFile`/`DiffHunk` 전역 참조 0(자기 파일 제외), `git add -A`·`stash create`·`base_checked_out` 미사용·`delete_agent` 브랜치/ref 미정리를 코드로 대조.
