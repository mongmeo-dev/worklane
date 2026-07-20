# 후속 개선 백로그

구현은 완료됐으나 이번 범위에서 미룬 개선 항목을 기록한다. 각 항목은 착수 시 별도 브랜치/PR로 진행한다.

## 설정 화면 Phase 1('화면' 탭) 후속

2026-07-20 설정 '화면' 탭(다크모드·터미널 폰트) 구현 및 최종 리뷰에서 도출된 Minor 항목. 모두 머지 블로커가 아니며 후속 처리 대상으로 판정됨.

- [ ] **테마 select 접근성** — `src/lib/components/settings/ScreenSettings.svelte`의 테마 `Label`과 `Select.Trigger`가 `for`/`id`로 연결돼 있지 않다(shadcn `Select.Trigger`는 네이티브 `<select>`가 아니라 `for` 연결이 제한적). `aria-labelledby` 방식으로 접근성 연결을 개선한다.
- [ ] **`terminalSettings` clamp 로직 DRY** — `src/lib/stores/terminalSettings.svelte.ts`의 `init()`과 `setFontSize()`에 fontSize clamp(8~32) 로직이 중복돼 있다. private helper로 추출한다. (기능상 문제는 없음)
- [ ] **폰트 열거 크로스플랫폼 검증** — `list_system_fonts`(Rust `font-kit`)와 `listFonts()`가 macOS에서만 검증됐다. Windows/Linux는 크로스플랫폼 확장 시점에 동작을 검증한다. (Phase 1은 macOS 우선이라 범위 밖)

## 알려진 기술적 함정 (참고)

- **WKWebView Canvas 폰트 측정** — WKWebView의 Canvas `measureText`는 D2Coding 등 일부 폰트 폭을 오측정한다. 터미널은 `@xterm/addon-webgl`(WebGL 렌더러)로 해결했다(커밋 `e963f63`). 향후 Canvas 기반 텍스트 측정을 추가할 때 동일 함정에 주의한다.
