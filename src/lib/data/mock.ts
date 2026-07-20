import type { AgentKind, AgentStatus, Project } from "$lib/types";

/** 앱 셸 정적 레이아웃 시연용 mock 데이터. 실제 연동 시 교체된다. */
export const mockProjects: Project[] = [
  {
    id: "p1",
    name: "ai-agent-workspace",
    path: "~/development/personal/ai-agent-workspace",
    agents: [
      {
        id: "a1",
        title: "앱 셸 레이아웃 구현",
        kind: "claude-code",
        status: "running",
        branch: "feat/app-shell",
        worktreePath: ".",
        lastActivity: "방금 전",
      },
      {
        id: "a2",
        title: "PTY 상태 트래킹 설계",
        kind: "codex",
        status: "blocked",
        branch: "feat/pty-tracking",
        worktreePath: ".",
        lastActivity: "3분 전",
      },
      {
        id: "a3",
        title: "아이콘 세트 정리",
        kind: "gemini",
        status: "done",
        branch: "chore/icons",
        worktreePath: ".",
        lastActivity: "1시간 전",
      },
    ],
  },
  {
    id: "p2",
    name: "web-dashboard",
    path: "~/work/web-dashboard",
    agents: [
      {
        id: "a4",
        title: "차트 컴포넌트 마이그레이션",
        kind: "cursor",
        status: "running",
        branch: "feat/charts-v2",
        worktreePath: ".",
        lastActivity: "방금 전",
      },
      {
        id: "a5",
        title: "E2E 테스트 안정화",
        kind: "claude-code",
        status: "idle",
        branch: "test/e2e-flaky",
        worktreePath: ".",
        lastActivity: "12분 전",
      },
    ],
  },
];

export const agentKindLabels: Record<AgentKind, string> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  cursor: "Cursor",
  gemini: "Gemini",
};

export const statusLabels: Record<AgentStatus, string> = {
  running: "실행 중",
  idle: "대기",
  blocked: "입력 대기",
  done: "완료",
};
