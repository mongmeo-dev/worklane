import { openUrl } from "@tauri-apps/plugin-opener";
import { t } from "$lib/i18n";
import { parsePreviewUrl, previewStore, type PreviewSnapshot } from "$lib/stores/preview.svelte";
import type { ContextMenuModel } from "$lib/context-menu/model";

export type PreviewContextActions = {
  reload: () => void;
  openBrowser: () => Promise<void>;
  menu: ContextMenuModel;
};

/** 메뉴가 열리는 순간의 프리뷰 상태만 대상으로 하는 액션을 만든다. */
export function createPreviewContextActions(snapshot: PreviewSnapshot): PreviewContextActions {
  const url = parsePreviewUrl(snapshot.draftUrl);
  const reload = () => previewStore.reload(snapshot.agentId);
  const openBrowser = (): Promise<void> => (url ? openUrl(url) : Promise.resolve());

  return {
    reload,
    openBrowser,
    menu: {
      ariaLabel: t("agentDetail.preview"),
      items: [
        { type: "action", id: "preview.reload", label: t("preview.refresh"), onSelect: reload },
        {
          type: "action",
          id: "preview.open-browser",
          label: t("preview.openBrowser"),
          onSelect: openBrowser,
          disabled: !url,
        },
      ],
    },
  };
}
