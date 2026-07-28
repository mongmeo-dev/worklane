<!-- ⌘/ 단축키 도움말. 전역 키맵과 같은 목록을 한 화면에 보여준다. -->
<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog";
  import { shell } from "$lib/stores/shell.svelte";
  import { t, type MessageKey } from "$lib/i18n";

  interface Row {
    keys: string[];
    labelKey: MessageKey;
  }

  const groups: { titleKey: MessageKey; rows: Row[] }[] = [
    {
      titleKey: "shortcuts.group.navigation",
      rows: [
        { keys: ["⌘", "K"], labelKey: "shortcuts.palette" },
        { keys: ["⌘", "0"], labelKey: "shortcuts.overview" },
        { keys: ["⌘", "1"], labelKey: "shortcuts.jump" },
      ],
    },
    {
      titleKey: "shortcuts.group.workspace",
      rows: [
        { keys: ["⌘", "⌥", "↑↓"], labelKey: "shortcuts.cycle" },
        { keys: ["⌘", "⇧", "A"], labelKey: "shortcuts.attention" },
      ],
    },
    {
      titleKey: "shortcuts.group.view",
      rows: [
        { keys: ["⌘", "B"], labelKey: "shortcuts.toggleLeft" },
        { keys: ["⌘", "⌥", "B"], labelKey: "shortcuts.toggleRight" },
        { keys: ["⌘", ","], labelKey: "shortcuts.settings" },
        { keys: ["⌘", "/"], labelKey: "shortcuts.help" },
      ],
    },
    {
      titleKey: "shortcuts.group.create",
      rows: [
        { keys: ["⌘", "N"], labelKey: "shortcuts.newAgent" },
        { keys: ["⌘", "⇧", "N"], labelKey: "shortcuts.fanout" },
        { keys: ["⌘", "⇧", "T"], labelKey: "shortcuts.tasks" },
      ],
    },
  ];
</script>

<Dialog.Root open={shell.shortcutsOpen} onOpenChange={(value) => shell.setShortcutsOpen(value)}>
  <Dialog.Content class="sm:max-w-2xl">
    <Dialog.Header>
      <Dialog.Title>{t("shortcuts.title")}</Dialog.Title>
      <Dialog.Description>{t("shortcuts.description")}</Dialog.Description>
    </Dialog.Header>

    <div class="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
      {#each groups as group (group.titleKey)}
        <section>
          <h3 class="mb-2 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t(group.titleKey)}
          </h3>
          <ul class="flex flex-col gap-1.5">
            {#each group.rows as row (row.labelKey)}
              <li class="flex items-center gap-3">
                <span class="flex shrink-0 items-center gap-1">
                  {#each row.keys as key (key)}
                    <kbd
                      class="grid h-5 min-w-5 place-items-center rounded-[5px] border border-border bg-muted px-1.5 font-mono text-2xs font-semibold text-foreground"
                    >{key}</kbd>
                  {/each}
                </span>
                <span class="min-w-0 flex-1 truncate text-xs text-muted-foreground">{t(row.labelKey)}</span>
              </li>
            {/each}
          </ul>
        </section>
      {/each}
    </div>
  </Dialog.Content>
</Dialog.Root>
