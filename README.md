# Worklane

**Manage multiple projects and multiple CLI coding agents from one desktop workspace.**

[한국어](README.ko.md)

> [!WARNING]
> **Early Development** — Worklane is under active development. There are no official releases or installers yet, and workflows may change as the product evolves.

## Why Worklane?

Running several coding agents in one repository is only part of the challenge. Developers often work across multiple projects, each with its own agents, branches, terminals, and review context.

Worklane is a desktop workspace built around this **multiple projects × multiple agents** workflow. It groups agent sessions by project, isolates parallel work with Git worktrees, and brings status, terminal output, and code changes into one place.

The long-term goal is not to replace your coding agents or editor. It is to make coordinating them across projects easier.

## Current Capabilities

- **Multi-project workspace** — register local Git repositories and keep project and agent metadata in a local SQLite database.
- **CLI agent presets** — launch Claude Code, Codex, Cursor, or Gemini commands, with an editable command for each workspace.
- **Worktree isolation** — create a branch-backed Git worktree for an agent or let multiple agents share an existing worktree.
- **Embedded terminals** — run interactive CLI sessions through a native PTY and xterm.js terminal.
- **Unified overview** — see agents across projects with running, idle, blocked, and done states plus recent terminal output.
- **Change review** — browse worktree files, inspect added and removed lines, and review file-level diffs, including untracked files.
- **Usage and resources** — surface Codex and Claude Code usage information alongside local CPU and memory activity.
- **Persistent preferences** — customize appearance and terminal settings, including installed system fonts.

## Hybrid Agent Status Tracking

Most agent managers treat the process they started as the source of truth. That signal becomes less useful when an agent runs behind `tmux` or another multiplexer.

Worklane's status engine combines three signals:

| Signal | Purpose |
| --- | --- |
| PTY process state | Detect whether the directly managed process is still alive |
| Output activity | Distinguish active work from an alive but quiet session |
| Agent hook status | Prefer a fresh agent-provided signal for working, waiting for input, or completion |

The reducer prioritizes process completion, then fresh hook data, and finally falls back to recent terminal activity. This lets the UI represent `running`, `idle`, `blocked`, and `done` without relying on one signal alone.

## Tech Stack

| Layer | Technology |
| --- | --- |
| Desktop shell | [Tauri v2](https://v2.tauri.app/) |
| Backend | Rust |
| Frontend | Svelte 5, TypeScript, Vite |
| Styling | Tailwind CSS, Bits UI |
| Terminal | xterm.js |
| PTY | portable-pty |
| Persistence | SQLite via rusqlite |

Worklane targets macOS, Windows, and Linux, with macOS as the current development priority. Cross-platform behavior is still being validated during early development.

## Getting Started

Official packages are not available yet. To try Worklane, build it from source.

### Prerequisites

- [Node.js](https://nodejs.org/)
- [pnpm](https://pnpm.io/)
- [Rust](https://www.rust-lang.org/tools/install)
- [Git](https://git-scm.com/)
- The system dependencies listed in the official [Tauri v2 prerequisites](https://v2.tauri.app/start/prerequisites/)

The CLI agents you want to run must also be installed and authenticated separately. Worklane does not bundle them.

### Run the Desktop App

```bash
git clone https://github.com/mongmeo-dev/worklane.git
cd worklane
pnpm install
pnpm tauri dev
```

### Build an Application Bundle

```bash
pnpm tauri build
```

Generated artifacts are written to the platform-specific Tauri bundle directory under `src-tauri/target/release/bundle/`.

## Development

| Command | Description |
| --- | --- |
| `pnpm dev` | Start the Vite frontend development server |
| `pnpm tauri dev` | Run the desktop app in development mode |
| `pnpm check` | Run Svelte and TypeScript diagnostics |
| `pnpm test` | Run the Vitest test suite |
| `pnpm build` | Build the frontend |
| `pnpm tauri build` | Build the desktop application bundle |

## Roadmap

Current areas of exploration include:

- a clearer multi-project dashboard and faster context switching;
- deeper status-hook integration with more CLI coding agents;
- stronger review and merge workflows for agent-produced changes;
- macOS-first product polish and broader Windows and Linux validation;
- signed installers and a documented release process.

These are directions, not committed release dates or finalized features.

## Contributing

Worklane is at an early stage, so focused bug reports, design feedback, and small pull requests are especially useful. Before starting a large change, open an issue to align on scope and product direction.

## License

Worklane is licensed under the MIT License.
