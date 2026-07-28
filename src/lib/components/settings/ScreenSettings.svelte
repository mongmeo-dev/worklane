<script lang="ts">
  import { onMount } from "svelte";
  import { theme, type ThemeMode } from "$lib/stores/theme.svelte";
  import { terminalSettings } from "$lib/stores/terminalSettings.svelte";
  import { listFonts } from "$lib/ipc/fonts";
  import { Input } from "$lib/components/ui/input";
  import { t, locale, LOCALES, localeLabels } from "$lib/i18n";
  import Minus from "@lucide/svelte/icons/minus";
  import Plus from "@lucide/svelte/icons/plus";

  const themeOptions: { value: ThemeMode; labelKey: "settings.screen.theme.light" | "settings.screen.theme.dark" | "settings.screen.theme.system" }[] = [
    { value: "light", labelKey: "settings.screen.theme.light" },
    { value: "dark", labelKey: "settings.screen.theme.dark" },
    { value: "system", labelKey: "settings.screen.theme.system" },
  ];
  let fonts = $state<string[]>([]);

  onMount(async () => {
    try { fonts = await listFonts(); } catch { fonts = []; }
  });
</script>

<div class="flex flex-col gap-7">
  <section>
    <div class="mb-2.5">
      <h2 class="text-sm font-semibold">{t("settings.screen.language.title")}</h2>
      <p class="mt-0.5 text-2xs text-muted-foreground">{t("settings.screen.language.desc")}</p>
    </div>
    <div class="inline-flex rounded-[9px] border bg-muted/35 p-0.5">
      {#each LOCALES as option (option)}
        <button type="button" class="h-7 rounded-[7px] px-3.5 text-xs font-medium {locale.current === option ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}" onclick={() => locale.set(option)}>{localeLabels[option]}</button>
      {/each}
    </div>
  </section>

  <section>
    <div class="mb-2.5">
      <h2 class="text-sm font-semibold">{t("settings.screen.theme.title")}</h2>
      <p class="mt-0.5 text-2xs text-muted-foreground">{t("settings.screen.theme.desc")}</p>
    </div>
    <div class="inline-flex rounded-[9px] border bg-muted/35 p-0.5">
      {#each themeOptions as option (option.value)}
        <button type="button" class="h-7 rounded-[7px] px-3.5 text-xs font-medium {theme.mode === option.value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}" onclick={() => theme.setMode(option.value)}>{t(option.labelKey)}</button>
      {/each}
    </div>
  </section>

  <section>
    <div class="mb-2.5">
      <h2 class="text-sm font-semibold">{t("settings.screen.font.title")}</h2>
      <p class="mt-0.5 text-2xs text-muted-foreground">{t("settings.screen.font.desc")}</p>
    </div>
    <Input id="terminal-font-family" list="system-fonts" class="h-8 w-64 font-mono text-xs" value={terminalSettings.fontFamily} oninput={(event) => terminalSettings.setFontFamily(event.currentTarget.value)} />
    <datalist id="system-fonts">{#each fonts as font (font)}<option value={font}></option>{/each}</datalist>
  </section>

  <section>
    <div class="mb-2.5">
      <h2 class="text-sm font-semibold">{t("settings.screen.fontSize.title")}</h2>
      <p class="mt-0.5 text-2xs text-muted-foreground">{t("settings.screen.fontSize.desc")}</p>
    </div>
    <div class="inline-flex h-8 items-center overflow-hidden rounded-[9px] border bg-background">
      <button type="button" class="grid h-full w-8 place-items-center text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={t("settings.screen.fontSize.decrease")} onclick={() => terminalSettings.setFontSize(terminalSettings.fontSize - 1)}><Minus class="size-3.5" /></button>
      <span class="grid h-full w-12 place-items-center border-x font-mono text-xs font-semibold">{terminalSettings.fontSize}</span>
      <button type="button" class="grid h-full w-8 place-items-center text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={t("settings.screen.fontSize.increase")} onclick={() => terminalSettings.setFontSize(terminalSettings.fontSize + 1)}><Plus class="size-3.5" /></button>
    </div>
    <span class="ml-2 text-2xs text-muted-foreground">10–20px</span>
  </section>
</div>
