<!-- src/lib/components/settings/ScreenSettings.svelte -->
<!-- 설정 모달의 '화면' 탭 본문: 테마 / 터미널 폰트 / 폰트 크기 -->
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

  // 시스템 폰트 목록. onMount에서 비동기 조회 후 datalist로 자동완성 제공.
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
