# Phase A: 디자인 토큰 · 폰트 · 상태 컴포넌트

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.
> 마스터 계획: `2026-07-22-main-screen-redesign-master.md` — Global Constraints를 반드시 준수.

**Goal:** 프로토타입의 상태색/표면색/diff색을 `app.css` 시맨틱 토큰으로 등록하고, JetBrains Mono를 번들 폰트로 추가하며, StatusDot/StatusBadge를 토큰 기반으로 재구현한다.

**의존:** 없음. **후행:** Phase C/D/E가 이 토큰과 컴포넌트를 소비.

## Global Constraints (마스터에서 상속)

- 컴포넌트에 hex 직접 사용 금지 — 토큰만.
- JetBrains Mono는 번들(Google Fonts 링크 금지).
- 애니메이션은 `prefers-reduced-motion` 시 정지.
- 터미널/에디터는 라이트에서도 다크 배경 고정.
- 커밋: 기능 단위, 한글 메시지, Co-Author 없음, `[ci skip]` 미사용(코드).

---

## 색상 변환 참조 (hex → OKLch)

프로토타입 다크 hex를 OKLch로 변환한 값. `.dark` 세트에 사용한다. 라이트(`:root`)는 같은 hue에서 명도만 낮춘(더 진한) 값으로 가독성 확보.

| 토큰 | 다크 hex | 다크 OKLch | 라이트 OKLch(제안) |
|------|---------|-----------|-------------------|
| `--status-running` | `#34d399` | `oklch(0.77 0.15 163)` | `oklch(0.6 0.14 163)` |
| `--status-running-fg` | `#6ee7b7` | `oklch(0.85 0.13 163)` | `oklch(0.55 0.13 163)` |
| `--status-idle` | `#8b8f98` | `oklch(0.63 0.01 264)` | `oklch(0.55 0.01 264)` |
| `--status-blocked` | `#fbbf24` | `oklch(0.82 0.15 82)` | `oklch(0.7 0.15 70)` |
| `--status-blocked-fg` | `#fcd34d` | `oklch(0.86 0.14 88)` | `oklch(0.6 0.14 70)` |
| `--status-blocked-on` | `#1c1503` | `oklch(0.2 0.02 80)` | `oklch(0.2 0.02 80)` |
| `--status-done` | `#38bdf8` | `oklch(0.75 0.13 233)` | `oklch(0.6 0.14 233)` |
| `--status-done-fg` | `#7dd3fc` | `oklch(0.83 0.1 227)` | `oklch(0.55 0.12 233)` |
| `--diff-add` | `#34d399` | `oklch(0.77 0.15 163)` | `oklch(0.6 0.14 163)` |
| `--diff-remove` | `#f87171` | `oklch(0.7 0.18 22)` | `oklch(0.6 0.2 25)` |
| `--accent-share` | `#a5b4fc` | `oklch(0.77 0.11 277)` | `oklch(0.6 0.15 277)` |
| `--terminal-bg` | `#0b0c0f` | `oklch(0.15 0.008 265)` | `oklch(0.15 0.008 265)`(고정) |
| `--editor-bg` | `#101116` | `oklch(0.17 0.008 275)` | `oklch(0.17 0.008 275)`(고정) |
| `--editor-chrome` | `#15161c` | `oklch(0.2 0.008 275)` | `oklch(0.2 0.008 275)`(고정) |

> OKLch 값은 근사치다. 정확 변환이 아니라 시각적 정합이 목표 — 구현 후 육안 확인으로 미세조정 가능. 라이트 값은 대비(WCAG) 우선.

---

## Task A1: 상태·diff·표면 시맨틱 토큰 등록

**Files:**
- Modify: `src/app.css` (`:root`, `.dark`, `@theme inline` 블록)

**Interfaces:**
- Produces: Tailwind 유틸 `text-status-*`, `bg-status-*`, `text-diff-*`, `bg-diff-*`, `text-accent-share`, `bg-terminal`, `bg-editor`, `bg-editor-chrome`.

- [ ] **Step 1: `:root`(라이트)에 토큰 추가**

`src/app.css`의 `:root { ... }` 블록 끝(`--sidebar-ring` 다음 줄)에 추가:

```css
  /* 상태 시맨틱 토큰 (라이트) */
  --status-running: oklch(0.6 0.14 163);
  --status-running-fg: oklch(0.55 0.13 163);
  --status-idle: oklch(0.55 0.01 264);
  --status-blocked: oklch(0.7 0.15 70);
  --status-blocked-fg: oklch(0.6 0.14 70);
  --status-blocked-on: oklch(0.2 0.02 80);
  --status-done: oklch(0.6 0.14 233);
  --status-done-fg: oklch(0.55 0.12 233);
  --diff-add: oklch(0.6 0.14 163);
  --diff-remove: oklch(0.6 0.2 25);
  --accent-share: oklch(0.6 0.15 277);
  /* 터미널/에디터는 라이트에서도 다크 고정 */
  --terminal-bg: oklch(0.15 0.008 265);
  --editor-bg: oklch(0.17 0.008 275);
  --editor-chrome: oklch(0.2 0.008 275);
```

- [ ] **Step 2: `.dark`에 토큰 추가**

`.dark { ... }` 블록 끝(`--sidebar-ring` 다음 줄)에 추가:

```css
  /* 상태 시맨틱 토큰 (다크) */
  --status-running: oklch(0.77 0.15 163);
  --status-running-fg: oklch(0.85 0.13 163);
  --status-idle: oklch(0.63 0.01 264);
  --status-blocked: oklch(0.82 0.15 82);
  --status-blocked-fg: oklch(0.86 0.14 88);
  --status-blocked-on: oklch(0.2 0.02 80);
  --status-done: oklch(0.75 0.13 233);
  --status-done-fg: oklch(0.83 0.1 227);
  --diff-add: oklch(0.77 0.15 163);
  --diff-remove: oklch(0.7 0.18 22);
  --accent-share: oklch(0.77 0.11 277);
  --terminal-bg: oklch(0.15 0.008 265);
  --editor-bg: oklch(0.17 0.008 275);
  --editor-chrome: oklch(0.2 0.008 275);
```

- [ ] **Step 3: `@theme inline`에 색 노출**

`@theme inline { ... }` 블록 끝(`--color-sidebar-ring` 다음 줄)에 추가:

```css
  --color-status-running: var(--status-running);
  --color-status-running-fg: var(--status-running-fg);
  --color-status-idle: var(--status-idle);
  --color-status-blocked: var(--status-blocked);
  --color-status-blocked-fg: var(--status-blocked-fg);
  --color-status-blocked-on: var(--status-blocked-on);
  --color-status-done: var(--status-done);
  --color-status-done-fg: var(--status-done-fg);
  --color-diff-add: var(--diff-add);
  --color-diff-remove: var(--diff-remove);
  --color-accent-share: var(--accent-share);
  --color-terminal: var(--terminal-bg);
  --color-editor: var(--editor-bg);
  --color-editor-chrome: var(--editor-chrome);
```

- [ ] **Step 4: 빌드로 토큰 유틸 생성 확인**

Run: `mise exec -- pnpm check`
Expected: 타입 에러 0 (CSS는 타입 체크 대상 아니지만 회귀 없음 확인). 이어 `mise exec -- pnpm build`가 성공하면 유틸 클래스가 생성됨.

- [ ] **Step 5: 커밋**

```bash
git add src/app.css
git commit -m "feat: 상태·diff·터미널/에디터 시맨틱 색 토큰 등록"
```

---

## Task A2: JetBrains Mono 번들 폰트 등록

**Files:**
- Modify: `package.json` (의존성)
- Modify: `src/app.css` (import)

**Interfaces:**
- Produces: `font-family: 'JetBrains Mono'`가 오프라인에서 로드됨. 터미널/코드 UI 기본 mono.

- [ ] **Step 1: fontsource 패키지 설치**

Run: `mise exec -- pnpm add @fontsource/jetbrains-mono`
Expected: `package.json` dependencies에 `@fontsource/jetbrains-mono` 추가. (이 패키지는 폰트 파일을 로컬 번들 — Google Fonts 네트워크 요청 없음.)

- [ ] **Step 2: app.css에서 import**

`src/app.css` 최상단, `@import "tailwindcss";` 위에 추가(가중치 400/500/700만):

```css
@import "@fontsource/jetbrains-mono/400.css";
@import "@fontsource/jetbrains-mono/500.css";
@import "@fontsource/jetbrains-mono/700.css";
```

- [ ] **Step 3: 터미널 기본 폰트를 JetBrains Mono로**

`src/lib/stores/terminalSettings.svelte.ts`를 열어 기본 `fontFamily` 값을 확인하고, 기본값이 `"monospace"`이면 `"JetBrains Mono"`로 변경(사용자 설정이 없을 때만 적용되는 기본값). 파일 구조를 먼저 Read로 확인 후, 기본값 상수만 교체한다.

- [ ] **Step 4: 빌드 확인**

Run: `mise exec -- pnpm build`
Expected: 성공. 번들에 woff2 폰트 포함(네트워크 fetch 없음).

- [ ] **Step 5: 커밋**

```bash
git add package.json pnpm-lock.yaml src/app.css src/lib/stores/terminalSettings.svelte.ts
git commit -m "feat: JetBrains Mono 번들 폰트 추가 및 터미널 기본 폰트 지정"
```

---

## Task A3: StatusDot 토큰화 + 애니메이션

**Files:**
- Modify: `src/lib/components/shell/StatusDot.svelte`
- Modify: `src/app.css` (keyframes)
- Test: `src/lib/components/shell/StatusDot.test.ts` (신규)

**Interfaces:**
- Consumes: A1 토큰.
- Produces: `<StatusDot status={AgentStatus} size?={number} showLabel?={boolean} />`. size 기본 8(px). running=pulse, blocked=ring pulse.

- [ ] **Step 1: keyframes를 app.css에 추가**

`src/app.css` `@layer base` 앞에 추가:

```css
@keyframes status-dot-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
@keyframes status-ring-pulse {
  0% { box-shadow: 0 0 0 0 color-mix(in oklch, var(--status-blocked) 35%, transparent); }
  70% { box-shadow: 0 0 0 7px color-mix(in oklch, var(--status-blocked) 0%, transparent); }
  100% { box-shadow: 0 0 0 0 color-mix(in oklch, var(--status-blocked) 0%, transparent); }
}
@media (prefers-reduced-motion: reduce) {
  .status-dot-anim { animation: none !important; }
}
```

- [ ] **Step 2: 실패 테스트 작성**

`src/lib/components/shell/StatusDot.test.ts` 생성. (프로젝트는 vitest+jsdom 사용 — 기존 `*.svelte.test.ts` 패턴 참고. Svelte 컴포넌트 렌더 테스트가 설정돼 있지 않다면, 대신 순수 로직 함수를 분리해 테스트한다.)

먼저 색/애니메이션 클래스를 결정하는 순수 함수 `dotClasses(status)`를 컴포넌트에서 분리할 수 있게 설계한다. 테스트:

```ts
import { describe, it, expect } from "vitest";
import { dotClasses } from "./statusDot";

describe("dotClasses", () => {
  it("running은 running 배경과 펄스 애니메이션 클래스를 준다", () => {
    const c = dotClasses("running");
    expect(c).toContain("bg-status-running");
    expect(c).toContain("status-dot-anim");
  });
  it("blocked는 blocked 배경과 링 펄스 클래스를 준다", () => {
    const c = dotClasses("blocked");
    expect(c).toContain("bg-status-blocked");
    expect(c).toContain("status-ring-anim");
  });
  it("idle은 애니메이션 클래스가 없다", () => {
    expect(dotClasses("idle")).not.toContain("status-dot-anim");
  });
  it("done은 done 배경", () => {
    expect(dotClasses("done")).toContain("bg-status-done");
  });
});
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `mise exec -- pnpm test -- StatusDot`
Expected: FAIL — `./statusDot` 모듈 없음.

- [ ] **Step 4: 순수 함수 구현**

`src/lib/components/shell/statusDot.ts` 생성:

```ts
import type { AgentStatus } from "$lib/types";

/** 상태별 점 색/애니메이션 클래스. running=pulse, blocked=ring pulse. */
export function dotClasses(status: AgentStatus): string {
  const bg: Record<AgentStatus, string> = {
    running: "bg-status-running",
    idle: "bg-status-idle",
    blocked: "bg-status-blocked",
    done: "bg-status-done",
  };
  const anim: Record<AgentStatus, string> = {
    running: "status-dot-anim animate-[status-dot-pulse_1.6s_ease-in-out_infinite]",
    idle: "",
    blocked: "status-ring-anim animate-[status-ring-pulse_1.8s_ease-out_infinite]",
    done: "",
  };
  return `${bg[status]} ${anim[status]}`.trim();
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `mise exec -- pnpm test -- StatusDot`
Expected: PASS (4 tests).

- [ ] **Step 6: StatusDot.svelte 재구현**

`src/lib/components/shell/StatusDot.svelte`를 교체:

```svelte
<script lang="ts">
  import type { AgentStatus } from "$lib/types";
  import { statusLabels } from "$lib/data/labels";
  import { dotClasses } from "./statusDot";

  interface Props {
    status: AgentStatus;
    size?: number;
    showLabel?: boolean;
  }

  let { status, size = 8, showLabel = false }: Props = $props();
</script>

<span class="inline-flex items-center gap-1.5">
  <span
    class="shrink-0 rounded-full {dotClasses(status)}"
    style="width:{size}px;height:{size}px"
  ></span>
  {#if showLabel}
    <span class="text-xs text-muted-foreground">{statusLabels[status]}</span>
  {/if}
</span>
```

- [ ] **Step 7: 회귀 확인 (기존 사용처)**

Run: `mise exec -- pnpm check`
Expected: 타입 에러 0. StatusDot을 쓰는 Sidebar/MainPanel이 새 props(size 옵션)와 호환되는지 확인(status prop 시그니처 불변이므로 OK).

- [ ] **Step 8: 커밋**

```bash
git add src/app.css src/lib/components/shell/StatusDot.svelte src/lib/components/shell/statusDot.ts src/lib/components/shell/StatusDot.test.ts
git commit -m "feat: StatusDot 상태 토큰화 및 running/blocked 애니메이션(reduced-motion 대응)"
```

---

## Task A4: StatusBadge 신규 (상태 pill)

**Files:**
- Create: `src/lib/components/shell/StatusBadge.svelte`
- Create: `src/lib/components/shell/statusBadge.ts`
- Test: `src/lib/components/shell/StatusBadge.test.ts`

**Interfaces:**
- Consumes: A1 토큰.
- Produces: `<StatusBadge status={AgentStatus} />` — 틴트 pill. **blocked만 솔리드**(`bg-status-blocked text-status-blocked-on`), 나머지는 틴트(`text-status-*-fg bg-status-*/11%`).

- [ ] **Step 1: 실패 테스트 작성**

`src/lib/components/shell/StatusBadge.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { badgeClasses } from "./statusBadge";

describe("badgeClasses", () => {
  it("blocked는 솔리드(배경 solid + on 텍스트)", () => {
    const c = badgeClasses("blocked");
    expect(c).toContain("bg-status-blocked");
    expect(c).toContain("text-status-blocked-on");
  });
  it("running은 틴트(fg 텍스트)", () => {
    const c = badgeClasses("running");
    expect(c).toContain("text-status-running-fg");
    expect(c).not.toContain("text-status-blocked-on");
  });
  it("done은 done fg 텍스트", () => {
    expect(badgeClasses("done")).toContain("text-status-done-fg");
  });
  it("idle은 idle 계열", () => {
    expect(badgeClasses("idle")).toContain("status-idle");
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `mise exec -- pnpm test -- StatusBadge`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 순수 함수 구현**

`src/lib/components/shell/statusBadge.ts`:

```ts
import type { AgentStatus } from "$lib/types";

/** 상태 pill 클래스. blocked만 솔리드 강조, 나머지는 틴트. */
export function badgeClasses(status: AgentStatus): string {
  const base = "inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-semibold";
  if (status === "blocked") {
    return `${base} bg-status-blocked text-status-blocked-on font-bold`;
  }
  const tint: Record<Exclude<AgentStatus, "blocked">, string> = {
    running: "text-status-running-fg bg-status-running/10",
    idle: "text-status-idle bg-status-idle/10",
    done: "text-status-done-fg bg-status-done/10",
  };
  return `${base} ${tint[status]}`;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `mise exec -- pnpm test -- StatusBadge`
Expected: PASS (4 tests).

- [ ] **Step 5: StatusBadge.svelte 구현**

```svelte
<script lang="ts">
  import type { AgentStatus } from "$lib/types";
  import { statusLabels } from "$lib/data/labels";
  import { badgeClasses } from "./statusBadge";

  let { status }: { status: AgentStatus } = $props();
</script>

<span class={badgeClasses(status)}>{statusLabels[status]}</span>
```

- [ ] **Step 6: 커밋**

```bash
git add src/lib/components/shell/StatusBadge.svelte src/lib/components/shell/statusBadge.ts src/lib/components/shell/StatusBadge.test.ts
git commit -m "feat: StatusBadge 컴포넌트 추가(blocked 솔리드 강조)"
```

---

## Phase A 완료 기준

- [ ] `mise exec -- pnpm test` 전체 통과
- [ ] `mise exec -- pnpm check` 타입 에러 0
- [ ] `mise exec -- pnpm build` 성공(폰트 번들 포함)
- [ ] StatusDot/StatusBadge가 토큰만 사용(hex 없음)
- [ ] `code-reviewer`로 리뷰 레인 실행(자기 승인 금지)
