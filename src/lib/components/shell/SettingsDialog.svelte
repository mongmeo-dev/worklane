<!-- src/lib/components/shell/SettingsDialog.svelte -->
<!-- 설정 모달: Dialog + 세로 탭 레이아웃. 현재는 '화면' 탭만 존재. -->
<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog";
  import { settingsUi } from "$lib/stores/settingsUi.svelte";
  import ScreenSettings from "$lib/components/settings/ScreenSettings.svelte";

  const tabs = [{ id: "screen" as const, label: "화면" }];
</script>

<Dialog.Root
  open={settingsUi.isOpen}
  onOpenChange={(o) => (o ? settingsUi.open() : settingsUi.close())}
>
  <Dialog.Content class="max-w-2xl">
    <Dialog.Header>
      <Dialog.Title>설정</Dialog.Title>
    </Dialog.Header>

    <div class="flex min-h-72 gap-4">
      <!-- 좌: 세로 탭 목록 -->
      <nav class="flex w-32 shrink-0 flex-col gap-1 border-r pr-2">
        {#each tabs as tab (tab.id)}
          <button
            type="button"
            class="rounded-md px-3 py-1.5 text-left text-sm hover:bg-accent"
            class:bg-accent={settingsUi.activeTab === tab.id}
            onclick={() => settingsUi.setTab(tab.id)}
          >
            {tab.label}
          </button>
        {/each}
      </nav>

      <!-- 우: 탭 본문 -->
      <div class="min-w-0 flex-1">
        {#if settingsUi.activeTab === "screen"}
          <ScreenSettings />
        {/if}
      </div>
    </div>
  </Dialog.Content>
</Dialog.Root>
