<script lang="ts">
  import { ContextMenu } from "bits-ui";
  import type { ContextMenuAction, ContextMenuEntry } from "$lib/context-menu/model";
  import { contextMenu } from "$lib/stores/contextMenu.svelte";
  import { actionErrors } from "$lib/stores/actionErrors.svelte";

  let trigger = $state<HTMLDivElement | null>(null);
  let dispatchedGeneration = -1;

  $effect(() => {
    if (!contextMenu.open || !trigger || dispatchedGeneration === contextMenu.generation) return;

    dispatchedGeneration = contextMenu.generation;
    trigger.dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: contextMenu.point.x,
        clientY: contextMenu.point.y,
      }),
    );
  });

  function handleOpenChange(open: boolean) {
    if (!open) contextMenu.close(contextMenu.generation);
  }

  function activate(entry: ContextMenuAction) {
    const generation = contextMenu.generation;
    try {
      void Promise.resolve(entry.onSelect()).catch((reason: unknown) => actionErrors.report(reason));
    } catch (reason) {
      actionErrors.report(reason);
    } finally {
      contextMenu.close(generation);
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key !== "Tab") return;

    event.preventDefault();
    const generation = contextMenu.generation;
    const origin = contextMenu.origin;
    contextMenu.close(generation, false);
    focusRelativeToOrigin(origin, event.shiftKey ? -1 : 1);
  }

  function focusRelativeToOrigin(origin: HTMLElement | null, direction: -1 | 1) {
    if (!origin?.isConnected) return;

    const candidates = Array.from(
      document.querySelectorAll<HTMLElement>(
        'a[href], button, input, select, textarea, [tabindex], [contenteditable]:not([contenteditable="false"])',
      ),
    )
      .filter(
        (element) =>
          element.tabIndex >= 0 &&
          !element.matches(":disabled") &&
          !element.closest('[hidden], [inert], [aria-hidden="true"]'),
      )
      .map((element, index) => ({ element, index }));

    const ordered = [
      ...candidates
        .filter(({ element }) => element.tabIndex > 0)
        .sort(({ element: a, index: aIndex }, { element: b, index: bIndex }) => a.tabIndex - b.tabIndex || aIndex - bIndex),
      ...candidates.filter(({ element }) => element.tabIndex === 0),
    ].map(({ element }) => element);

    const originIndex = ordered.indexOf(origin);
    const next = originIndex === -1 ? undefined : ordered[originIndex + direction];
    (next ?? origin).focus({ preventScroll: true });
  }
</script>

{#snippet entries(items: ContextMenuEntry[])}
  {#each items as entry, index (`${entry.type}:${entry.id ?? index}`)}
    {#if entry.type === "separator"}
      <ContextMenu.Separator class="my-1 h-px bg-border" />
    {:else if entry.type === "submenu"}
      <ContextMenu.Sub>
        <ContextMenu.SubTrigger
          disabled={entry.disabled}
          class="flex cursor-default items-center justify-between gap-4 rounded-sm px-2 py-1.5 outline-none data-[highlighted]:bg-accent data-[disabled]:opacity-50"
        >
          <span>{entry.label}</span><span aria-hidden="true">›</span>
        </ContextMenu.SubTrigger>
        <ContextMenu.Portal>
          <ContextMenu.SubContent class="z-50 min-w-40 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md outline-none">
            {@render entries(entry.items)}
          </ContextMenu.SubContent>
        </ContextMenu.Portal>
      </ContextMenu.Sub>
    {:else}
      <ContextMenu.Item
        disabled={entry.disabled}
        class="flex cursor-default items-center justify-between gap-4 rounded-sm px-2 py-1.5 outline-none data-[highlighted]:bg-accent data-[disabled]:opacity-50"
        onSelect={() => activate(entry)}
      >
        <span>{entry.label}</span>
        {#if entry.shortcut}<span class="text-muted-foreground">{entry.shortcut}</span>{/if}
      </ContextMenu.Item>
    {/if}
  {/each}
{/snippet}

<ContextMenu.Root open={contextMenu.open} onOpenChange={handleOpenChange}>
  <ContextMenu.Trigger bind:ref={trigger} aria-hidden="true" />
  <ContextMenu.Portal>
    <ContextMenu.Content
      class="z-50 min-w-40 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md outline-none"
      aria-label={contextMenu.model.ariaLabel}
      onkeydown={handleKeydown}
      onCloseAutoFocus={(event) => event.preventDefault()}
    >
      {@render entries(contextMenu.model.items)}
    </ContextMenu.Content>
  </ContextMenu.Portal>
</ContextMenu.Root>
