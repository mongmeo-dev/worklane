<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";
  import type { Project } from "$lib/types";
  import { projectStore } from "$lib/stores/projects.svelte";

  let { open = $bindable(false), project }: { open?: boolean; project: Project } = $props();

  let error = $state("");
  let loading = $state(false);

  async function confirm() {
    error = "";
    loading = true;
    try {
      await projectStore.removeProject(project.id);
      open = false;
    } catch (e) {
      error = String(e);
    } finally {
      loading = false;
    }
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content>
    <Dialog.Header>
      <Dialog.Title>프로젝트 삭제</Dialog.Title>
      <Dialog.Description>
        "{project.name}" 프로젝트를 삭제합니다. 하위 에이전트 {project.agents.length}개와 앱이 생성한
        worktree도 함께 제거됩니다.
      </Dialog.Description>
    </Dialog.Header>
    {#if error}
      <p class="text-xs text-destructive">{error}</p>
    {/if}
    <Dialog.Footer>
      <Button variant="ghost" onclick={() => (open = false)}>취소</Button>
      <Button variant="destructive" disabled={loading} onclick={confirm}>삭제</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
