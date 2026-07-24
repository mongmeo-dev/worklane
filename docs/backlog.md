# 후속 개선 백로그

구현은 완료됐으나 이번 범위에서 미룬 개선 항목을 기록한다. 각 항목은 착수 시 별도 브랜치/PR로 진행한다.

## 설정 화면 Phase 1('화면' 탭) 후속

2026-07-20 설정 '화면' 탭(다크모드·터미널 폰트) 구현 및 최종 리뷰에서 도출된 Minor 항목. 모두 머지 블로커가 아니며 후속 처리 대상으로 판정됨.

- [ ] **테마 select 접근성** — `src/lib/components/settings/ScreenSettings.svelte`의 테마 `Label`과 `Select.Trigger`가 `for`/`id`로 연결돼 있지 않다(shadcn `Select.Trigger`는 네이티브 `<select>`가 아니라 `for` 연결이 제한적). `aria-labelledby` 방식으로 접근성 연결을 개선한다.
- [ ] **`terminalSettings` clamp 로직 DRY** — `src/lib/stores/terminalSettings.svelte.ts`의 `init()`과 `setFontSize()`에 fontSize clamp(8~32) 로직이 중복돼 있다. private helper로 추출한다. (기능상 문제는 없음)
- [ ] **폰트 열거 크로스플랫폼 검증** — `list_system_fonts`(Rust `font-kit`)와 `listFonts()`가 macOS에서만 검증됐다. Windows/Linux는 크로스플랫폼 확장 시점에 동작을 검증한다. (Phase 1은 macOS 우선이라 범위 밖)

## 차별화 기능(팬아웃·검토·태스크 등) 후속

2026-07-24 Orca/Superset 대비 차별화 기능 10종을 구현하며 의도적으로 후속으로 미룬 항목.

- [ ] **라이브 프리뷰 프로덕션 검증** — dev(`http://localhost:1420`)에서는 iframe이 동작하나, 프로덕션(`tauri://`)에서 `http://localhost` iframe이 WKWebView의 mixed-content 정책에 막힐 수 있다. 외부 브라우저 폴백을 제공하되 프로덕션 번들에서 iframe 동작을 검증한다.
- [ ] **에이전트 프롬프트 자동 주입** — 팬아웃/태스크의 프롬프트는 저장·복사·시드까지만 지원한다. 각 CLI 세션이 준비된 시점을 감지해 PTY로 자동 전송하는 기능은 CLI별 타이밍이 불안정해 미룬다.
- [ ] **오케스트레이션 의존성/순차 실행** — 태스크 보드는 계획 + 팬아웃 시드까지다. 태스크 간 의존성(선행 완료 후 자동 시작)은 후속.
- [ ] **로컬 병합·머지 큐** — PR 생성/조회(gh)와 compare 폴백까지 구현. 앱 내 로컬 병합과 병렬 worktree 충돌 사전 감지는 후속.
- [ ] **체크포인트 미추적 파일 포함** — 롤백은 `git stash create` 기반이라 추적 파일 변경만 스냅샷·복원한다. 미추적 파일까지 포함하려면 `-u` 상당 처리가 필요하다.
- [ ] **gh 의존 기능 안내** — GitHub 이슈/PR 기능은 `gh` CLI 설치·인증을 전제한다. 미설치 시 에러 메시지로 안내한다(자동 설치/OAuth 흐름은 범위 밖).
- [ ] **사용량 예산 범위** — 예산 경고는 제공자(계정) 단위 사용량만 대상으로 한다. CLI가 프로젝트별 사용량을 노출하지 않아 프로젝트 단위 집계는 현재 불가.

## 알려진 기술적 함정 (참고)

- **WKWebView Canvas 폰트 측정** — WKWebView의 Canvas `measureText`는 D2Coding 등 일부 폰트 폭을 오측정한다. 터미널은 `@xterm/addon-webgl`(WebGL 렌더러)로 해결했다(커밋 `e963f63`). 향후 Canvas 기반 텍스트 측정을 추가할 때 동일 함정에 주의한다.
