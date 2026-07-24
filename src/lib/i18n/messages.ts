// UI 문자열 카탈로그. `en`을 키의 원천으로 삼아 `ko`가 모든 키를 갖도록 타입으로 강제한다.
// 기본 로케일은 한국어이며, 값은 기존 UI 문구를 그대로 옮긴 것이다.
// 보간은 {name} 형태의 자리표시자를 사용한다(t()에서 치환).

export const en = {
  // 공통
  "common.add": "Add",
  "common.adding": "Adding…",
  "common.save": "Save",
  "common.saved": "Saved",
  "common.cancel": "Cancel",
  "common.delete": "Delete",
  "common.edit": "Edit",
  "common.update": "Update",
  "common.open": "Open",
  "common.select": "Choose",
  "common.loading": "Loading…",
  "common.retry": "Retry",
  "common.waitingActivity": "Idle",

  // 상태
  "status.running": "Running",
  "status.idle": "Idle",
  "status.blocked": "Waiting",
  "status.done": "Done",

  // 터미널
  "terminal.hint": "esc to stop · ⌥⏎ newline",

  // 상태 칩
  "statusChips.nav": "All agent statuses",
  "statusChips.view": "View {count} {label}",

  // 오버뷰
  "overview.title": "Overview",
  "overview.summary": "{agents} agents · {projects} projects",
  "overview.searchPlaceholder": "Search",
  "overview.searchAria": "Search agents",
  "overview.sort.activity": "Recent",
  "overview.sort.status": "Status",
  "overview.sort.name": "Name",
  "overview.filter.all": "All",
  "overview.filter.running": "Running",
  "overview.filter.blocked": "Waiting",
  "overview.filter.done": "Done",
  "overview.previewPlaceholder": "Recent output appears when you open the session.",
  "overview.empty": "No agents to show.",
  "overview.showAll": "Show all agents",
  "overview.action.running": "Open →",
  "overview.action.blocked": "Respond →",
  "overview.action.idle": "Resume →",
  "overview.action.done": "Review changes →",

  // 타이틀바
  "titleBar.leftPanel.close": "Collapse left panel",
  "titleBar.leftPanel.open": "Expand left panel",
  "titleBar.rightPanel.close": "Collapse file panel",
  "titleBar.rightPanel.open": "Expand file panel",
  "titleBar.palette": "Open command palette",
  "titleBar.tasks": "Tasks",
  "titleBar.newAgent": "New agent",
  "titleBar.fanout": "Fan-out",
  "titleBar.settings": "Settings",

  // 사이드바
  "sidebar.heading": "Projects & agents",
  "sidebar.addProject": "Add project",
  "sidebar.overview": "Overview",
  "sidebar.addAgentTo": "Add agent to {project}",
  "sidebar.deleteProject": "Delete {project}",
  "sidebar.recreateDefault": "Recreate default workspace",
  "sidebar.shared": "Shared · {count} agents",
  "sidebar.deleteAgent": "Delete {agent}",
  "sidebar.empty": "No projects yet.",

  // 주의 필요 인박스
  "attention.openCount": "Open {count} items needing attention",
  "attention.bell": "Attention notifications",
  "attention.inboxAria": "Attention inbox",
  "attention.heading": "Needs attention",
  "attention.allProjects": "All projects",
  "attention.blockedCount": "Waiting {count}",
  "attention.doneCount": "Done {count}",
  "attention.empty": "No agents need attention right now.",

  // 명령 팔레트
  "palette.placeholder": "Jump to an agent or search commands…",
  "palette.aria": "Command palette",
  "palette.empty": "No results.",
  "palette.action.overview.label": "Overview",
  "palette.action.overview.hint": "Go",
  "palette.action.newAgent.label": "New agent",
  "palette.action.newAgent.hint": "Create",
  "palette.action.fanout.label": "Fan-out",
  "palette.action.fanout.hint": "Create",
  "palette.action.tasks.label": "Task board",
  "palette.action.tasks.hint": "Open",
  "palette.action.settings.label": "Settings",
  "palette.action.settings.hint": "Open",

  // 설정 다이얼로그
  "settings.title": "Settings",
  "settings.nav": "Settings categories",
  "settings.tab.screen": "Screen",
  "settings.tab.agents": "Agents",
  "settings.tab.prompts": "Prompts",
  "settings.tab.usage": "Usage",
  "settings.tab.integrations": "Integrations",

  // 설정 · 화면
  "settings.screen.language.title": "Language",
  "settings.screen.language.desc": "Choose the app's display language.",
  "settings.screen.theme.title": "Theme",
  "settings.screen.theme.desc": "Choose Worklane's color mode.",
  "settings.screen.theme.light": "Light",
  "settings.screen.theme.dark": "Dark",
  "settings.screen.theme.system": "System",
  "settings.screen.font.title": "Terminal font",
  "settings.screen.font.desc": "Enter an installed monospace font name.",
  "settings.screen.fontSize.title": "Terminal font size",
  "settings.screen.fontSize.desc": "Applies immediately to open terminals.",
  "settings.screen.fontSize.decrease": "Decrease font size",
  "settings.screen.fontSize.increase": "Increase font size",

  // 설정 · 에이전트
  "settings.agents.intro":
    "When you create a new agent, choosing a kind auto-fills its run command below. Add or remove kinds, and edit names and default commands right here.",
  "settings.agents.kindsHeading": "Agent kinds",
  "settings.agents.kindNameLabel": "Kind name",
  "settings.agents.commandPlaceholder": "Run command",
  "settings.agents.defaultCommandLabel": "Default run command",
  "settings.agents.removeKind": "Delete {label}",
  "settings.agents.dragHandle": "Drag to reorder {label}",
  "settings.agents.empty": "No agent kinds registered. Add a new kind below.",
  "settings.agents.newNamePlaceholder": "Name (e.g. Aider)",
  "settings.agents.newNameLabel": "New kind name",
  "settings.agents.newCommandPlaceholder": "Run command (e.g. aider)",
  "settings.agents.newCommandLabel": "New kind run command",
  "settings.agents.autoCheckpointHeading": "Auto checkpoint",
  "settings.agents.autoSaveTitle": "Auto-save on completion",
  "settings.agents.autoSaveDesc":
    "When an agent finishes, its worktree state is saved as a checkpoint. It's also always auto-saved before a rollback.",

  // 설정 · 연동
  "settings.integrations.githubNotePre": "GitHub issues and PRs use the ",
  "settings.integrations.githubNotePost":
    " CLI, so no extra key is needed. Linear connects via a personal API key.",
  "settings.integrations.linearKeyHeading": "Linear API key",
  "settings.integrations.issueKey": "Get a key",
  "settings.integrations.linearKeyAria": "Linear API key",
  "settings.integrations.linearKeyDesc":
    "The key is stored only on this device and is used when loading Linear issues in the fan-out dialog.",
  "settings.integrations.webhookHeading": "Slack / Discord webhook",
  "settings.integrations.webhookPlaceholder":
    "https://hooks.slack.com/... or https://discord.com/api/webhooks/...",
  "settings.integrations.webhookAria": "Slack/Discord webhook URL",
  "settings.integrations.webhookDesc":
    "Input-waiting/done transitions and usage budget overruns are also sent to this webhook. Slack/Discord is detected automatically from the URL.",
  "settings.integrations.updateHeading": "App update",
  "settings.integrations.checking": "Checking…",
  "settings.integrations.checkUpdate": "Check for updates",
  "settings.integrations.updateAvailable":
    "Version {version} is available. Install it from the banner at the bottom right.",

  // 설정 · 프롬프트
  "settings.prompts.intro":
    "Save instructions for repetitive tasks so you can reuse them when fanning out or creating agents.",
  "settings.prompts.newHeading": "New prompt",
  "settings.prompts.titlePlaceholder": "Title (e.g. Release prep)",
  "settings.prompts.bodyPlaceholder": "Prompt body",
  "settings.prompts.savedHeading": "Saved prompts · {count}",
  "settings.prompts.empty": "No saved prompts.",

  // 설정 · 사용량
  "settings.usage.intro":
    "When a CLI provider's usage exceeds the threshold below, a warning appears in the status bar and an OS notification fires. This helps you stay ahead of billing limits during long multi-project runs.",
  "settings.usage.thresholdHeading": "Budget warning threshold",
  "settings.usage.thresholdAria": "Budget warning threshold (percent)",
  "settings.usage.thresholdDesc":
    "Warns when usage reaches {value}% or more. It's based on account-level usage and applies only to supported providers (Claude Code and Codex).",

  // 상태바 · 사용량
  "usage.label": "Usage",
  "usage.notConnected": "Not connected",
  "usage.resetUnknown": "Reset time unknown",
  "usage.overBudgetAria": "Over {threshold}% budget",
  "usage.budgetCrossTitle": "{name} usage {percent}%",
  "usage.budgetCrossBody": "Exceeded the {threshold}% budget threshold.",
  "usage.tier.anthropic": "Anthropic account",
  "usage.tier.openai": "OpenAI account",
  "usage.tier.cursor": "Cursor account",
  "usage.tier.google": "Google account",

  // 사용량 팝오버
  "usagePopover.detailAria": "{name} usage details",
  "usagePopover.planUnknown": "Plan unknown",
  "usagePopover.accountUnknown": "Account info unavailable.",
  "usagePopover.claudeHint":
    "Usage appears once the status line integration runs in a Claude Code session.",
  "usagePopover.noSource": "This CLI doesn't provide a reliable local usage source.",
  "usagePopover.cliAccount": "CLI account",
  "usagePopover.openDashboard": "Open dashboard",

  // 업데이트 배너
  "updateBanner.newVersion": "Version {version}",
  "updateBanner.desc": "Installs the update and restarts the app.",
  "updateBanner.later": "Later",
  "updateBanner.installing": "Installing…",
  "updateBanner.installRestart": "Install & restart",

  // 체크포인트
  "checkpoints.button": "Checkpoints",
  "checkpoints.labelPlaceholder": "Label (optional)",
  "checkpoints.saveNow": "Save now",
  "checkpoints.empty": "No saved checkpoints.",
  "checkpoints.confirmRollback": "Confirm rollback",
  "checkpoints.rollbackTo": "Roll back to this checkpoint",
  "checkpoints.deleteAria": "Delete checkpoint",
  "checkpoints.note": "Rollback restores only tracked file changes to the snapshot.",

  // 타임라인
  "timeline.button": "Timeline",
  "timeline.sessionAria": "Session timeline",
  "timeline.heading": "Activity timeline",
  "timeline.empty": "No recorded activity.",
  "timeline.kind.commit": "Commit",
  "timeline.kind.push": "Push",
  "timeline.kind.pr": "PR",
  "timeline.kind.verify": "Verify",
  "timeline.kind.checkpoint": "Checkpoint",
  "timeline.kind.rollback": "Rollback",
  "timeline.kind.status": "Status",
  "timeline.kind.adopt": "Adopt",
  "timeline.kind.fanout": "Fan-out",

  // PR 패널
  "prPanel.aria": "PR status",
  "prPanel.none": "No PR for this branch.",
  "prPanel.conflicting": "Conflict",
  "prPanel.openInBrowser": "Open in browser",
  "prPanel.stateStatus": "This PR is {state}.",

  // 검토 · 커밋
  "review.heading": "Review · Commit",
  "review.changed": "{count} changed",
  "review.commitPlaceholder": "Commit message",
  "review.noChanges": "No changes to commit",
  "review.committing": "Committing",
  "review.commit": "Commit",
  "review.committed": "Committed.",
  "review.pushing": "Pushing",
  "review.push": "Push",
  "review.pushDone": "Pushed · {branch}",
  "review.opening": "Opening",
  "review.prOpened": "Opened the PR.",
  "review.compareOpened": "Opened the GitHub compare page.",
  "review.mergeInto": "Merge into {base}",
  "review.mergeToBase": "Merge into base branch",
  "review.merging": "Checking…",
  "review.alreadyMerged": "Already merged into {base}.",
  "review.conflictSummary": "{count} conflicts · {list}",
  "review.noRemote": "No origin remote, so push and PR are unavailable.",
  "review.publishBranch": "Publish branch",
  "review.pushAhead": "Push {count}",
  "review.pushed": "Pushed",

  // 팬아웃
  "fanout.title": "Fan-out — {project}",
  "fanout.desc": "Branch one task across multiple agents in parallel and compare the results.",
  "fanout.playbook": "Playbook",
  "fanout.load": "Load",
  "fanout.playbookItem": "{name} · {count}",
  "fanout.deletePlaybook": "Delete playbook",
  "fanout.saveCurrent": "Save current setup",
  "fanout.taskName": "Task name",
  "fanout.githubIssue": "GitHub issue",
  "fanout.loadingIssues": "Loading issues…",
  "fanout.noOpenIssues": "No open issues.",
  "fanout.noAssignedIssues": "No assigned issues.",
  "fanout.titlePlaceholder": "e.g. Refactor login",
  "fanout.promptOptional": "Prompt (optional)",
  "fanout.library": "Library",
  "fanout.promptPlaceholder": "Instructions to send each agent. You can copy them from the compare view.",
  "fanout.startPoint": "Branch point (start-point)",
  "fanout.startPlaceholder": "e.g. main",
  "fanout.agentsSelect": "Agents (select 2 or more)",
  "fanout.selectKind": "Select {kind}",
  "fanout.kindCommand": "{kind} run command",
  "fanout.creating": "Creating…",
  "fanout.createAgents": "Create {count} agents",
  "fanout.untitledPrompt": "Untitled prompt",
  "fanout.logCreated": "Fan-out created · {title}",

  // 비교
  "compare.title": "Compare results · {title}",
  "compare.desc": "{project} · {count} agents running in parallel",
  "compare.copied": "Copied",
  "compare.copyPrompt": "Copy prompt",
  "compare.verifyPlaceholder": "Verify command (e.g. pnpm test)",
  "compare.verifyAria": "Verify command",
  "compare.verifying": "Verifying…",
  "compare.runVerify": "Run verify",
  "compare.recommended": "Recommended",
  "compare.loading": "Loading…",
  "compare.files": "Files",
  "compare.noChangeInfo": "Change info unavailable",
  "compare.verifyFailed": "Verification failed to run",
  "compare.pass": "Pass",
  "compare.fail": "Fail",
  "compare.output": "Output",
  "compare.adoptClean": "Adopt and clean up the rest",
  "compare.adopt": "Adopt",
  "compare.adoptLog": "Adopted result (cleaned up the rest)",
  "compare.verifyLog": "{result} · {command}",

  // 태스크 보드
  "taskBoard.status.todo": "To do",
  "taskBoard.status.doing": "Doing",
  "taskBoard.status.done": "Done",
  "taskBoard.title": "Task board",
  "taskBoard.desc": "Plan work across projects in one place and start execution with fan-out.",
  "taskBoard.newTitle": "New task title",
  "taskBoard.newNotes": "Notes/prompt (optional)",
  "taskBoard.projectAria": "Select project",
  "taskBoard.noProject": "No project",
  "taskBoard.prev": "Move to previous status",
  "taskBoard.next": "Move to next status",
  "taskBoard.fanout": "Fan-out",

  // 에이전트 추가 다이얼로그
  "agentDialog.title": "Add agent — {project}",
  "agentDialog.taskName": "Task name (optional)",
  "agentDialog.taskNamePlaceholder": "Leave blank to use the branch name",
  "agentDialog.kind": "Kind",
  "agentDialog.command": "Run command",
  "agentDialog.commandOptional": "Run command (optional)",
  "agentDialog.commandPlaceholderShell": "Leave blank to open the default shell",
  "agentDialog.worktreeNew": "Create new worktree",
  "agentDialog.worktreeShare": "Share {branch}",
  "agentDialog.worktreeExisting": "existing worktree",
  "agentDialog.sharedNote": "Uses the same physical worktree as the selected agent.",
  "agentDialog.branch": "Branch",
  "agentDialog.branchPlaceholder": "e.g. feat/login",
  "agentDialog.startPoint": "Branch point (start-point)",
  "agentDialog.startPlaceholder": "e.g. main",
  "agentDialog.worktreePath": "Worktree path (auto-generated if blank)",
  "agentDialog.worktreePathPlaceholder": "Optional",

  // 기본 작업환경 다시 만들기
  "defaultWorkspace.title": "Recreate default workspace — {project}",
  "defaultWorkspace.desc":
    "Recreates the default workspace that runs on the repository's current checkout branch.",
  "defaultWorkspace.recreate": "Recreate",

  // 에이전트 삭제
  "deleteAgent.title": "Delete agent",
  "deleteAgent.desc": "Deletes \"{title}\".",
  "deleteAgent.worktreeNote": "The app-created worktree ({branch}) will also be removed.",
  "deleteAgent.hasChanges": "This worktree has uncommitted changes.",
  "deleteAgent.dontAsk": "Don't ask again; safely remove automatically",
  "deleteAgent.force": "Force delete",

  // 프로젝트 삭제
  "deleteProject.title": "Delete project",
  "deleteProject.desc":
    "Deletes project \"{name}\". Its {count} agents and app-created worktrees will also be removed.",

  // 프로젝트 추가
  "projectDialog.title": "Add project",
  "projectDialog.name": "Name",
  "projectDialog.namePlaceholder": "Project name",
  "projectDialog.firstAgent": "First workspace agent",
  "projectDialog.firstAgentNote":
    "Uses the existing project directory and current checkout branch as-is.",
  "projectDialog.path": "Path",
  "projectDialog.pathPlaceholder": "Local repository path",

  // 에이전트 상세
  "agentDetail.backOverview": "Back to overview",
  "agentDetail.sharedWorktree": "Shared worktree · {count} agents",
  "agentDetail.compare": "Compare · {count}",
  "agentDetail.blockedTitle": "The agent is waiting for input",
  "agentDetail.blockedDesc": "Respond in the terminal to continue.",
  "agentDetail.goTerminal": "Go to terminal",
  "agentDetail.terminal": "Terminal",
  "agentDetail.closeFileTab": "Close file tab",
  "agentDetail.preview": "Preview",

  // 파일 뷰어
  "fileViewer.new": "New",
  "fileViewer.deleted": "Deleted",
  "fileViewer.modified": "Modified",
  "fileViewer.lastEdited": "Last edited · {title}",
  "fileViewer.loading": "Loading file…",
  "fileViewer.binary": "Binary files can't be previewed.",
  "fileViewer.readonly": "Read-only preview · worktree file",
  "fileViewer.readError": "Couldn't read the file.",

  // 파일 패널
  "filePanel.heading": "Files",
  "filePanel.fileCount": "{count} files",
  "filePanel.refresh": "Refresh file list",
  "filePanel.sharedNote": "Shows the combined changes of the shared worktree.",
  "filePanel.loading": "Loading files…",
  "filePanel.empty": "No files to show.",

  // 프리뷰
  "preview.urlAria": "Preview URL",
  "preview.detectPorts": "Detect dev server ports",
  "preview.noPorts": "No ports detected.",
  "preview.refresh": "Reload",
  "preview.openBrowser": "Open in browser",
  "preview.frameTitle": "Live preview · {title}",
  "preview.emptyMain": "Enter a dev server URL to see the preview.",
  "preview.emptyExample": "e.g. {url}",

  // 외부 앱으로 열기
  "openExternal.finder": "File manager",
  "openExternal.aria": "Open in external app",

  // 알림
  "notify.blocked": "Waiting",
  "notify.done": "Done",
  "notify.blockedBody": "An agent in {project} is waiting for input.",
  "notify.doneBody": "An agent in {project} finished its task.",

  // 에이전트 종류
  "agentKind.terminal": "Blank terminal",
  "agentKind.nameRequired": "Please enter a kind name.",
  "update.upToDate": "You're on the latest version.",
  "checkpoints.autoLabel": "Auto (completed)",
} as const;

export type MessageKey = keyof typeof en;

export const ko: Record<MessageKey, string> = {
  // 공통
  "common.add": "추가",
  "common.adding": "추가 중…",
  "common.save": "저장",
  "common.saved": "저장됨",
  "common.cancel": "취소",
  "common.delete": "삭제",
  "common.edit": "수정",
  "common.update": "수정",
  "common.open": "열기",
  "common.select": "선택",
  "common.loading": "불러오는 중…",
  "common.retry": "다시 시도",
  "common.waitingActivity": "대기 중",

  // 상태
  "status.running": "실행 중",
  "status.idle": "대기",
  "status.blocked": "입력 대기",
  "status.done": "완료",

  // 터미널
  "terminal.hint": "esc 중단 · ⌥⏎ 줄바꿈",

  // 상태 칩
  "statusChips.nav": "전체 에이전트 상태",
  "statusChips.view": "{label} {count}개 보기",

  // 오버뷰
  "overview.title": "전체 오버뷰",
  "overview.summary": "{agents}개 에이전트 · {projects}개 프로젝트",
  "overview.searchPlaceholder": "검색",
  "overview.searchAria": "에이전트 검색",
  "overview.sort.activity": "최근",
  "overview.sort.status": "상태",
  "overview.sort.name": "이름",
  "overview.filter.all": "전체",
  "overview.filter.running": "실행 중",
  "overview.filter.blocked": "입력 대기",
  "overview.filter.done": "완료",
  "overview.previewPlaceholder": "세션을 열면 최근 출력이 표시됩니다.",
  "overview.empty": "표시할 에이전트가 없습니다.",
  "overview.showAll": "전체 에이전트 보기",
  "overview.action.running": "열기 →",
  "overview.action.blocked": "응답하기 →",
  "overview.action.idle": "재개 →",
  "overview.action.done": "변경 검토 →",

  // 타이틀바
  "titleBar.leftPanel.close": "왼쪽 패널 닫기",
  "titleBar.leftPanel.open": "왼쪽 패널 열기",
  "titleBar.rightPanel.close": "파일 패널 닫기",
  "titleBar.rightPanel.open": "파일 패널 열기",
  "titleBar.palette": "명령 팔레트 열기",
  "titleBar.tasks": "태스크",
  "titleBar.newAgent": "새 에이전트",
  "titleBar.fanout": "팬아웃",
  "titleBar.settings": "설정",

  // 사이드바
  "sidebar.heading": "프로젝트 & 에이전트",
  "sidebar.addProject": "프로젝트 추가",
  "sidebar.overview": "전체 오버뷰",
  "sidebar.addAgentTo": "{project}에 에이전트 추가",
  "sidebar.deleteProject": "{project} 삭제",
  "sidebar.recreateDefault": "기본 작업환경 다시 만들기",
  "sidebar.shared": "공유 · {count} 에이전트",
  "sidebar.deleteAgent": "{agent} 삭제",
  "sidebar.empty": "아직 프로젝트가 없습니다.",

  // 주의 필요 인박스
  "attention.openCount": "주의 필요 {count}건 열기",
  "attention.bell": "주의 필요 알림",
  "attention.inboxAria": "주의 필요 인박스",
  "attention.heading": "주의 필요",
  "attention.allProjects": "전체 프로젝트",
  "attention.blockedCount": "입력 {count}",
  "attention.doneCount": "완료 {count}",
  "attention.empty": "지금 주의가 필요한 에이전트가 없습니다.",

  // 명령 팔레트
  "palette.placeholder": "에이전트 이동 또는 명령 검색…",
  "palette.aria": "명령 팔레트",
  "palette.empty": "결과가 없습니다.",
  "palette.action.overview.label": "전체 오버뷰",
  "palette.action.overview.hint": "이동",
  "palette.action.newAgent.label": "새 에이전트",
  "palette.action.newAgent.hint": "생성",
  "palette.action.fanout.label": "팬아웃",
  "palette.action.fanout.hint": "생성",
  "palette.action.tasks.label": "태스크 보드",
  "palette.action.tasks.hint": "열기",
  "palette.action.settings.label": "설정",
  "palette.action.settings.hint": "열기",

  // 설정 다이얼로그
  "settings.title": "설정",
  "settings.nav": "설정 분류",
  "settings.tab.screen": "화면",
  "settings.tab.agents": "에이전트",
  "settings.tab.prompts": "프롬프트",
  "settings.tab.usage": "사용량",
  "settings.tab.integrations": "연동",

  // 설정 · 화면
  "settings.screen.language.title": "언어",
  "settings.screen.language.desc": "앱에 표시되는 언어를 선택합니다.",
  "settings.screen.theme.title": "테마",
  "settings.screen.theme.desc": "Worklane의 화면 색상 모드를 선택합니다.",
  "settings.screen.theme.light": "라이트",
  "settings.screen.theme.dark": "다크",
  "settings.screen.theme.system": "시스템",
  "settings.screen.font.title": "터미널 폰트",
  "settings.screen.font.desc": "설치된 고정폭 폰트 이름을 입력합니다.",
  "settings.screen.fontSize.title": "터미널 폰트 크기",
  "settings.screen.fontSize.desc": "열려 있는 터미널에 바로 적용됩니다.",
  "settings.screen.fontSize.decrease": "폰트 크기 줄이기",
  "settings.screen.fontSize.increase": "폰트 크기 늘리기",

  // 설정 · 에이전트
  "settings.agents.intro":
    "새 에이전트를 만들 때 종류를 선택하면 아래 실행 커맨드가 자동으로 입력됩니다. 종류를 직접 추가하거나 삭제하고, 이름·기본 커맨드를 바로 수정할 수 있습니다.",
  "settings.agents.kindsHeading": "에이전트 종류",
  "settings.agents.kindNameLabel": "종류 이름",
  "settings.agents.commandPlaceholder": "실행 커맨드",
  "settings.agents.defaultCommandLabel": "기본 실행 커맨드",
  "settings.agents.removeKind": "{label} 삭제",
  "settings.agents.dragHandle": "{label} 드래그로 순서 변경",
  "settings.agents.empty": "등록된 에이전트 종류가 없습니다. 아래에서 새 종류를 추가하세요.",
  "settings.agents.newNamePlaceholder": "이름 (예: Aider)",
  "settings.agents.newNameLabel": "새 종류 이름",
  "settings.agents.newCommandPlaceholder": "실행 커맨드 (예: aider)",
  "settings.agents.newCommandLabel": "새 종류 실행 커맨드",
  "settings.agents.autoCheckpointHeading": "자동 체크포인트",
  "settings.agents.autoSaveTitle": "완료 시 자동 저장",
  "settings.agents.autoSaveDesc":
    "에이전트가 작업을 마치면 worktree 상태를 체크포인트로 저장합니다. 되돌리기 전에도 항상 자동 저장됩니다.",

  // 설정 · 연동
  "settings.integrations.githubNotePre": "GitHub 이슈·PR은 ",
  "settings.integrations.githubNotePost": " CLI를 사용하며 별도 키가 필요 없습니다. Linear는 개인 API 키로 연동합니다.",
  "settings.integrations.linearKeyHeading": "Linear API 키",
  "settings.integrations.issueKey": "키 발급",
  "settings.integrations.linearKeyAria": "Linear API 키",
  "settings.integrations.linearKeyDesc":
    "키는 이 기기에만 저장되며, 팬아웃 다이얼로그에서 Linear 이슈를 불러올 때 사용됩니다.",
  "settings.integrations.webhookHeading": "Slack / Discord 웹훅",
  "settings.integrations.webhookPlaceholder":
    "https://hooks.slack.com/... 또는 https://discord.com/api/webhooks/...",
  "settings.integrations.webhookAria": "Slack/Discord 웹훅 URL",
  "settings.integrations.webhookDesc":
    "입력 대기·완료 전이와 사용량 예산 초과 시 이 웹훅으로도 알림을 보냅니다. URL로 Slack/Discord를 자동 판별합니다.",
  "settings.integrations.updateHeading": "앱 업데이트",
  "settings.integrations.checking": "확인 중…",
  "settings.integrations.checkUpdate": "업데이트 확인",
  "settings.integrations.updateAvailable": "새 버전 {version}이 있습니다. 우하단 배너에서 설치하세요.",

  // 설정 · 프롬프트
  "settings.prompts.intro":
    "반복 작업의 지시문을 저장해 두면 팬아웃·에이전트 생성 시 불러와 재사용할 수 있습니다.",
  "settings.prompts.newHeading": "새 프롬프트",
  "settings.prompts.titlePlaceholder": "제목 (예: 릴리스 준비)",
  "settings.prompts.bodyPlaceholder": "프롬프트 본문",
  "settings.prompts.savedHeading": "저장된 프롬프트 · {count}",
  "settings.prompts.empty": "저장된 프롬프트가 없습니다.",

  // 설정 · 사용량
  "settings.usage.intro":
    "CLI 제공자의 사용량이 아래 임계값을 넘으면 상태바에 경고가 표시되고 OS 알림이 발생합니다. 여러 프로젝트를 오래 운용할 때 과금 한도에 미리 대응할 수 있습니다.",
  "settings.usage.thresholdHeading": "예산 경고 임계값",
  "settings.usage.thresholdAria": "예산 경고 임계값(퍼센트)",
  "settings.usage.thresholdDesc":
    "사용량이 {value}% 이상이 되면 경고합니다. 계정 단위 사용량을 기준으로 하며, 지원되는 제공자(Claude Code·Codex)에만 적용됩니다.",

  // 상태바 · 사용량
  "usage.label": "사용량",
  "usage.notConnected": "연동 안 됨",
  "usage.resetUnknown": "초기화 시점 미확인",
  "usage.overBudgetAria": "예산 {threshold}% 초과",
  "usage.budgetCrossTitle": "{name} 사용량 {percent}%",
  "usage.budgetCrossBody": "예산 임계값 {threshold}%를 넘었습니다.",
  "usage.tier.anthropic": "Anthropic 계정",
  "usage.tier.openai": "OpenAI 계정",
  "usage.tier.cursor": "Cursor 계정",
  "usage.tier.google": "Google 계정",

  // 사용량 팝오버
  "usagePopover.detailAria": "{name} 사용량 상세",
  "usagePopover.planUnknown": "플랜 미확인",
  "usagePopover.accountUnknown": "계정 정보를 확인할 수 없습니다.",
  "usagePopover.claudeHint": "Claude Code 세션에서 상태 줄 연동이 실행되면 사용량이 표시됩니다.",
  "usagePopover.noSource": "이 CLI는 신뢰할 수 있는 로컬 사용량 소스를 제공하지 않습니다.",
  "usagePopover.cliAccount": "CLI 계정",
  "usagePopover.openDashboard": "대시보드 열기",

  // 업데이트 배너
  "updateBanner.newVersion": "새 버전 {version}",
  "updateBanner.desc": "업데이트를 설치하고 앱을 재시작합니다.",
  "updateBanner.later": "나중에",
  "updateBanner.installing": "설치 중…",
  "updateBanner.installRestart": "설치 후 재시작",

  // 체크포인트
  "checkpoints.button": "체크포인트",
  "checkpoints.labelPlaceholder": "라벨 (선택)",
  "checkpoints.saveNow": "지금 저장",
  "checkpoints.empty": "저장된 체크포인트가 없습니다.",
  "checkpoints.confirmRollback": "되돌리기 확인",
  "checkpoints.rollbackTo": "이 체크포인트로 되돌리기",
  "checkpoints.deleteAria": "체크포인트 삭제",
  "checkpoints.note": "되돌리기는 추적 파일의 변경만 스냅샷 시점으로 복원합니다.",

  // 타임라인
  "timeline.button": "타임라인",
  "timeline.sessionAria": "세션 타임라인",
  "timeline.heading": "활동 타임라인",
  "timeline.empty": "기록된 활동이 없습니다.",
  "timeline.kind.commit": "커밋",
  "timeline.kind.push": "푸시",
  "timeline.kind.pr": "PR",
  "timeline.kind.verify": "검증",
  "timeline.kind.checkpoint": "체크포인트",
  "timeline.kind.rollback": "롤백",
  "timeline.kind.status": "상태",
  "timeline.kind.adopt": "채택",
  "timeline.kind.fanout": "팬아웃",

  // PR 패널
  "prPanel.aria": "PR 상태",
  "prPanel.none": "이 브랜치의 PR이 없습니다.",
  "prPanel.conflicting": "충돌",
  "prPanel.openInBrowser": "브라우저에서 열기",
  "prPanel.stateStatus": "{state} 상태입니다.",

  // 검토 · 커밋
  "review.heading": "검토 · 커밋",
  "review.changed": "{count} 변경",
  "review.commitPlaceholder": "커밋 메시지",
  "review.noChanges": "커밋할 변경이 없습니다",
  "review.committing": "커밋 중",
  "review.commit": "커밋",
  "review.committed": "커밋했습니다.",
  "review.pushing": "푸시 중",
  "review.push": "푸시",
  "review.pushDone": "푸시 완료 · {branch}",
  "review.opening": "여는 중",
  "review.prOpened": "PR을 열었습니다.",
  "review.compareOpened": "GitHub compare 페이지를 열었습니다.",
  "review.mergeInto": "{base}로 병합",
  "review.mergeToBase": "기준 브랜치로 병합",
  "review.merging": "확인 중…",
  "review.alreadyMerged": "이미 {base}에 병합된 상태입니다.",
  "review.conflictSummary": "충돌 {count}개 · {list}",
  "review.noRemote": "origin 원격이 없어 푸시·PR을 사용할 수 없습니다.",
  "review.publishBranch": "브랜치 게시",
  "review.pushAhead": "푸시 {count}",
  "review.pushed": "푸시됨",

  // 팬아웃
  "fanout.title": "팬아웃 — {project}",
  "fanout.desc": "한 작업을 여러 에이전트에 병렬 분기해 결과를 비교합니다.",
  "fanout.playbook": "플레이북",
  "fanout.load": "불러오기",
  "fanout.playbookItem": "{name} · {count}개",
  "fanout.deletePlaybook": "플레이북 삭제",
  "fanout.saveCurrent": "현재 설정 저장",
  "fanout.taskName": "작업 이름",
  "fanout.githubIssue": "GitHub 이슈",
  "fanout.loadingIssues": "이슈를 불러오는 중…",
  "fanout.noOpenIssues": "열린 이슈가 없습니다.",
  "fanout.noAssignedIssues": "할당된 이슈가 없습니다.",
  "fanout.titlePlaceholder": "예: 로그인 리팩터링",
  "fanout.promptOptional": "프롬프트 (선택)",
  "fanout.library": "라이브러리",
  "fanout.promptPlaceholder": "각 에이전트에 전달할 작업 지시. 비교 화면에서 복사할 수 있습니다.",
  "fanout.startPoint": "분기 기준(start-point)",
  "fanout.startPlaceholder": "예: main",
  "fanout.agentsSelect": "에이전트 (2개 이상 선택)",
  "fanout.selectKind": "{kind} 선택",
  "fanout.kindCommand": "{kind} 실행 커맨드",
  "fanout.creating": "생성 중…",
  "fanout.createAgents": "{count}개 에이전트 생성",
  "fanout.untitledPrompt": "제목 없는 프롬프트",
  "fanout.logCreated": "팬아웃 생성 · {title}",

  // 비교
  "compare.title": "결과 비교 · {title}",
  "compare.desc": "{project} · {count}개 에이전트 병렬 실행",
  "compare.copied": "복사됨",
  "compare.copyPrompt": "프롬프트 복사",
  "compare.verifyPlaceholder": "검증 명령 (예: pnpm test)",
  "compare.verifyAria": "검증 명령",
  "compare.verifying": "검증 중…",
  "compare.runVerify": "검증 실행",
  "compare.recommended": "추천",
  "compare.loading": "불러오는 중…",
  "compare.files": "파일",
  "compare.noChangeInfo": "변경 정보를 읽을 수 없음",
  "compare.verifyFailed": "검증 실행 실패",
  "compare.pass": "통과",
  "compare.fail": "실패",
  "compare.output": "출력",
  "compare.adoptClean": "나머지 정리 후 채택",
  "compare.adopt": "채택",
  "compare.adoptLog": "결과 채택(나머지 정리)",
  "compare.verifyLog": "{result} · {command}",

  // 태스크 보드
  "taskBoard.status.todo": "할 일",
  "taskBoard.status.doing": "진행",
  "taskBoard.status.done": "완료",
  "taskBoard.title": "태스크 보드",
  "taskBoard.desc": "여러 프로젝트의 작업을 한곳에서 계획하고 팬아웃으로 실행을 시작합니다.",
  "taskBoard.newTitle": "새 태스크 제목",
  "taskBoard.newNotes": "메모/프롬프트 (선택)",
  "taskBoard.projectAria": "프로젝트 선택",
  "taskBoard.noProject": "프로젝트 없음",
  "taskBoard.prev": "이전 상태로",
  "taskBoard.next": "다음 상태로",
  "taskBoard.fanout": "팬아웃",

  // 에이전트 추가 다이얼로그
  "agentDialog.title": "에이전트 추가 — {project}",
  "agentDialog.taskName": "작업 이름 (선택)",
  "agentDialog.taskNamePlaceholder": "비우면 브랜치 이름으로 만듭니다",
  "agentDialog.kind": "종류",
  "agentDialog.command": "실행 커맨드",
  "agentDialog.commandOptional": "실행 커맨드 (선택)",
  "agentDialog.commandPlaceholderShell": "비우면 기본 셸이 열립니다",
  "agentDialog.worktreeNew": "새 worktree 만들기",
  "agentDialog.worktreeShare": "{branch} 공유",
  "agentDialog.worktreeExisting": "기존 worktree",
  "agentDialog.sharedNote": "선택한 에이전트와 동일한 물리적 worktree를 사용합니다.",
  "agentDialog.branch": "브랜치",
  "agentDialog.branchPlaceholder": "예: feat/login",
  "agentDialog.startPoint": "분기 기준(start-point)",
  "agentDialog.startPlaceholder": "예: main",
  "agentDialog.worktreePath": "worktree 경로 (비우면 자동 생성)",
  "agentDialog.worktreePathPlaceholder": "선택 사항",

  // 기본 작업환경 다시 만들기
  "defaultWorkspace.title": "기본 작업환경 다시 만들기 — {project}",
  "defaultWorkspace.desc": "저장소 본체의 현재 checkout 브랜치에서 동작하는 기본 작업환경을 다시 만듭니다.",
  "defaultWorkspace.recreate": "다시 만들기",

  // 에이전트 삭제
  "deleteAgent.title": "에이전트 삭제",
  "deleteAgent.desc": "\"{title}\"을(를) 삭제합니다.",
  "deleteAgent.worktreeNote": "앱이 생성한 worktree({branch})도 함께 제거됩니다.",
  "deleteAgent.hasChanges": "이 worktree에 커밋되지 않은 변경사항이 있습니다.",
  "deleteAgent.dontAsk": "다음부터 묻지 않고 자동으로 안전 제거",
  "deleteAgent.force": "강제 삭제",

  // 프로젝트 삭제
  "deleteProject.title": "프로젝트 삭제",
  "deleteProject.desc":
    "\"{name}\" 프로젝트를 삭제합니다. 하위 에이전트 {count}개와 앱이 생성한 worktree도 함께 제거됩니다.",

  // 프로젝트 추가
  "projectDialog.title": "프로젝트 추가",
  "projectDialog.name": "이름",
  "projectDialog.namePlaceholder": "프로젝트 이름",
  "projectDialog.firstAgent": "첫 작업환경 에이전트",
  "projectDialog.firstAgentNote": "기존 프로젝트 디렉터리와 현재 checkout 브랜치를 그대로 사용합니다.",
  "projectDialog.path": "경로",
  "projectDialog.pathPlaceholder": "로컬 저장소 경로",

  // 에이전트 상세
  "agentDetail.backOverview": "전체 오버뷰로 돌아가기",
  "agentDetail.sharedWorktree": "공유 worktree · {count} 에이전트",
  "agentDetail.compare": "비교 · {count}",
  "agentDetail.blockedTitle": "에이전트가 입력을 기다리고 있어요",
  "agentDetail.blockedDesc": "터미널에서 응답하면 작업이 계속됩니다.",
  "agentDetail.goTerminal": "터미널로 이동",
  "agentDetail.terminal": "터미널",
  "agentDetail.closeFileTab": "파일 탭 닫기",
  "agentDetail.preview": "프리뷰",

  // 파일 뷰어
  "fileViewer.new": "신규",
  "fileViewer.deleted": "삭제",
  "fileViewer.modified": "수정",
  "fileViewer.lastEdited": "마지막 수정 · {title}",
  "fileViewer.loading": "파일을 불러오는 중…",
  "fileViewer.binary": "바이너리 파일은 미리 볼 수 없습니다.",
  "fileViewer.readonly": "읽기 전용 미리보기 · worktree 파일",
  "fileViewer.readError": "파일을 읽을 수 없습니다.",

  // 파일 패널
  "filePanel.heading": "파일",
  "filePanel.fileCount": "{count}개 파일",
  "filePanel.refresh": "파일 목록 새로고침",
  "filePanel.sharedNote": "공유 worktree의 변경사항을 합산해 표시합니다.",
  "filePanel.loading": "파일을 불러오는 중…",
  "filePanel.empty": "표시할 파일이 없습니다.",

  // 프리뷰
  "preview.urlAria": "프리뷰 URL",
  "preview.detectPorts": "dev 서버 포트 감지",
  "preview.noPorts": "감지된 포트가 없습니다.",
  "preview.refresh": "새로고침",
  "preview.openBrowser": "브라우저에서 열기",
  "preview.frameTitle": "라이브 프리뷰 · {title}",
  "preview.emptyMain": "dev 서버 주소를 입력하면 프리뷰가 표시됩니다.",
  "preview.emptyExample": "예: {url}",

  // 외부 앱으로 열기
  "openExternal.finder": "파일 매니저",
  "openExternal.aria": "외부 앱으로 열기",

  // 알림
  "notify.blocked": "입력 대기",
  "notify.done": "완료",
  "notify.blockedBody": "{project} 에이전트가 입력을 기다립니다.",
  "notify.doneBody": "{project} 에이전트가 작업을 마쳤습니다.",

  // 에이전트 종류
  "agentKind.terminal": "빈 터미널",
  "agentKind.nameRequired": "종류 이름을 입력해 주세요.",
  "update.upToDate": "이미 최신 버전입니다.",
  "checkpoints.autoLabel": "완료 자동",
};
