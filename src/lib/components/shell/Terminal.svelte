<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import "@xterm/xterm/css/xterm.css";
  import { terminalSettings } from "$lib/stores/terminalSettings.svelte";
  import { terminalPool, type PooledTerminal } from "$lib/terminal/pool";
  import { closeContextMenu, contextMenu } from "$lib/stores/contextMenu.svelte";
  import { t } from "$lib/i18n";
  import { actionErrors } from "$lib/stores/actionErrors.svelte";
  import { agentDetection } from "$lib/stores/agentDetection.svelte";
  import { createContextMenuTrigger } from "$lib/context-menu/trigger";

  interface Props {
    sessionId: string;
    cmd: string;
    cwd: string;
    /** 세션이 준비되면 자동으로 전송할 시드 프롬프트(팬아웃/태스크). 1회만 주입한다. */
    initialPrompt?: string;
  }

  let { sessionId, cmd, cwd, initialPrompt }: Props = $props();

  let el: HTMLDivElement;
  let handle: PooledTerminal | undefined;
  let ro: ResizeObserver | undefined;
  let terminalObserver: MutationObserver | undefined;
  let destroyed = false;
  let settleTimer: ReturnType<typeof setTimeout> | undefined;
  let keyboardOrigin: HTMLTextAreaElement | undefined;
  let terminalMenuGeneration: number | undefined;
  let terminalMenuOrigin: HTMLElement | undefined;

  // fit()은 xterm 버퍼를 새 폭으로 reflow하고, 이어지는 PTY resize는 zsh가
  // SIGWINCH로 프롬프트를 다시 그리게 한다. 드래그처럼 크기가 연속으로 바뀌면
  // 이 재배치가 매 프레임 반복되어 프롬프트가 여러 번 출력된다.
  // 따라서 드래그 중에는 아무것도 하지 않고, 크기가 멈춘 뒤 한 번만 fit()과
  // PTY resize를 수행한다(VS Code 터미널 등이 쓰는 트레일링 방식).
  const SETTLE_MS = 120;

  function scheduleResize(): void {
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => handle?.fitAndResize(), SETTLE_MS);
  }

  function resolveMountedTerminal(instance: PooledTerminal) {
    return !destroyed && handle === instance && instance.container.parentElement === el
      ? instance.term
      : undefined;
  }

  const terminalContextMenu = createContextMenuTrigger(terminalContextMenuModel);

  function terminalContextMenuModel() {
    const instance = handle;
    if (!instance) return { ariaLabel: t("contextMenu.terminal"), items: [] };

    const actions = instance.contextActions(() => resolveMountedTerminal(instance));
    return {
      ariaLabel: t("contextMenu.terminal"),
      items: [
        ...(actions.hasSelection
          ? [
              {
                type: "action" as const,
                id: "terminal-copy",
                label: t("contextMenu.copy"),
                onSelect: () => actions.copy(),
              },
            ]
          : []),
        {
          type: "action" as const,
          id: "terminal-paste",
          label: t("contextMenu.paste"),
          onSelect: () => actions.paste(),
        },
        {
          type: "action" as const,
          id: "terminal-select-all",
          label: t("contextMenu.selectAll"),
          onSelect: actions.selectAll.bind(actions),
        },
      ],
    };
  }

  function isolateRightClick(event: MouseEvent): void {
    if (event.button !== 2) return;
    event.preventDefault();
    event.stopPropagation();
  }

  function rememberTerminalMenu(origin: HTMLElement): void {
    const menu = contextMenu.snapshot();
    if (!menu || menu.origin !== origin) return;
    terminalMenuGeneration = menu.generation;
    terminalMenuOrigin = origin;
  }

  function openTerminalContextMenu(event: MouseEvent): void {
    if (!handle) return;
    event.stopPropagation();
    terminalContextMenu.oncontextmenu(event);
    rememberTerminalMenu(el);
  }

  function openTerminalTextareaContextMenu(event: MouseEvent): void {
    if (!handle) return;
    event.stopPropagation();
    terminalContextMenu.oncontextmenu(event);
    if (keyboardOrigin) rememberTerminalMenu(keyboardOrigin);
  }

  function openTerminalKeyboardContextMenu(event: KeyboardEvent): void {
    if (event.isComposing || (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10"))) return;
    terminalContextMenu.onkeydown(event);
    event.stopPropagation();
    if (keyboardOrigin) rememberTerminalMenu(keyboardOrigin);
  }

  function attachKeyboardOrigin(instance: PooledTerminal): void {
    keyboardOrigin = instance.container.querySelector<HTMLTextAreaElement>(".xterm-helper-textarea") ?? undefined;
    keyboardOrigin?.addEventListener("contextmenu", openTerminalTextareaContextMenu, true);
    keyboardOrigin?.addEventListener("keydown", openTerminalKeyboardContextMenu, true);
  }

  function detachKeyboardOrigin(): void {
    keyboardOrigin?.removeEventListener("contextmenu", openTerminalTextareaContextMenu, true);
    keyboardOrigin?.removeEventListener("keydown", openTerminalKeyboardContextMenu, true);
    keyboardOrigin = undefined;
  }

  function deactivateTerminalMenu(): void {
    if (
      terminalMenuGeneration !== undefined &&
      terminalMenuOrigin &&
      contextMenu.isCurrent(terminalMenuGeneration) &&
      contextMenu.origin === terminalMenuOrigin
    ) {
      closeContextMenu(terminalMenuGeneration, "deactivation");
    }
    terminalMenuGeneration = undefined;
    terminalMenuOrigin = undefined;
  }

  onMount(async () => {
    agentDetection.activate(sessionId);
    el.addEventListener("mousedown", isolateRightClick, true);
    el.addEventListener("contextmenu", openTerminalContextMenu);
    try {
      // 풀에서 살아있는 터미널을 얻는다. 재마운트면 기존 인스턴스가 그대로 반환돼
      // 버퍼(스크롤백)와 실행 중인 프로세스가 보존된다. 최초면 새로 생성한다.
      const instance = await terminalPool.acquire({ sessionId, cmd, cwd, initialPrompt });
      if (destroyed) return; // 생성 대기 중 언마운트된 경우: 붙이지 않는다(풀에 유지).
      handle = instance;
      el.appendChild(instance.container);
      instance.remount();
      attachKeyboardOrigin(instance);
      terminalObserver = new MutationObserver(() => {
        if (handle === instance && instance.container.parentElement !== el) deactivateTerminalMenu();
      });
      terminalObserver.observe(el, { childList: true });

      ro = new ResizeObserver(scheduleResize);
      ro.observe(el);
    } catch (reason) {
      agentDetection.deactivate(sessionId);
      actionErrors.report(reason);
    }
  });


  // 설정 store 변경 시 실행 중인 터미널에 즉시 반영한다.
  $effect(() => {
    const family = terminalSettings.fontFamily;
    const size = terminalSettings.fontSize;
    handle?.applyFont(family, size);
  });

  onDestroy(() => {
    agentDetection.deactivate(sessionId);
    destroyed = true;
    detachKeyboardOrigin();
    deactivateTerminalMenu();
    el.removeEventListener("mousedown", isolateRightClick, true);
    el.removeEventListener("contextmenu", openTerminalContextMenu);
    ro?.disconnect();
    terminalObserver?.disconnect();
    clearTimeout(settleTimer);
    // 세션은 풀이 소유하므로 종료하지 않는다. 컨테이너만 뷰포트에서 분리한다.
    if (handle && handle.container.parentElement === el) {
      el.removeChild(handle.container);
    }
  });
</script>

<div bind:this={el} class="h-full w-full"></div>
