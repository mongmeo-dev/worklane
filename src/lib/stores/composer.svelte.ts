/** 팬아웃 다이얼로그를 시드(제목/프롬프트)와 함께 여는 공용 컨트롤러. */
export interface FanoutSeed {
  projectId?: string | null;
  title: string;
  prompt: string;
}

class Composer {
  #fanoutOpen = $state(false);
  #seed = $state<FanoutSeed | null>(null);

  get fanoutOpen(): boolean {
    return this.#fanoutOpen;
  }
  get seed(): FanoutSeed | null {
    return this.#seed;
  }

  /** 팬아웃을 연다. seed가 있으면 제목/프롬프트를 미리 채운다. */
  openFanout(seed: FanoutSeed | null = null): void {
    this.#seed = seed;
    this.#fanoutOpen = true;
  }

  setFanoutOpen(open: boolean): void {
    this.#fanoutOpen = open;
    if (!open) this.#seed = null;
  }
}

export const composer = new Composer();
