# 설정 화면 Phase 1 (화면 탭) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 여러 탭으로 구성된 설정 모달을 도입하고, 그 첫 탭인 '화면' 탭에서 다크모드(라이트/다크/시스템)와 터미널 폰트(자유입력+자동완성+크기)를 설정·즉시반영한다.

**Architecture:** 테마·터미널폰트·모달UI를 각각 독립된 Svelte 5 룬 store로 분리한다. 테마는 `<html>.dark` 클래스를 토글해 app.css의 `@custom-variant dark` 규칙과 맞물리고, 터미널 폰트는 store를 `Terminal.svelte`의 `$effect`가 구독해 xterm 옵션에 반영한다. 시스템 폰트 목록은 Rust(`font-kit`)가 열거해 IPC로 전달하고 `<datalist>` 자동완성에 쓴다.

**Tech Stack:** Svelte 5(runes), TypeScript, Tailwind v4, shadcn-svelte(bits-ui), xterm.js, Tauri v2, Rust(font-kit), vitest.

## Global Constraints

- 사고 과정·주석·문서·커밋 메시지는 한국어(코드/고유명사 제외).
- 커밋에 Co-Author 미포함. 기능 단위로 분리 커밋.
- 코드 수정 커밋에는 `[ci skip]`을 붙이지 않는다(문서 전용 커밋에만 허용).
- Rust 명령 실행 시 환경변수 필요하면 `mise exec -- ` 접두.
- localStorage 손상값은 반드시 기본값으로 방어(기존 `App.svelte` clamp 패턴 준용).
- Svelte 5 룬(`$state`/`$derived`/`$effect`) 사용. 기존 `sessions.svelte.ts`의 class 기반 store 패턴을 따른다.
- 테스트는 vitest. 기존 `src/lib/terminal/ime-core.test.ts` 패턴을 따른다.

---

### Task 1: 테마 store

**Files:**
- Create: `src/lib/stores/theme.svelte.ts`
- Test: `src/lib/stores/theme.svelte.test.ts`

**Interfaces:**
- Consumes: 없음.
- Produces:
  - `type ThemeMode = 'light' | 'dark' | 'system'`
  - `export const theme` — 싱글턴. 멤버:
    - `get mode(): ThemeMode`
    - `setMode(mode: ThemeMode): void` — localStorage 저장 + DOM 반영
    - `init(): void` — 저장된 모드 로드 후 DOM 반영 + system 구독 시작(멱등)
  - localStorage 키: `settings:theme-mode`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// src/lib/stores/theme.svelte.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("theme store", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
    vi.resetModules();
  });

  it("setMode('dark')는 <html>에 dark 클래스를 추가하고 저장한다", async () => {
    const { theme } = await import("./theme.svelte");
    theme.setMode("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem("settings:theme-mode")).toBe("dark");
    expect(theme.mode).toBe("dark");
  });

  it("setMode('light')는 dark 클래스를 제거한다", async () => {
    const { theme } = await import("./theme.svelte");
    theme.setMode("dark");
    theme.setMode("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(localStorage.getItem("settings:theme-mode")).toBe("light");
  });

  it("system 모드는 matchMedia 결과를 따른다 (matches=true → dark)", async () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    );
    const { theme } = await import("./theme.svelte");
    theme.setMode("system");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("init은 손상된 저장값을 system으로 폴백한다", async () => {
    localStorage.setItem("settings:theme-mode", "garbage");
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    );
    const { theme } = await import("./theme.svelte");
    theme.init();
    expect(theme.mode).toBe("system");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm test src/lib/stores/theme.svelte.test.ts`
Expected: FAIL — `Cannot find module './theme.svelte'`

- [ ] **Step 3: 최소 구현 작성**

```ts
// src/lib/stores/theme.svelte.ts
export type ThemeMode = "light" | "dark" | "system";

const STORAGE_KEY = "settings:theme-mode";
const MODES: readonly ThemeMode[] = ["light", "dark", "system"];

function isMode(v: unknown): v is ThemeMode {
  return typeof v === "string" && (MODES as readonly string[]).includes(v);
}

/** 테마 모드 store. <html>.dark 클래스를 토글해 app.css의 dark 변형과 연동한다. */
class ThemeStore {
  #mode = $state<ThemeMode>("system");
  #mql: MediaQueryList | null = null;
  #onSystemChange = () => this.#applyDom();

  get mode(): ThemeMode {
    return this.#mode;
  }

  /** system 모드에서 다크 여부를 판정한다. */
  #systemPrefersDark(): boolean {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  }

  /** 현재 모드를 실제 DOM(dark 클래스)에 반영한다. */
  #applyDom(): void {
    const dark =
      this.#mode === "dark" ||
      (this.#mode === "system" && this.#systemPrefersDark());
    document.documentElement.classList.toggle("dark", dark);
  }

  /** system 모드일 때만 OS 테마 변경을 구독한다. */
  #syncSystemSubscription(): void {
    this.#mql?.removeEventListener("change", this.#onSystemChange);
    this.#mql = null;
    if (this.#mode === "system") {
      this.#mql = window.matchMedia("(prefers-color-scheme: dark)");
      this.#mql.addEventListener("change", this.#onSystemChange);
    }
  }

  setMode(mode: ThemeMode): void {
    this.#mode = mode;
    localStorage.setItem(STORAGE_KEY, mode);
    this.#syncSystemSubscription();
    this.#applyDom();
  }

  /** 저장된 모드를 로드해 DOM에 반영한다(부팅 시 1회, FOUC 방지). */
  init(): void {
    const raw = localStorage.getItem(STORAGE_KEY);
    this.#mode = isMode(raw) ? raw : "system";
    this.#syncSystemSubscription();
    this.#applyDom();
  }
}

export const theme = new ThemeStore();
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm test src/lib/stores/theme.svelte.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/stores/theme.svelte.ts src/lib/stores/theme.svelte.test.ts
git commit -m "feat: 라이트/다크/시스템 테마 store 추가"
```

---

### Task 2: 터미널 폰트 설정 store

**Files:**
- Create: `src/lib/stores/terminalSettings.svelte.ts`
- Test: `src/lib/stores/terminalSettings.svelte.test.ts`

**Interfaces:**
- Consumes: 없음.
- Produces:
  - `export const terminalSettings` — 싱글턴. 멤버:
    - `get fontFamily(): string` / `get fontSize(): number`
    - `setFontFamily(v: string): void` — 빈 문자열이면 `"monospace"` 폴백
    - `setFontSize(v: number): void` — 8~32 clamp, NaN이면 무시(이전값 유지)
    - `init(): void` — 저장값 로드
  - localStorage 키: `settings:terminal-font` (JSON `{ fontFamily, fontSize }`)
  - 기본값: `fontFamily = "monospace"`, `fontSize = 13`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// src/lib/stores/terminalSettings.svelte.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("terminalSettings store", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it("기본값은 monospace / 13", async () => {
    const { terminalSettings } = await import("./terminalSettings.svelte");
    expect(terminalSettings.fontFamily).toBe("monospace");
    expect(terminalSettings.fontSize).toBe(13);
  });

  it("setFontSize는 8~32로 clamp한다", async () => {
    const { terminalSettings } = await import("./terminalSettings.svelte");
    terminalSettings.setFontSize(100);
    expect(terminalSettings.fontSize).toBe(32);
    terminalSettings.setFontSize(2);
    expect(terminalSettings.fontSize).toBe(8);
  });

  it("setFontSize(NaN)은 이전값을 유지한다", async () => {
    const { terminalSettings } = await import("./terminalSettings.svelte");
    terminalSettings.setFontSize(20);
    terminalSettings.setFontSize(NaN);
    expect(terminalSettings.fontSize).toBe(20);
  });

  it("빈 fontFamily는 monospace로 폴백한다", async () => {
    const { terminalSettings } = await import("./terminalSettings.svelte");
    terminalSettings.setFontFamily("Menlo");
    terminalSettings.setFontFamily("");
    expect(terminalSettings.fontFamily).toBe("monospace");
  });

  it("init은 저장된 값을 복원한다", async () => {
    localStorage.setItem(
      "settings:terminal-font",
      JSON.stringify({ fontFamily: "JetBrains Mono", fontSize: 16 }),
    );
    const { terminalSettings } = await import("./terminalSettings.svelte");
    terminalSettings.init();
    expect(terminalSettings.fontFamily).toBe("JetBrains Mono");
    expect(terminalSettings.fontSize).toBe(16);
  });

  it("init은 손상된 저장값을 기본값으로 폴백한다", async () => {
    localStorage.setItem("settings:terminal-font", "{{not json");
    const { terminalSettings } = await import("./terminalSettings.svelte");
    terminalSettings.init();
    expect(terminalSettings.fontFamily).toBe("monospace");
    expect(terminalSettings.fontSize).toBe(13);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm test src/lib/stores/terminalSettings.svelte.test.ts`
Expected: FAIL — `Cannot find module './terminalSettings.svelte'`

- [ ] **Step 3: 최소 구현 작성**

```ts
// src/lib/stores/terminalSettings.svelte.ts
const STORAGE_KEY = "settings:terminal-font";
const DEFAULT_FAMILY = "monospace";
const DEFAULT_SIZE = 13;
const MIN_SIZE = 8;
const MAX_SIZE = 32;

/** 터미널 폰트(패밀리/크기) 설정 store. Terminal.svelte가 구독해 xterm에 반영한다. */
class TerminalSettingsStore {
  #fontFamily = $state<string>(DEFAULT_FAMILY);
  #fontSize = $state<number>(DEFAULT_SIZE);

  get fontFamily(): string {
    return this.#fontFamily;
  }
  get fontSize(): number {
    return this.#fontSize;
  }

  #persist(): void {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ fontFamily: this.#fontFamily, fontSize: this.#fontSize }),
    );
  }

  setFontFamily(v: string): void {
    this.#fontFamily = v.trim() === "" ? DEFAULT_FAMILY : v;
    this.#persist();
  }

  setFontSize(v: number): void {
    if (!Number.isFinite(v)) return;
    this.#fontSize = Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.round(v)));
    this.#persist();
  }

  init(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        fontFamily?: unknown;
        fontSize?: unknown;
      };
      if (typeof parsed.fontFamily === "string" && parsed.fontFamily.trim()) {
        this.#fontFamily = parsed.fontFamily;
      }
      if (Number.isFinite(parsed.fontSize)) {
        this.#fontSize = Math.min(
          MAX_SIZE,
          Math.max(MIN_SIZE, Math.round(parsed.fontSize as number)),
        );
      }
    } catch {
      // 손상값은 기본값 유지
    }
  }
}

export const terminalSettings = new TerminalSettingsStore();
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm test src/lib/stores/terminalSettings.svelte.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/stores/terminalSettings.svelte.ts src/lib/stores/terminalSettings.svelte.test.ts
git commit -m "feat: 터미널 폰트(패밀리/크기) 설정 store 추가"
```

---

### Task 3: 설정 모달 UI store

**Files:**
- Create: `src/lib/stores/settingsUi.svelte.ts`
- Test: `src/lib/stores/settingsUi.svelte.test.ts`

**Interfaces:**
- Consumes: 없음.
- Produces:
  - `type SettingsTab = 'screen'`
  - `export const settingsUi` — 싱글턴. 멤버:
    - `get isOpen(): boolean` / `get activeTab(): SettingsTab`
    - `open(): void` / `close(): void`
    - `setTab(tab: SettingsTab): void`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// src/lib/stores/settingsUi.svelte.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("settingsUi store", () => {
  beforeEach(() => vi.resetModules());

  it("open/close가 isOpen을 토글한다", async () => {
    const { settingsUi } = await import("./settingsUi.svelte");
    expect(settingsUi.isOpen).toBe(false);
    settingsUi.open();
    expect(settingsUi.isOpen).toBe(true);
    settingsUi.close();
    expect(settingsUi.isOpen).toBe(false);
  });

  it("기본 탭은 screen이다", async () => {
    const { settingsUi } = await import("./settingsUi.svelte");
    expect(settingsUi.activeTab).toBe("screen");
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm test src/lib/stores/settingsUi.svelte.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 최소 구현 작성**

```ts
// src/lib/stores/settingsUi.svelte.ts
export type SettingsTab = "screen";

/** 설정 모달의 열림 상태와 활성 탭만 관리하는 UI store (영속 불필요). */
class SettingsUiStore {
  #isOpen = $state<boolean>(false);
  #activeTab = $state<SettingsTab>("screen");

  get isOpen(): boolean {
    return this.#isOpen;
  }
  get activeTab(): SettingsTab {
    return this.#activeTab;
  }

  open(): void {
    this.#isOpen = true;
  }
  close(): void {
    this.#isOpen = false;
  }
  setTab(tab: SettingsTab): void {
    this.#activeTab = tab;
  }
}

export const settingsUi = new SettingsUiStore();
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm test src/lib/stores/settingsUi.svelte.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/stores/settingsUi.svelte.ts src/lib/stores/settingsUi.svelte.test.ts
git commit -m "feat: 설정 모달 UI 상태 store 추가"
```

---

### Task 4: Rust 폰트 열거 명령 + 프론트 IPC 래퍼

**Files:**
- Modify: `src-tauri/Cargo.toml` (font-kit 의존성 추가)
- Modify: `src-tauri/src/commands.rs` (명령 추가, 파일 끝)
- Modify: `src-tauri/src/lib.rs:20-25` (invoke_handler에 등록)
- Create: `src/lib/ipc/fonts.ts`

**Interfaces:**
- Consumes: 없음.
- Produces:
  - Rust 명령 `list_system_fonts() -> Result<Vec<String>, String>`
  - 프론트 `export async function listFonts(): Promise<string[]>` — 실패 시 `[]` 반환(throw 안 함)

- [ ] **Step 1: Cargo.toml에 의존성 추가**

`src-tauri/Cargo.toml`의 `[dependencies]` 마지막에 추가:

```toml
font-kit = "0.14"
```

- [ ] **Step 2: Rust 명령 구현**

`src-tauri/src/commands.rs` 파일 끝에 추가:

```rust
/// 시스템에 설치된 폰트 패밀리 이름을 열거한다. 자동완성 목록으로 사용된다.
/// 실패 시 에러 문자열을 반환하며, 프론트는 이를 조용히 무시하고 빈 목록으로 폴백한다.
#[tauri::command]
pub fn list_system_fonts() -> Result<Vec<String>, String> {
    use font_kit::source::SystemSource;

    let source = SystemSource::new();
    let mut names = source
        .all_families()
        .map_err(|e| e.to_string())?;
    names.sort();
    names.dedup();
    Ok(names)
}
```

- [ ] **Step 3: lib.rs에 명령 등록**

`src-tauri/src/lib.rs`의 `invoke_handler` 목록에 `commands::list_system_fonts,`를 추가:

```rust
        .invoke_handler(tauri::generate_handler![
            commands::create_session,
            commands::write_to_pty,
            commands::resize_pty,
            commands::close_session,
            commands::list_system_fonts,
        ])
```

- [ ] **Step 4: 프론트 IPC 래퍼 작성**

```ts
// src/lib/ipc/fonts.ts
import { invoke } from "@tauri-apps/api/core";

/** 시스템 폰트 패밀리 목록을 조회한다. 실패 시 조용히 빈 배열로 폴백한다. */
export async function listFonts(): Promise<string[]> {
  try {
    return await invoke<string[]>("list_system_fonts");
  } catch {
    return [];
  }
}
```

- [ ] **Step 5: Rust 컴파일 확인**

Run: `mise exec -- cargo check --manifest-path src-tauri/Cargo.toml`
Expected: 컴파일 성공 (font-kit 최초 빌드로 시간이 다소 걸림)

- [ ] **Step 6: 프론트 타입체크 확인**

Run: `pnpm check`
Expected: `fonts.ts` 관련 에러 없음

- [ ] **Step 7: 커밋**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/commands.rs src-tauri/src/lib.rs src/lib/ipc/fonts.ts
git commit -m "feat: 시스템 폰트 열거 IPC(list_system_fonts) 추가"
```

---

### Task 5: shadcn-svelte UI 컴포넌트 추가 (dialog / select / label / input)

**Files:**
- Create (CLI 생성): `src/lib/components/ui/dialog/**`, `src/lib/components/ui/select/**`, `src/lib/components/ui/label/**`, `src/lib/components/ui/input/**`

**Interfaces:**
- Consumes: 없음.
- Produces: shadcn-svelte 규격 컴포넌트. import 경로:
  - `import * as Dialog from "$lib/components/ui/dialog"`
  - `import * as Select from "$lib/components/ui/select"`
  - `import { Label } from "$lib/components/ui/label"`
  - `import { Input } from "$lib/components/ui/input"`

- [ ] **Step 1: 컴포넌트 CLI로 추가**

Run:
```bash
pnpm dlx shadcn-svelte@latest add dialog select label input
```
Expected: 위 4개 컴포넌트 디렉토리가 `src/lib/components/ui/`에 생성됨. (프롬프트가 뜨면 기본값 수락)

- [ ] **Step 2: 생성 확인**

Run: `ls src/lib/components/ui/dialog src/lib/components/ui/select src/lib/components/ui/label src/lib/components/ui/input`
Expected: 각 디렉토리에 `index.ts`와 `.svelte` 파일 존재

- [ ] **Step 3: 타입체크 확인**

Run: `pnpm check`
Expected: 신규 컴포넌트 관련 에러 없음

- [ ] **Step 4: 커밋**

```bash
git add src/lib/components/ui/dialog src/lib/components/ui/select src/lib/components/ui/label src/lib/components/ui/input package.json pnpm-lock.yaml
git commit -m "feat: 설정 화면용 dialog/select/label/input UI 컴포넌트 추가"
```

---

### Task 6: '화면' 탭 본문 (ScreenSettings)

**Files:**
- Create: `src/lib/components/settings/ScreenSettings.svelte`

**Interfaces:**
- Consumes:
  - `theme` (Task 1), `terminalSettings` (Task 2), `listFonts` (Task 4)
  - `Select` / `Label` / `Input` 컴포넌트 (Task 5)
- Produces: `<ScreenSettings />` — props 없음. 스스로 store를 읽고 쓴다.

- [ ] **Step 1: 컴포넌트 작성**

```svelte
<!-- src/lib/components/settings/ScreenSettings.svelte -->
<script lang="ts">
  import { onMount } from "svelte";
  import { theme, type ThemeMode } from "$lib/stores/theme.svelte";
  import { terminalSettings } from "$lib/stores/terminalSettings.svelte";
  import { listFonts } from "$lib/ipc/fonts";
  import { Label } from "$lib/components/ui/label";
  import { Input } from "$lib/components/ui/input";
  import * as Select from "$lib/components/ui/select";

  const themeOptions: { value: ThemeMode; label: string }[] = [
    { value: "light", label: "라이트" },
    { value: "dark", label: "다크" },
    { value: "system", label: "시스템" },
  ];

  let fonts = $state<string[]>([]);
  const themeLabel = $derived(
    themeOptions.find((o) => o.value === theme.mode)?.label ?? "시스템",
  );

  onMount(async () => {
    fonts = await listFonts();
  });
</script>

<div class="flex flex-col gap-6">
  <!-- 테마 -->
  <section class="flex flex-col gap-2">
    <Label>테마</Label>
    <Select.Root
      type="single"
      value={theme.mode}
      onValueChange={(v) => theme.setMode(v as ThemeMode)}
    >
      <Select.Trigger class="w-48">{themeLabel}</Select.Trigger>
      <Select.Content>
        {#each themeOptions as opt (opt.value)}
          <Select.Item value={opt.value} label={opt.label}>{opt.label}</Select.Item>
        {/each}
      </Select.Content>
    </Select.Root>
  </section>

  <!-- 터미널 폰트 -->
  <section class="flex flex-col gap-2">
    <Label for="terminal-font-family">터미널 폰트</Label>
    <Input
      id="terminal-font-family"
      list="system-fonts"
      class="w-64"
      value={terminalSettings.fontFamily}
      oninput={(e) => terminalSettings.setFontFamily(e.currentTarget.value)}
      placeholder="monospace"
    />
    <datalist id="system-fonts">
      {#each fonts as f (f)}
        <option value={f}></option>
      {/each}
    </datalist>
  </section>

  <!-- 폰트 크기 -->
  <section class="flex flex-col gap-2">
    <Label for="terminal-font-size">폰트 크기</Label>
    <Input
      id="terminal-font-size"
      type="number"
      min={8}
      max={32}
      class="w-24"
      value={terminalSettings.fontSize}
      oninput={(e) => terminalSettings.setFontSize(e.currentTarget.valueAsNumber)}
    />
  </section>
</div>
```

- [ ] **Step 2: 타입체크 확인**

Run: `pnpm check`
Expected: `ScreenSettings.svelte` 관련 에러 없음

> 참고: Select 컴포넌트의 정확한 prop 이름/슬롯은 shadcn-svelte 버전에 따라 다를 수 있다. `pnpm check` 에러 발생 시 Task 5로 생성된 `src/lib/components/ui/select/` 컴포넌트의 실제 export/prop 시그니처를 확인해 맞춘다(예: `Select.Trigger`의 라벨 표기 방식).

- [ ] **Step 3: 커밋**

```bash
git add src/lib/components/settings/ScreenSettings.svelte
git commit -m "feat: 설정 '화면' 탭 본문(테마/폰트/크기) 구현"
```

---

### Task 7: 설정 모달 다이얼로그 (SettingsDialog) + 진입점 연결

**Files:**
- Create: `src/lib/components/shell/SettingsDialog.svelte`
- Modify: `src/lib/components/shell/TitleBar.svelte:20-22` (설정 버튼에 onclick 연결)
- Modify: `src/App.svelte` (SettingsDialog 마운트)

**Interfaces:**
- Consumes: `settingsUi` (Task 3), `ScreenSettings` (Task 6), `Dialog` (Task 5).
- Produces: `<SettingsDialog />` — props 없음. `settingsUi.isOpen`에 반응.

- [ ] **Step 1: SettingsDialog 작성**

```svelte
<!-- src/lib/components/shell/SettingsDialog.svelte -->
<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog";
  import { settingsUi } from "$lib/stores/settingsUi.svelte";
  import ScreenSettings from "$lib/components/settings/ScreenSettings.svelte";

  const tabs = [{ id: "screen" as const, label: "화면" }];
</script>

<Dialog.Root
  open={settingsUi.isOpen}
  onOpenChange={(o) => (o ? settingsUi.open() : settingsUi.close())}
>
  <Dialog.Content class="max-w-2xl">
    <Dialog.Header>
      <Dialog.Title>설정</Dialog.Title>
    </Dialog.Header>

    <div class="flex min-h-72 gap-4">
      <!-- 좌: 세로 탭 목록 -->
      <nav class="flex w-32 shrink-0 flex-col gap-1 border-r pr-2">
        {#each tabs as tab (tab.id)}
          <button
            type="button"
            class="rounded-md px-3 py-1.5 text-left text-sm hover:bg-accent"
            class:bg-accent={settingsUi.activeTab === tab.id}
            onclick={() => settingsUi.setTab(tab.id)}
          >
            {tab.label}
          </button>
        {/each}
      </nav>

      <!-- 우: 탭 본문 -->
      <div class="min-w-0 flex-1">
        {#if settingsUi.activeTab === "screen"}
          <ScreenSettings />
        {/if}
      </div>
    </div>
  </Dialog.Content>
</Dialog.Root>
```

- [ ] **Step 2: TitleBar 설정 버튼 연결**

`src/lib/components/shell/TitleBar.svelte`의 `<script>`에 import 추가:

```ts
  import { settingsUi } from "$lib/stores/settingsUi.svelte";
```

그리고 설정 버튼(`:20-22`)에 `onclick` 추가:

```svelte
    <Button
      variant="ghost"
      size="icon"
      aria-label="설정"
      onclick={() => settingsUi.open()}
    >
      <Settings class="size-4" />
    </Button>
```

- [ ] **Step 3: App.svelte에 다이얼로그 마운트**

`src/App.svelte`의 `<script>`에 import 추가:

```ts
  import SettingsDialog from "$lib/components/shell/SettingsDialog.svelte";
```

최상위 `<div class="flex h-screen ...">`의 닫는 태그 바로 앞(마지막 자식으로) 추가:

```svelte
  <SettingsDialog />
```

- [ ] **Step 4: 타입체크 확인**

Run: `pnpm check`
Expected: 에러 없음

- [ ] **Step 5: 커밋**

```bash
git add src/lib/components/shell/SettingsDialog.svelte src/lib/components/shell/TitleBar.svelte src/App.svelte
git commit -m "feat: 설정 모달 다이얼로그 및 타이틀바 진입점 연결"
```

---

### Task 8: 부팅 시 테마 초기화 (FOUC 방지)

**Files:**
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `theme` (Task 1), `terminalSettings` (Task 2).
- Produces: 없음.

- [ ] **Step 1: main.ts에서 store 초기화**

`src/main.ts`를 다음과 같이 수정한다(App 마운트 전에 저장값을 적용해 첫 렌더 깜빡임을 방지):

```ts
import { mount } from "svelte";
import "./app.css";
import App from "./App.svelte";
import { theme } from "$lib/stores/theme.svelte";
import { terminalSettings } from "$lib/stores/terminalSettings.svelte";

// 첫 렌더 전에 저장된 설정을 적용한다(테마 FOUC 방지).
theme.init();
terminalSettings.init();

const app = mount(App, {
  target: document.getElementById("app")!,
});

export default app;
```

- [ ] **Step 2: 타입체크 확인**

Run: `pnpm check`
Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add src/main.ts
git commit -m "feat: 부팅 시 테마/폰트 설정 초기화(FOUC 방지)"
```

---

### Task 9: Terminal.svelte에 폰트 설정 반영

**Files:**
- Modify: `src/lib/components/shell/Terminal.svelte`

**Interfaces:**
- Consumes: `terminalSettings` (Task 2).
- Produces: 없음.

- [ ] **Step 1: Terminal.svelte 수정**

`<script>` 상단 import에 추가:

```ts
  import { terminalSettings } from "$lib/stores/terminalSettings.svelte";
```

`onMount` 내 `new Terminal({...})`의 하드코딩 값을 store 값으로 교체:

```ts
    term = new Terminal({
      cursorBlink: true,
      fontFamily: terminalSettings.fontFamily,
      fontSize: terminalSettings.fontSize,
      allowProposedApi: true,
    });
```

그리고 `onMount`의 `ro.observe(el);` 다음 줄에, store 변경을 xterm에 반영하는 `$effect`를 추가한다. (주의: `$effect`는 컴포넌트 최상위에 두어야 하므로 `onMount` 밖, `onDestroy` 앞에 배치)

`onMount(async () => {...})` 블록과 `onDestroy(...)` 사이에 삽입:

```ts
  // 설정 store 변경 시 실행 중인 터미널에 즉시 반영한다.
  $effect(() => {
    const family = terminalSettings.fontFamily;
    const size = terminalSettings.fontSize;
    if (!term) return;
    term.options.fontFamily = family;
    term.options.fontSize = size;
    fit?.fit();
    if (term) resizePty(sessionId, term.rows, term.cols);
  });
```

- [ ] **Step 2: 타입체크 확인**

Run: `pnpm check`
Expected: 에러 없음

- [ ] **Step 3: 전체 테스트 실행**

Run: `pnpm test`
Expected: 기존 테스트 + 신규 store 테스트 모두 PASS

- [ ] **Step 4: 커밋**

```bash
git add src/lib/components/shell/Terminal.svelte
git commit -m "feat: 터미널에 폰트 설정 store 실시간 반영"
```

---

### Task 10: 수동 통합 검증

**Files:** 없음(수동 검증).

- [ ] **Step 1: 앱 실행**

Run: `mise exec -- pnpm tauri dev`

- [ ] **Step 2: 다음을 육안 확인**

- [ ] 타이틀바 설정 아이콘 클릭 → 설정 모달이 중앙에 뜬다.
- [ ] 좌측에 '화면' 탭이 보이고 선택되어 있다.
- [ ] 테마 select에서 라이트/다크/시스템 전환 시 앱 전체 색상이 즉시 바뀐다.
- [ ] 시스템 선택 후 OS 테마를 바꾸면 앱이 따라 바뀐다.
- [ ] 폰트 입력란 포커스 시 시스템 폰트 자동완성 목록이 뜬다.
- [ ] 폰트명/크기 변경 시 실행 중인 터미널에 즉시 반영된다.
- [ ] 모달을 닫고 앱을 재시작해도 테마·폰트 설정이 유지된다.

- [ ] **Step 3: 검증 결과 기록**

이상 발견 시 해당 Task로 돌아가 수정한다. 모두 통과하면 완료.

---

## Self-Review 결과

- **스펙 커버리지**: 설계 §3(store 3개)→Task 1~3, §4(폰트 IPC)→Task 4, §5(UI 컴포넌트)→Task 5, §6(연동)→Task 7·8·9, §7(에러처리)→각 store/래퍼의 폴백 로직, §8(테스트)→Task 1~3 테스트. 모두 대응됨.
- **플레이스홀더**: 없음. 모든 코드 스텝에 실제 코드 포함.
- **타입 일관성**: `theme.setMode`/`theme.mode`/`ThemeMode`, `terminalSettings.setFontFamily`/`setFontSize`/`fontFamily`/`fontSize`, `settingsUi.open/close/setTab/isOpen/activeTab`, `listFonts()`, `list_system_fonts` — 정의 Task와 소비 Task 간 명칭 일치 확인됨.
- **주의 지점**: Task 6·7의 shadcn-svelte Select/Dialog prop 시그니처는 설치 버전에 따라 다를 수 있어, 각 Task에 실제 생성 컴포넌트 확인 지시를 명시함.
