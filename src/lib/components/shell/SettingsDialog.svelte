<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog";
  import type { SettingsTab } from "$lib/stores/settingsUi.svelte";
  import { settingsUi } from "$lib/stores/settingsUi.svelte";
  import ScreenSettings from "$lib/components/settings/ScreenSettings.svelte";
  import AgentSettings from "$lib/components/settings/AgentSettings.svelte";
  import Monitor from "@lucide/svelte/icons/monitor";
  import Bot from "@lucide/svelte/icons/bot";

  const tabs: { id: SettingsTab; label: string; icon: typeof Monitor }[] = [
    { id: "screen", label: "화면", icon: Monitor },
    { id: "agents", label: "에이전트", icon: Bot },
  ];
</script>

<Dialog.Root open={settingsUi.isOpen} onOpenChange={(open) => (open ? settingsUi.open() : settingsUi.close())}>
  <Dialog.Content class="h-[460px] w-[640px] max-w-[calc(100%-2rem)] gap-0 overflow-hidden rounded-[14px] border p-0 sm:max-w-[640px]">
    <Dialog.Header class="flex h-12 shrink-0 justify-center border-b px-4">
      <Dialog.Title class="text-[14px] font-semibold">설정</Dialog.Title>
    </Dialog.Header>

    <div class="flex min-h-0 flex-1">
      <nav class="flex w-[150px] shrink-0 flex-col gap-1 border-r bg-sidebar p-2" aria-label="설정 분류">
        {#each tabs as tab (tab.id)}
          <button
            type="button"
            class="flex h-8 items-center gap-2 rounded-lg px-3 text-left text-[12.5px] font-medium {settingsUi.activeTab === tab.id ? 'bg-sidebar-accent text-foreground' : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground'}"
            onclick={() => settingsUi.setTab(tab.id)}
          >
            <tab.icon class="size-3.5" />{tab.label}
          </button>
        {/each}
      </nav>

      <div class="min-w-0 flex-1 overflow-auto p-5">
        {#if settingsUi.activeTab === "screen"}<ScreenSettings />{:else}<AgentSettings />{/if}
      </div>
    </div>
  </Dialog.Content>
</Dialog.Root>
