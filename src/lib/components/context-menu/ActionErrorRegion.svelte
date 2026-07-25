<script lang="ts">
  import { t } from "$lib/i18n";
  import { actionErrors } from "$lib/stores/actionErrors.svelte";
</script>

<div class="fixed bottom-4 right-4 z-[60] max-w-sm" aria-live="polite" aria-atomic="true" role="status">
  {#if actionErrors.event}
    {#key actionErrors.event.id}
      <div class="flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive shadow-md">
        <p class="min-w-0 flex-1">{t("actionError.unknown")}</p>
        <button type="button" class="shrink-0 font-medium underline" onclick={() => actionErrors.dismiss()}>{t("actionError.dismiss")}</button>
      </div>
    {/key}
  {/if}
</div>
