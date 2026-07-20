<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import Plus from "@lucide/svelte/icons/plus";
  import Settings from "@lucide/svelte/icons/settings";
</script>

<!-- 상단 타이틀바. macOS 신호등 버튼 영역을 피하기 위해 좌측에 여백을 둔다. -->
<header
  class="flex h-11 shrink-0 items-center justify-between border-b bg-background pl-20 pr-3"
>
  <div class="flex items-center gap-2">
    <span class="text-sm font-semibold">AI Agent Workspace</span>
  </div>

  <div class="flex items-center gap-1">
    <Button variant="ghost" size="sm" class="gap-1.5">
      <Plus class="size-4" />
      새 에이전트
    </Button>
    <Button variant="ghost" size="icon" aria-label="설정">
      <Settings class="size-4" />
    </Button>
  </div>
</header>
