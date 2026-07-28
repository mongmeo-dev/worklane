<!-- 사용량 예산 임계값 설정. 초과 시 상태바 경고와 OS 알림이 발생한다. -->
<script lang="ts">
  import { budget } from "$lib/stores/budget.svelte";
  import { MAX_BUDGET_THRESHOLD, MIN_BUDGET_THRESHOLD } from "$lib/usage/budget";
  import { t } from "$lib/i18n";
  import TriangleAlert from "@lucide/svelte/icons/triangle-alert";

  let value = $state(budget.threshold);

  function apply(v: number) {
    budget.setThreshold(v);
    value = budget.threshold;
  }
</script>

<div class="flex flex-col gap-5">
  <div class="rounded-[10px] border bg-muted/35 p-3 text-xs leading-relaxed text-muted-foreground">
    {t("settings.usage.intro")}
  </div>

  <section class="flex flex-col gap-3 rounded-[10px] border p-4">
    <div class="flex items-center gap-2">
      <TriangleAlert class="size-4 text-status-blocked-fg" />
      <h2 class="text-sm font-semibold">{t("settings.usage.thresholdHeading")}</h2>
      <span class="ml-auto font-mono text-sm font-bold">{value}%</span>
    </div>
    <input
      type="range"
      min={MIN_BUDGET_THRESHOLD}
      max={MAX_BUDGET_THRESHOLD}
      step="1"
      bind:value
      oninput={() => apply(value)}
      class="w-full accent-status-blocked"
      aria-label={t("settings.usage.thresholdAria")}
    />
    <p class="text-2xs text-muted-foreground">
      {t("settings.usage.thresholdDesc", { value })}
    </p>
  </section>
</div>
