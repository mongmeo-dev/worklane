<script lang="ts">
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { ContextMenu } from "bits-ui";
  import type { ContextMenuAction, ContextMenuEntry } from "$lib/context-menu/model";
  import { contextMenu } from "$lib/stores/contextMenu.svelte";
  import { actionErrors } from "$lib/stores/actionErrors.svelte";

  let trigger = $state<HTMLDivElement | null>(null);
  let dispatchedGeneration = -1;
  let renderedGeneration = $state(-1);

  $effect(() => {
    if (!contextMenu.open || !trigger || dispatchedGeneration === contextMenu.generation) return;

    renderedGeneration = contextMenu.generation;
    dispatchedGeneration = renderedGeneration;
    trigger.dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: contextMenu.point.x,
        clientY: contextMenu.point.y,
      }),
    );
  });

  $effect(() => {
    if (!contextMenu.open && !contextMenu.pendingOrigin) return;

    const generation = contextMenu.generation;
    const closeForDeactivation = () => {
      contextMenu.cancelPendingRequest();
      contextMenu.close(generation, "deactivation");
    };
    const cancelDisconnectedPending = () => {
      if (contextMenu.pendingOrigin && !contextMenu.pendingOrigin.isConnected) contextMenu.cancelPendingRequest();
    };
    if (contextMenu.origin && !contextMenu.origin.isConnected) {
      closeForDeactivation();
      return;
    }
    cancelDisconnectedPending();
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        const menuEvent = isMenuEvent(event);
        if (!menuEvent && !contextMenu.pendingOrigin) return;

        event.preventDefault();
        contextMenu.cancelPendingRequest();
        if (menuEvent) contextMenu.close(generation, "escape");
        return;
      }

      if (!isMenuEvent(event) || event.key !== "Tab") return;
      event.preventDefault();

      const origin = contextMenu.origin;
      contextMenu.close(generation, "tab");
      focusRelativeToOrigin(origin, event.shiftKey ? -1 : 1);
    };
    const handlePointerDown = () => {
      if (contextMenu.pendingOrigin) contextMenu.cancelPendingRequest();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") closeForDeactivation();
    };
    const observer = new MutationObserver(() => {
      if (contextMenu.origin && !contextMenu.origin.isConnected) closeForDeactivation();
      else cancelDisconnectedPending();
    });

    document.addEventListener("keydown", handleKeydown, true);
    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", closeForDeactivation);
    window.addEventListener("scroll", closeForDeactivation);
    window.addEventListener("resize", closeForDeactivation);
    observer.observe(document, { childList: true, subtree: true });

    let disposed = false;
    let unlisten: (() => void) | undefined;
    void getCurrentWindow()
      .onFocusChanged(({ payload: focused }) => {
        if (!focused) closeForDeactivation();
      })
      .then((stop) => {
        if (disposed) stop();
        else unlisten = stop;
      })
      .catch(() => {});

    return () => {
      disposed = true;
      unlisten?.();
      observer.disconnect();
      document.removeEventListener("keydown", handleKeydown, true);
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", closeForDeactivation);
      window.removeEventListener("scroll", closeForDeactivation);
      window.removeEventListener("resize", closeForDeactivation);
    };
  });

  function handleOpenChange(open: boolean) {
    if (!open) contextMenu.close(contextMenu.generation, "outside");
  }

  function activate(entry: ContextMenuAction, generation: number) {
    if (generation !== renderedGeneration || !contextMenu.isCurrent(generation)) return;

    contextMenu.close(generation, "action");
    try {
      void Promise.resolve(entry.onSelect()).catch((reason: unknown) => actionErrors.report(reason));
    } catch (reason) {
      actionErrors.report(reason);
    }
  }

  function isMenuEvent(event: Event): boolean {
    return event.composedPath().some(
      (target) => target instanceof HTMLElement && target.dataset.contextMenuContent === "true",
    );
  }

  function focusRelativeToOrigin(origin: HTMLElement | null, direction: -1 | 1) {
    if (!isVisible(origin)) return;

    const candidates = Array.from(
      document.querySelectorAll<HTMLElement>(
        'a[href], button, input, select, textarea, [tabindex], [contenteditable]:not([contenteditable="false"])',
      ),
    )
      .filter(
        (element) =>
          element.tabIndex >= 0 &&
          !element.matches(":disabled") &&
          !element.closest('[hidden], [inert], [aria-hidden="true"]') &&
          isVisible(element),
      )
      .map((element, index) => ({ element, index }));

    const ordered = [
      ...candidates
        .filter(({ element }) => element.tabIndex > 0)
        .sort(({ element: a, index: aIndex }, { element: b, index: bIndex }) => a.tabIndex - b.tabIndex || aIndex - bIndex),
      ...candidates.filter(({ element }) => element.tabIndex === 0),
    ].map(({ element }) => element);

    const originIndex = ordered.indexOf(origin);
    if (originIndex === -1 || ordered.length === 0) return;

    ordered[(originIndex + direction + ordered.length) % ordered.length]?.focus({ preventScroll: true });
  }

  function isVisible(element: HTMLElement | null): element is HTMLElement {
    if (!element?.isConnected) return false;

    const style = getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden" && element.getClientRects().length > 0;
  }
</script>

{#snippet entries(items: ContextMenuEntry[], generation: number)}
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
          <ContextMenu.SubContent
            data-context-menu-content="true"
            class="z-50 min-w-40 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md outline-none"
          >
            {@render entries(entry.items, generation)}
          </ContextMenu.SubContent>
        </ContextMenu.Portal>
      </ContextMenu.Sub>
    {:else}
      <ContextMenu.Item
        disabled={entry.disabled}
        class="flex cursor-default items-center justify-between gap-4 rounded-sm px-2 py-1.5 outline-none data-[highlighted]:bg-accent data-[disabled]:opacity-50"
        onSelect={() => activate(entry, generation)}
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
      data-context-menu-content="true"
      class="z-50 min-w-40 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md outline-none"
      aria-label={contextMenu.model.ariaLabel}
      onCloseAutoFocus={(event) => event.preventDefault()}
    >
      {@render entries(contextMenu.model.items, renderedGeneration)}
    </ContextMenu.Content>
  </ContextMenu.Portal>
</ContextMenu.Root>
