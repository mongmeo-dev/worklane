<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";

  let name = $state("");
  let greetMsg = $state("");

  async function greet(event: Event) {
    event.preventDefault();
    // Rust 백엔드의 `greet` 커맨드를 호출한다 (연동 확인용 샘플)
    greetMsg = await invoke("greet", { name });
  }
</script>

<main class="container">
  <h1>AI Agent Workspace</h1>
  <p class="subtitle">여러 CLI 코딩 에이전트를 병렬로 실행·관리하는 데스크톱 앱</p>

  <p class="hint">
    스캐폴딩이 정상 동작하는지 확인하는 샘플 화면입니다. 아래 입력은 Rust 백엔드와의 invoke
    연동을 시연합니다.
  </p>

  <form class="row" onsubmit={greet}>
    <input id="greet-input" placeholder="이름을 입력하세요..." bind:value={name} />
    <button type="submit">확인</button>
  </form>
  {#if greetMsg}
    <p class="greet-msg">{greetMsg}</p>
  {/if}
</main>
