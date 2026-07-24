<!-- 외부 연동 설정: Linear API 키. -->
<script lang="ts">
  import { integrations } from "$lib/stores/integrations.svelte";
  import { openUrl } from "@tauri-apps/plugin-opener";
  import ExternalLink from "@lucide/svelte/icons/external-link";
  import { updater } from "$lib/stores/updater.svelte";
  import { t } from "$lib/i18n";
</script>

<div class="flex flex-col gap-5">
  <div class="rounded-[10px] border bg-muted/35 p-3 text-[11px] leading-relaxed text-muted-foreground">
    {t("settings.integrations.githubNotePre")}<code class="rounded bg-background px-1">gh</code>{t("settings.integrations.githubNotePost")}
  </div>

  <section class="flex flex-col gap-2 rounded-[10px] border p-4">
    <div class="flex items-center gap-2">
      <h2 class="text-[12.5px] font-semibold">{t("settings.integrations.linearKeyHeading")}</h2>
      <button
        type="button"
        class="ml-auto inline-flex items-center gap-1 text-[10px] font-semibold text-accent-share"
        onclick={() => openUrl("https://linear.app/settings/api")}
      >
        {t("settings.integrations.issueKey")} <ExternalLink class="size-3" />
      </button>
    </div>
    <input
      type="password"
      class="h-8 w-full rounded-md border bg-input/40 px-2.5 font-mono text-[11.5px] outline-none focus:ring-1 focus:ring-ring"
      value={integrations.linearKey}
      oninput={(e) => integrations.setLinearKey(e.currentTarget.value)}
      placeholder="lin_api_..."
      aria-label={t("settings.integrations.linearKeyAria")}
      spellcheck="false"
    />
    <p class="text-[10.5px] text-muted-foreground">{t("settings.integrations.linearKeyDesc")}</p>
  </section>

  <section class="flex flex-col gap-2 rounded-[10px] border p-4">
    <h2 class="text-[12.5px] font-semibold">{t("settings.integrations.webhookHeading")}</h2>
    <input
      type="url"
      class="h-8 w-full rounded-md border bg-input/40 px-2.5 font-mono text-[11.5px] outline-none focus:ring-1 focus:ring-ring"
      value={integrations.webhookUrl}
      oninput={(e) => integrations.setWebhookUrl(e.currentTarget.value)}
      placeholder={t("settings.integrations.webhookPlaceholder")}
      aria-label={t("settings.integrations.webhookAria")}
      spellcheck="false"
    />
    <p class="text-[10.5px] text-muted-foreground">{t("settings.integrations.webhookDesc")}</p>
  </section>

  <section class="flex flex-col gap-2 rounded-[10px] border p-4">
    <div class="flex items-center gap-2">
      <h2 class="text-[12.5px] font-semibold">{t("settings.integrations.updateHeading")}</h2>
      <button
        type="button"
        class="ml-auto rounded-md border bg-card px-2.5 py-1 text-[11px] font-semibold hover:bg-accent disabled:opacity-50"
        disabled={updater.status === "checking" || updater.status === "downloading"}
        onclick={() => updater.check(true)}
      >{updater.status === "checking" ? t("settings.integrations.checking") : t("settings.integrations.checkUpdate")}</button>
    </div>
    {#if updater.available}
      <p class="text-[11px] text-status-done-fg">{t("settings.integrations.updateAvailable", { version: updater.version ?? "" })}</p>
    {:else if updater.message}
      <p class="text-[10.5px] text-muted-foreground">{updater.message}</p>
    {/if}
  </section>
</div>
