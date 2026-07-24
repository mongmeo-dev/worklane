<!-- 자동 업데이트 배너: 새 버전이 있으면 우하단에 설치 안내를 띄운다. -->
<script lang="ts">
  import { updater } from "$lib/stores/updater.svelte";
  import Download from "@lucide/svelte/icons/download";
  import X from "@lucide/svelte/icons/x";
  import { t } from "$lib/i18n";

  const downloading = $derived(updater.status === "downloading");
</script>

{#if updater.available}
  <div class="fixed bottom-3 right-3 z-50 w-72 rounded-xl border bg-popover text-popover-foreground shadow-2xl">
    <div class="flex items-start gap-2.5 p-3.5">
      <Download class="mt-0.5 size-4 shrink-0 text-accent-share" />
      <div class="min-w-0 flex-1">
        <p class="text-[12.5px] font-semibold">{t("updateBanner.newVersion", { version: updater.version ?? "" })}</p>
        <p class="mt-0.5 text-[10.5px] text-muted-foreground">{t("updateBanner.desc")}</p>
        {#if updater.message}<p class="mt-1 text-[10px] text-destructive">{updater.message}</p>{/if}
      </div>
      {#if !downloading}
        <button type="button" class="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground" aria-label={t("updateBanner.later")} onclick={() => updater.dismiss()}>
          <X class="size-3.5" />
        </button>
      {/if}
    </div>
    <div class="flex justify-end gap-1.5 border-t px-3.5 py-2.5">
      {#if !downloading}
        <button type="button" class="rounded-md border px-2.5 py-1 text-[11px] hover:bg-accent" onclick={() => updater.dismiss()}>{t("updateBanner.later")}</button>
      {/if}
      <button
        type="button"
        class="rounded-md bg-primary px-3 py-1 text-[11px] font-semibold text-primary-foreground disabled:opacity-50"
        disabled={downloading}
        onclick={() => updater.install()}
      >{downloading ? t("updateBanner.installing") : t("updateBanner.installRestart")}</button>
    </div>
  </div>
{/if}
