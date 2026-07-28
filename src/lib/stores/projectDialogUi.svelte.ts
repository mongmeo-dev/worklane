/**
 * 프로젝트 추가 다이얼로그의 열림 상태.
 *
 * 예전에는 다이얼로그가 Sidebar 안에만 마운트돼 있어서, 사이드바를 닫은 채로
 * 재시작하면 프로젝트를 추가할 수단이 전혀 없었다. 상태를 스토어로 올려
 * 오버뷰 빈 화면·명령 팔레트 등 어디서든 열 수 있게 한다.
 */
class ProjectDialogUiStore {
  #isOpen = $state(false);

  get isOpen(): boolean {
    return this.#isOpen;
  }

  open(): void {
    this.#isOpen = true;
  }

  setOpen(open: boolean): void {
    this.#isOpen = open;
  }

  close(): void {
    this.#isOpen = false;
  }
}

export const projectDialogUi = new ProjectDialogUiStore();
