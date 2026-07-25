const STORAGE_KEY = "preview:urls";

/** dev 서버 프리뷰의 기본 후보 URL. */
export const DEFAULT_PREVIEW_URL = "http://localhost:5173";

/** http/https URL만 프리뷰 대상으로 허용한다. */
export function parsePreviewUrl(value: string): string | null {
  const url = value.trim();
  if (!url) return null;

  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

type PreviewState = {
  draftUrl: string;
  persistedUrl: string;
  reloadRevision: number;
};

export type PreviewSnapshot = Readonly<PreviewState & { agentId: string }>;

/** 에이전트별 프리뷰 입력 상태와 iframe 재로딩 상태를 소유한다. */
class PreviewStore {
  #previews = $state<Record<string, PreviewState>>({});

  get(agentId: string): string {
    return this.snapshot(agentId).draftUrl;
  }

  snapshot(agentId: string): PreviewSnapshot {
    const preview = this.#previews[agentId];
    return {
      agentId,
      draftUrl: preview?.draftUrl ?? "",
      persistedUrl: preview?.persistedUrl ?? "",
      reloadRevision: preview?.reloadRevision ?? 0,
    };
  }

  setDraft(agentId: string, url: string): void {
    const preview = this.snapshot(agentId);
    this.#previews = {
      ...this.#previews,
      [agentId]: {
        draftUrl: url,
        persistedUrl: preview.persistedUrl,
        reloadRevision: preview.reloadRevision,
      },
    };
  }

  persist(agentId: string, url = this.snapshot(agentId).draftUrl): void {
    const preview = this.snapshot(agentId);
    const draftUrl = url.trim();
    const persistedUrl = parsePreviewUrl(draftUrl) ?? "";
    this.#previews = {
      ...this.#previews,
      [agentId]: {
        draftUrl,
        persistedUrl,
        reloadRevision: preview.reloadRevision,
      },
    };
    this.save();
  }

  reload(target: string | PreviewSnapshot): void {
    const agentId = typeof target === "string" ? target : target.agentId;
    const current = this.snapshot(agentId);
    const draftUrl = current.draftUrl.trim();
    const persistedUrl = parsePreviewUrl(draftUrl) ?? "";
    this.#previews = {
      ...this.#previews,
      [agentId]: {
        draftUrl,
        persistedUrl,
        reloadRevision: current.reloadRevision + 1,
      },
    };
    this.save();
  }

  /** 이전 호출자 호환용으로 draft와 persisted URL을 함께 갱신한다. */
  set(agentId: string, url: string): void {
    this.persist(agentId, url);
  }

  init(): void {
    if (typeof localStorage === "undefined") return;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== "object") return;

      const urls = Object.entries(parsed).reduce<Record<string, PreviewState>>((result, [agentId, url]) => {
        if (typeof url === "string") {
          const previewUrl = parsePreviewUrl(url);
          if (previewUrl) {
            result[agentId] = { draftUrl: previewUrl, persistedUrl: previewUrl, reloadRevision: 0 };
          }
        }
        return result;
      }, {});
      this.#previews = urls;
    } catch {
      // 손상값은 무시하고 빈 상태 유지
    }
  }

  private save(): void {
    if (typeof localStorage === "undefined") return;
    const urls = Object.fromEntries(
      Object.entries(this.#previews).map(([agentId, preview]) => [agentId, preview.persistedUrl]),
    );
    localStorage.setItem(STORAGE_KEY, JSON.stringify(urls));
  }
}

export const previewStore = new PreviewStore();
