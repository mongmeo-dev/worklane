<!-- 외부 연동 설정: Linear API 키. -->
<script lang="ts">
  import { integrations } from "$lib/stores/integrations.svelte";
  import { openUrl } from "@tauri-apps/plugin-opener";
  import ExternalLink from "@lucide/svelte/icons/external-link";
</script>

<div class="flex flex-col gap-5">
  <div class="rounded-[10px] border bg-muted/35 p-3 text-[11px] leading-relaxed text-muted-foreground">
    GitHub 이슈·PR은 <code class="rounded bg-background px-1">gh</code> CLI를 사용하며 별도 키가 필요 없습니다. Linear는 개인 API 키로 연동합니다.
  </div>

  <section class="flex flex-col gap-2 rounded-[10px] border p-4">
    <div class="flex items-center gap-2">
      <h2 class="text-[12.5px] font-semibold">Linear API 키</h2>
      <button
        type="button"
        class="ml-auto inline-flex items-center gap-1 text-[10px] font-semibold text-accent-share"
        onclick={() => openUrl("https://linear.app/settings/api")}
      >
        키 발급 <ExternalLink class="size-3" />
      </button>
    </div>
    <input
      type="password"
      class="h-8 w-full rounded-md border bg-input/40 px-2.5 font-mono text-[11.5px] outline-none focus:ring-1 focus:ring-ring"
      value={integrations.linearKey}
      oninput={(e) => integrations.setLinearKey(e.currentTarget.value)}
      placeholder="lin_api_..."
      aria-label="Linear API 키"
      spellcheck="false"
    />
    <p class="text-[10.5px] text-muted-foreground">키는 이 기기에만 저장되며, 팬아웃 다이얼로그에서 Linear 이슈를 불러올 때 사용됩니다.</p>
  </section>

  <section class="flex flex-col gap-2 rounded-[10px] border p-4">
    <h2 class="text-[12.5px] font-semibold">Slack / Discord 웹훅</h2>
    <input
      type="url"
      class="h-8 w-full rounded-md border bg-input/40 px-2.5 font-mono text-[11.5px] outline-none focus:ring-1 focus:ring-ring"
      value={integrations.webhookUrl}
      oninput={(e) => integrations.setWebhookUrl(e.currentTarget.value)}
      placeholder="https://hooks.slack.com/... 또는 https://discord.com/api/webhooks/..."
      aria-label="Slack/Discord 웹훅 URL"
      spellcheck="false"
    />
    <p class="text-[10.5px] text-muted-foreground">입력 대기·완료 전이와 사용량 예산 초과 시 이 웹훅으로도 알림을 보냅니다. URL로 Slack/Discord를 자동 판별합니다.</p>
  </section>
</div>
