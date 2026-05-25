# Z.ai Sandbox Agent — Design Document

## Overview

A TypeScript orchestrator that spawns E2B sandboxes pre-loaded with the Z.ai fullstack template and runs Claude Code inside them. End users interact via a WebSocket-based chat UI, describing what they want built. Claude Code writes the code, and users get a live preview URL.

## Architecture

```
Chat UI (browser)
    |
    v  WebSocket
Orchestrator (TypeScript, Bun)
    |
    v  E2B SDK
E2B Sandbox ('z-ai-fullstack' template)
    ├── /home/user/project/  (fullstack scaffold, deps pre-installed)
    ├── Claude Code CLI (global)
    ├── Bun, Node.js 24, git, ripgrep, sqlite3
    └── Dev server on port 3000 → public preview URL
```

**Data flow:**

1. Client opens WebSocket, sends `{ type: "start", sessionId?, model? }`
2. Orchestrator creates or reconnects an E2B sandbox
3. Responds with `{ type: "ready", sessionId, previewUrl }`
4. Client sends `{ type: "message", content: "Build me a todo app" }`
5. Orchestrator runs `echo '<prompt>' | claude -p --output-format=stream-json --dangerously-skip-permissions` inside the sandbox
6. Streams structured JSON events back to client (text, tool use, tool results)
7. On subsequent messages, uses `--resume` flag for multi-turn context

## Project Structure

```
z-ai-sandbox-agent/
├── src/
│   ├── index.ts              # Entry point — starts WebSocket server
│   ├── orchestrator.ts       # Sandbox lifecycle management
│   ├── sandbox-agent.ts      # Pipes prompts to Claude Code in sandbox
│   ├── session-store.ts      # Tracks active/paused sandboxes
│   └── types.ts              # Shared types
├── template/
│   ├── template.ts           # E2B template definition
│   └── build.ts              # Build script for E2B template
├── package.json
├── tsconfig.json
└── .env.example
```

## E2B Template

Pre-built sandbox image containing everything needed for instant startup.

**Contents:**
- Node.js 24 (LTS) base image
- Bun package manager
- Claude Code CLI (`@anthropic-ai/claude-code@latest`, global)
- System tools: curl, git, ripgrep, sqlite3
- Fullstack scaffold at `/home/user/project/`
- `node_modules` pre-installed via `bun install`
- Prisma client pre-generated
- SQLite database initialized

**Build configuration:**
- Alias: `z-ai-fullstack`
- CPU: 2 cores
- Memory: 2048 MB
- No start command (dev server started on-demand by agent)

**Template definition** uses E2B SDK's `Template.build()`:
```typescript
import { Template } from 'e2b';

const template = Template
  .fromNodeImage('24')
  .aptInstall(['curl', 'git', 'ripgrep', 'sqlite3'])
  .npmInstall('@anthropic-ai/claude-code@latest', { g: true })
  // Copy scaffold, install deps, generate prisma client
```

**Rationale:** Pre-installing deps at build time means every sandbox starts in ~1 second instead of 30+ seconds for `bun install`.

## Orchestrator

Lightweight WebSocket server managing sandbox lifecycle.

### WebSocket Protocol

**Client → Server:**

| Message | Fields | Description |
|---------|--------|-------------|
| `start` | `sessionId?`, `model?` | Start new or resume existing session |
| `message` | `content` | Send user prompt to agent |
| `stop` | — | Interrupt current agent turn |
| `end` | — | End session, kill sandbox |

**Server → Client:**

| Message | Fields | Description |
|---------|--------|-------------|
| `ready` | `sessionId`, `previewUrl` | Sandbox ready, here's the preview URL |
| `text` | `content` | Assistant text (render as markdown) |
| `tool` | `name`, `file?`, `command?`, `status` | Tool invocation (collapsible action card) |
| `tool_result` | `name`, `success`, `output?` | Tool outcome |
| `done` | — | Turn complete, awaiting next message |
| `error` | `message` | Error event |
| `session_expired` | — | Sandbox timed out |

### Sandbox Lifecycle

```
Created → Active → Idle (timeout) → Killed
                 ↘ Paused (disconnect) → Resumed (reconnect)
```

- Default idle timeout: 30 minutes (configurable)
- On WebSocket disconnect: sandbox stays alive for reconnection
- On explicit `end`: sandbox killed immediately
- On process shutdown (`SIGTERM`): kill all active sandboxes

### Session Store

In-memory map with simple interface for future swap to Redis/DB:

```typescript
interface Session {
  id: string;
  sandboxId: string;
  lastActive: number;
  timeoutMinutes: number;
  model: string;
  metadata?: Record<string, string>;
}

interface SessionStore {
  get(id: string): Session | undefined;
  set(session: Session): void;
  delete(id: string): void;
  getAll(): Session[];
}
```

## Agent Configuration

Claude Code is configured via a `CLAUDE.md` file baked into the template at `/home/user/project/CLAUDE.md`.

**CLAUDE.md contents:**

```markdown
# Z.ai Fullstack Development Agent

You are a fullstack web developer working inside a pre-configured project scaffold.

## Stack
- Next.js 16 (App Router, standalone output)
- React 19 with TypeScript 5
- Tailwind CSS 4 with shadcn/ui (50+ components in src/components/ui/)
- Prisma ORM with SQLite (db/custom.db)
- Bun package manager
- Caddy reverse proxy (port 81 -> 3000)

## Project Structure
- src/app/ — Next.js App Router (pages, API routes, layouts)
- src/components/ui/ — Pre-built shadcn/ui components (always use these)
- src/hooks/ — Custom React hooks
- src/lib/db.ts — Prisma client singleton
- src/lib/utils.ts — cn() utility for className merging
- prisma/schema.prisma — Database schema (User, Post models)
- mini-services/ — Microservices (each gets its own directory)
- examples/ — Reference implementations (WebSocket chat)
- public/ — Static assets

## Conventions
- Always use existing shadcn/ui components before creating new ones
- Use cn() from src/lib/utils for className merging
- Use Prisma for all database operations via src/lib/db.ts
- Use zod for validation, react-hook-form for forms
- Use @tanstack/react-query for server state, zustand for client state
- Prefer named exports over default exports
- Use 'bun' for package management, never npm/yarn

## Dev Server
- Run 'bun dev' to start the dev server on port 3000
- Start it when the user wants to preview their app
- The dev server is accessible via the sandbox's public URL

## Database
- Schema at prisma/schema.prisma
- After changes: 'bunx prisma db push' then 'bunx prisma generate'
- DATABASE_URL is pre-configured

## Adding Dependencies
- Use 'bun add <package>'
- Prefer built-in solutions over adding dependencies
```

**Model configuration:**
- Default: `claude-sonnet-4-5-20250929`
- Overridable per-request via `model` field in `start` message
- Passed as `--model` flag to Claude Code CLI

**Claude Code flags:**
- `-p` — Pipe mode (read prompt from stdin)
- `--output-format=stream-json` — Structured streaming output
- `--dangerously-skip-permissions` — Safe because sandbox is the security boundary
- `--resume` — Multi-turn conversation continuity (subsequent messages)
- `--max-turns 50` — Prevent infinite loops

## Live Preview

E2B exposes sandbox ports via public URLs:

```typescript
const previewUrl = `https://${sandbox.getHost(3000)}`;
```

- URL sent to client immediately on sandbox creation
- Becomes responsive once agent runs `bun dev`
- Works in iframes for embedded preview

## Streaming

Claude Code's `--output-format=stream-json` emits newline-delimited JSON. The orchestrator parses each line and forwards structured events to the client WebSocket.

Raw Claude Code output → Orchestrator parses → Typed WebSocket events to client.

## Error Handling

| Error | Handling |
|-------|----------|
| Sandbox creation fails | Return error to client, suggest retry |
| Sandbox times out | Send `session_expired`, client can restart |
| Claude Code crashes | Send error, sandbox stays alive for retry |
| `--resume` fails | Fall back to fresh Claude Code session (files preserved) |
| WebSocket disconnects mid-turn | Sandbox keeps running, client can reconnect |
| API rate limit | Claude Code retries internally, surfaces if persistent |

## Cleanup

Periodic cleanup runs every 5 minutes:
- Kill sandboxes idle beyond their timeout
- Remove expired sessions from store
- On `SIGTERM`: graceful shutdown of all sandboxes

## Cost Controls

- `--max-turns 50` prevents runaway agent loops
- Sandbox `timeoutMs` caps total lifetime
- Per-session sandbox uptime tracked for billing

## Dependencies

**Runtime:**
- `e2b` — Sandbox management
- `@anthropic-ai/claude-agent-sdk` — Types only (agent runs inside sandbox)
- `dotenv` — Environment variable loading
- `zod` — Input validation

**Dev:**
- `typescript`
- `@types/node`

## Environment Variables

```
E2B_API_KEY=         # E2B account API key
ANTHROPIC_API_KEY=   # Passed into sandboxes for Claude Code
PORT=8080            # Orchestrator WebSocket server port
```

## Future Considerations

- Redis session store for multi-instance orchestrator
- File download endpoint (export project as tarball)
- Webhook notifications for long-running builds
- Usage analytics and per-user billing
- Custom CLAUDE.md injection per user/team
