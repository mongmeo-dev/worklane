<script lang="ts">
  import { onMount } from "svelte";
  import { theme, type ThemeMode } from "$lib/stores/theme.svelte";
  import { terminalSettings } from "$lib/stores/terminalSettings.svelte";
  import { listFonts } from "$lib/ipc/fonts";
  import { Input } from "$lib/components/ui/input";
  import Minus from "@lucide/svelte/icons/minus";
  import Plus from "@lucide/svelte/icons/plus";

  const themeOptions: { value: ThemeMode; label: string }[] = [
    { value: "light", label: "라이트" },
    { value: "dark", label: "다크" },
    { value: "system", label: "시스템" },
  ];
  let fonts = $state<string[]>([]);

  onMount(async () => {
    try { fonts = await listFonts(); } catch { fonts = []; }
  });
</script>

<div class="flex flex-col gap-7">
  <section>
    <div class="mb-2.5">
      <h2 class="text-[12px] font-semibold">테마</h2>
      <p class="mt-0.5 text-[10.5px] text-muted-foreground">Worklane의 화면 색상 모드를 선택합니다.</p>
    </div>
    <div class="inline-flex rounded-[9px] border bg-muted/35 p-0.5">
      {#each themeOptions as option (option.value)}
        <button type="button" class="h-7 rounded-[7px] px-3.5 text-[11.5px] font-medium {theme.mode === option.value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}" onclick={() => theme.setMode(option.value)}>{option.label}</button>
      {/each}
    </div>
  </section>

  <section>
    <div class="mb-2.5">
      <h2 class="text-[12px] font-semibold">터미널 폰트</h2>
      <p class="mt-0.5 text-[10.5px] text-muted-foreground">설치된 고정폭 폰트 이름을 입력합니다.</p>
    </div>
    <Input id="terminal-font-family" list="system-fonts" class="h-8 w-64 font-mono text-[11px]" value={terminalSettings.fontFamily} oninput={(event) => terminalSettings.setFontFamily(event.currentTarget.value)} />
    <datalist id="system-fonts">{#each fonts as font (font)}<option value={font}></option>{/each}</datalist>
  </section>

  <section>
    <div class="mb-2.5">
      <h2 class="text-[12px] font-semibold">터미널 폰트 크기</h2>
      <p class="mt-0.5 text-[10.5px] text-muted-foreground">열려 있는 터미널에 바로 적용됩니다.</p>
    </div>
    <div class="inline-flex h-8 items-center overflow-hidden rounded-[9px] border bg-background">
      <button type="button" class="grid h-full w-8 place-items-center text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="폰트 크기 줄이기" onclick={() => terminalSettings.setFontSize(terminalSettings.fontSize - 1)}><Minus class="size-3.5" /></button>
      <span class="grid h-full w-12 place-items-center border-x font-mono text-[11px] font-semibold">{terminalSettings.fontSize}</span>
      <button type="button" class="grid h-full w-8 place-items-center text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="폰트 크기 늘리기" onclick={() => terminalSettings.setFontSize(terminalSettings.fontSize + 1)}><Plus class="size-3.5" /></button>
    </div>
    <span class="ml-2 text-[9.5px] text-muted-foreground">10–20px</span>
  </section>
</div>
