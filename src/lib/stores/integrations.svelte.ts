const LINEAR_KEY = "integrations:linear-key";
const WEBHOOK_KEY = "integrations:webhook-url";

/** 외부 연동 자격 증명(Linear API 키, Slack/Discord 웹훅 URL). localStorage에 저장한다. */
class IntegrationsStore {
  #linearKey = $state("");
  #webhookUrl = $state("");

  get linearKey(): string {
    return this.#linearKey;
  }

  setLinearKey(value: string): void {
    this.#linearKey = value;
    if (typeof localStorage !== "undefined") localStorage.setItem(LINEAR_KEY, value);
  }

  get webhookUrl(): string {
    return this.#webhookUrl;
  }

  setWebhookUrl(value: string): void {
    this.#webhookUrl = value;
    if (typeof localStorage !== "undefined") localStorage.setItem(WEBHOOK_KEY, value);
  }

  init(): void {
    if (typeof localStorage === "undefined") return;
    const linear = localStorage.getItem(LINEAR_KEY);
    if (linear !== null) this.#linearKey = linear;
    const webhook = localStorage.getItem(WEBHOOK_KEY);
    if (webhook !== null) this.#webhookUrl = webhook;
  }
}

export const integrations = new IntegrationsStore();
