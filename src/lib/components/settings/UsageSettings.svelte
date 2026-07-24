<!-- 사용량 예산 임계값 설정. 초과 시 상태바 경고와 OS 알림이 발생한다. -->
<script lang="ts">
  import { budget } from "$lib/stores/budget.svelte";
  import { MAX_BUDGET_THRESHOLD, MIN_BUDGET_THRESHOLD } from "$lib/usage/budget";
  import TriangleAlert from "@lucide/svelte/icons/triangle-alert";

  let value = $state(budget.threshold);

  function apply(v: number) {
    budget.setThreshold(v);
    value = budget.threshold;
  }
</script>

<div class="flex flex-col gap-5">
  <div class="rounded-[10px] border bg-muted/35 p-3 text-[11px] leading-relaxed text-muted-foreground">
    CLI 제공자의 사용량이 아래 임계값을 넘으면 상태바에 경고가 표시되고 OS 알림이 발생합니다. 여러 프로젝트를 오래 운용할 때 과금 한도에 미리 대응할 수 있습니다.
  </div>

  <section class="flex flex-col gap-3 rounded-[10px] border p-4">
    <div class="flex items-center gap-2">
      <TriangleAlert class="size-4 text-status-blocked-fg" />
      <h2 class="text-[12.5px] font-semibold">예산 경고 임계값</h2>
      <span class="ml-auto font-mono text-[13px] font-bold">{value}%</span>
    </div>
    <input
      type="range"
      min={MIN_BUDGET_THRESHOLD}
      max={MAX_BUDGET_THRESHOLD}
      step="1"
      bind:value
      oninput={() => apply(value)}
      class="w-full accent-status-blocked"
      aria-label="예산 경고 임계값(퍼센트)"
    />
    <p class="text-[10.5px] text-muted-foreground">
      사용량이 {value}% 이상이 되면 경고합니다. 계정 단위 사용량을 기준으로 하며, 지원되는 제공자(Claude Code·Codex)에만 적용됩니다.
    </p>
  </section>
</div>
