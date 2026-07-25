<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import "@xterm/xterm/css/xterm.css";
  import { terminalSettings } from "$lib/stores/terminalSettings.svelte";
  import { terminalPool, type PooledTerminal } from "$lib/terminal/pool";
  import { openContextMenu } from "$lib/stores/contextMenu.svelte";
  import { t } from "$lib/i18n";
  import { actionErrors } from "$lib/stores/actionErrors.svelte";
  import { agentDetection } from "$lib/stores/agentDetection.svelte";

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
  let destroyed = false;
  let settleTimer: ReturnType<typeof setTimeout> | undefined;

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

  function isolateRightClick(event: MouseEvent): void {
    if (event.button !== 2) return;
    event.preventDefault();
    event.stopPropagation();
  }

  function openTerminalContextMenu(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    const instance = handle;
    if (!instance) return;

    const actions = instance.contextActions(() => resolveMountedTerminal(instance));
    openContextMenu({
      point: { x: event.clientX, y: event.clientY },
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
    });
  }

  onMount(async () => {
    agentDetection.activate(sessionId);
    el.addEventListener("mousedown", isolateRightClick, true);
    el.addEventListener("contextmenu", openTerminalContextMenu, true);
    try {
      // 풀에서 살아있는 터미널을 얻는다. 재마운트면 기존 인스턴스가 그대로 반환돼
      // 버퍼(스크롤백)와 실행 중인 프로세스가 보존된다. 최초면 새로 생성한다.
      const instance = await terminalPool.acquire({ sessionId, cmd, cwd, initialPrompt });
      if (destroyed) return; // 생성 대기 중 언마운트된 경우: 붙이지 않는다(풀에 유지).
      handle = instance;
      el.appendChild(instance.container);
      instance.remount();

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
    el.removeEventListener("mousedown", isolateRightClick, true);
    el.removeEventListener("contextmenu", openTerminalContextMenu, true);
    ro?.disconnect();
    clearTimeout(settleTimer);
    // 세션은 풀이 소유하므로 종료하지 않는다. 컨테이너만 뷰포트에서 분리한다.
    if (handle && handle.container.parentElement === el) {
      el.removeChild(handle.container);
    }
  });
</script>

<div bind:this={el} class="h-full w-full"></div>
