# Z.ai Sandbox Agent — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a TypeScript orchestrator that spawns E2B sandboxes with the Z.ai fullstack template pre-installed and runs Claude Code inside them, exposing a WebSocket API for chat UIs.

**Architecture:** A Bun-powered WebSocket server manages E2B sandbox lifecycle. Each sandbox runs Claude Code CLI in pipe mode with `--output-format=stream-json`. The orchestrator parses streaming NDJSON and forwards typed events to WebSocket clients. An E2B template (built once via `Template.build()`) pre-installs the scaffold, deps, and Claude Code CLI for instant sandbox startup.

**Tech Stack:** Bun, TypeScript 5, E2B SDK (`e2b@^2.12`), `@anthropic-ai/claude-agent-sdk` (types only), Zod for validation.

---

## Task 1: Initialize Project

**Files:**
- Create: `/Volumes/ssd/developer/z-ai-sandbox-agent/package.json`
- Create: `/Volumes/ssd/developer/z-ai-sandbox-agent/tsconfig.json`
- Create: `/Volumes/ssd/developer/z-ai-sandbox-agent/.env.example`
- Create: `/Volumes/ssd/developer/z-ai-sandbox-agent/.gitignore`

**Step 1: Create project directory and initialize**

```bash
mkdir -p /Volumes/ssd/developer/z-ai-sandbox-agent
cd /Volumes/ssd/developer/z-ai-sandbox-agent
bun init -y
```

**Step 2: Set up package.json**

Replace the generated `package.json` with:

```json
{
  "name": "z-ai-sandbox-agent",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "scripts": {
    "dev": "bun --watch src/index.ts",
    "start": "bun src/index.ts",
    "typecheck": "tsc --noEmit",
    "build:template": "bun template/build.ts"
  },
  "dependencies": {
    "e2b": "^2.12.1",
    "zod": "^4.0.2"
  },
  "devDependencies": {
    "@anthropic-ai/claude-agent-sdk": "^0.2.42",
    "@types/node": "^22",
    "typescript": "^5"
  }
}
```

Note: `@anthropic-ai/claude-agent-sdk` is dev-only (for types). `dotenv` is not needed — Bun reads `.env` natively.

**Step 3: Set up tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": ".",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "types": ["bun-types"],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src/**/*.ts", "template/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

**Step 4: Create .env.example**

```
E2B_API_KEY=your_e2b_api_key
ANTHROPIC_API_KEY=your_anthropic_api_key
PORT=8080
```

**Step 5: Create .gitignore**

```
node_modules/
dist/
.env
.env.local
*.log
```

**Step 6: Install dependencies**

```bash
cd /Volumes/ssd/developer/z-ai-sandbox-agent && bun install
```

**Step 7: Verify types**

```bash
cd /Volumes/ssd/developer/z-ai-sandbox-agent && bunx tsc --noEmit
```

Expected: passes (no source files yet, no errors).

**Step 8: Initialize git and commit**

```bash
cd /Volumes/ssd/developer/z-ai-sandbox-agent && git init && git add -A && git commit -m "chore: initialize z-ai-sandbox-agent project"
```

---

## Task 2: Define Types

**Files:**
- Create: `/Volumes/ssd/developer/z-ai-sandbox-agent/src/types.ts`

**Step 1: Write the types file**

```typescript
import { z } from 'zod';

// --- Client → Server messages ---

export const StartMessageSchema = z.object({
  type: z.literal('start'),
  sessionId: z.string().optional(),
  model: z.string().optional(),
});

export const UserMessageSchema = z.object({
  type: z.literal('message'),
  content: z.string().min(1),
});

export const StopMessageSchema = z.object({
  type: z.literal('stop'),
});

export const EndMessageSchema = z.object({
  type: z.literal('end'),
});

export const ClientMessageSchema = z.discriminatedUnion('type', [
  StartMessageSchema,
  UserMessageSchema,
  StopMessageSchema,
  EndMessageSchema,
]);

export type ClientMessage = z.infer<typeof ClientMessageSchema>;
export type StartMessage = z.infer<typeof StartMessageSchema>;
export type UserMessage = z.infer<typeof UserMessageSchema>;

// --- Server → Client messages ---

export type ServerMessage =
  | { type: 'ready'; sessionId: string; previewUrl: string }
  | { type: 'text'; content: string }
  | { type: 'tool'; name: string; file?: string; command?: string; status: string }
  | { type: 'tool_result'; name: string; success: boolean; output?: string }
  | { type: 'done' }
  | { type: 'error'; message: string }
  | { type: 'session_expired' };

// --- Session ---

export interface Session {
  id: string;
  sandboxId: string;
  claudeSessionId?: string;
  lastActive: number;
  timeoutMinutes: number;
  model: string;
}

// --- Config ---

export interface AgentConfig {
  e2bTemplate: string;
  defaultModel: string;
  maxTurns: number;
  sandboxTimeoutMs: number;
  idleTimeoutMinutes: number;
  port: number;
}

export const DEFAULT_CONFIG: AgentConfig = {
  e2bTemplate: 'z-ai-fullstack',
  defaultModel: 'claude-sonnet-4-5-20250929',
  maxTurns: 50,
  sandboxTimeoutMs: 30 * 60 * 1000,
  idleTimeoutMinutes: 30,
  port: Number(process.env.PORT) || 8080,
};
```

**Step 2: Verify types compile**

```bash
cd /Volumes/ssd/developer/z-ai-sandbox-agent && bunx tsc --noEmit
```

Expected: PASS with no errors.

**Step 3: Commit**

```bash
cd /Volumes/ssd/developer/z-ai-sandbox-agent && git add src/types.ts && git commit -m "feat: add shared types and Zod schemas for WebSocket protocol"
```

---

## Task 3: Build Session Store

**Files:**
- Create: `/Volumes/ssd/developer/z-ai-sandbox-agent/src/session-store.ts`

**Step 1: Write the session store**

```typescript
import type { Session } from './types.ts';

export class SessionStore {
  private sessions = new Map<string, Session>();

  get(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  set(session: Session): void {
    this.sessions.set(session.id, session);
  }

  delete(id: string): void {
    this.sessions.delete(id);
  }

  getAll(): Session[] {
    return Array.from(this.sessions.values());
  }

  findBySandboxId(sandboxId: string): Session | undefined {
    return this.getAll().find((s) => s.sandboxId === sandboxId);
  }

  getExpired(now: number): Session[] {
    return this.getAll().filter((s) => {
      const idleMs = now - s.lastActive;
      return idleMs > s.timeoutMinutes * 60 * 1000;
    });
  }

  touch(id: string): void {
    const session = this.sessions.get(id);
    if (session) {
      session.lastActive = Date.now();
    }
  }
}
```

**Step 2: Verify types compile**

```bash
cd /Volumes/ssd/developer/z-ai-sandbox-agent && bunx tsc --noEmit
```

Expected: PASS.

**Step 3: Commit**

```bash
cd /Volumes/ssd/developer/z-ai-sandbox-agent && git add src/session-store.ts && git commit -m "feat: add in-memory session store with idle expiry"
```

---

## Task 4: Build Sandbox Agent (Core Logic)

**Files:**
- Create: `/Volumes/ssd/developer/z-ai-sandbox-agent/src/sandbox-agent.ts`

This is the core module that pipes prompts to Claude Code inside an E2B sandbox and parses the streaming NDJSON output.

**Step 1: Write the sandbox agent**

```typescript
import { Sandbox } from 'e2b';
import type { ServerMessage, AgentConfig } from './types.ts';

export interface RunPromptOptions {
  sandbox: Sandbox;
  prompt: string;
  model: string;
  maxTurns: number;
  claudeSessionId?: string;
  onMessage: (msg: ServerMessage) => void;
  signal?: AbortSignal;
}

export async function runPrompt({
  sandbox,
  prompt,
  model,
  maxTurns,
  claudeSessionId,
  onMessage,
  signal,
}: RunPromptOptions): Promise<{ claudeSessionId?: string }> {
  const escapedPrompt = prompt.replace(/'/g, "'\\''");

  const resumeFlag = claudeSessionId ? `--resume ${claudeSessionId}` : '';
  const command = [
    `echo '${escapedPrompt}'`,
    '|',
    'claude -p',
    '--output-format stream-json',
    `--model ${model}`,
    `--max-turns ${maxTurns}`,
    '--dangerously-skip-permissions',
    resumeFlag,
  ]
    .filter(Boolean)
    .join(' ');

  let extractedSessionId: string | undefined;
  let buffer = '';

  const cmd = await sandbox.commands.run(command, {
    cwd: '/home/user/project',
    timeoutMs: 0,
    background: true,
    onStdout: (data) => {
      if (signal?.aborted) return;

      buffer += data;
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
          const event = JSON.parse(trimmed);
          const msg = parseClaudeEvent(event);
          if (msg) onMessage(msg);

          if (event.session_id && !extractedSessionId) {
            extractedSessionId = event.session_id;
          }
        } catch {
          // Non-JSON line, skip
        }
      }
    },
    onStderr: (data) => {
      if (signal?.aborted) return;
      // stderr is diagnostic, don't forward to client
    },
  });

  if (signal) {
    signal.addEventListener('abort', () => cmd.kill(), { once: true });
  }

  await cmd.wait();

  // Flush remaining buffer
  if (buffer.trim()) {
    try {
      const event = JSON.parse(buffer.trim());
      const msg = parseClaudeEvent(event);
      if (msg) onMessage(msg);
      if (event.session_id && !extractedSessionId) {
        extractedSessionId = event.session_id;
      }
    } catch {
      // ignore
    }
  }

  onMessage({ type: 'done' });
  return { claudeSessionId: extractedSessionId ?? claudeSessionId };
}

function parseClaudeEvent(event: Record<string, unknown>): ServerMessage | null {
  const type = event.type as string;

  if (type === 'assistant' || type === 'text') {
    const message = event.message as Record<string, unknown> | undefined;
    const content = message?.content as Array<Record<string, unknown>> | undefined;

    if (content) {
      const textBlocks = content
        .filter((b) => b.type === 'text')
        .map((b) => b.text as string);

      if (textBlocks.length > 0) {
        return { type: 'text', content: textBlocks.join('') };
      }
    }

    // Direct text content
    if (typeof event.content === 'string') {
      return { type: 'text', content: event.content };
    }

    return null;
  }

  if (type === 'tool_use') {
    const input = event.input as Record<string, unknown> | undefined;
    return {
      type: 'tool',
      name: event.name as string,
      file: input?.file_path as string | undefined,
      command: input?.command as string | undefined,
      status: 'running',
    };
  }

  if (type === 'tool_result') {
    return {
      type: 'tool_result',
      name: event.name as string ?? 'unknown',
      success: !event.is_error,
      output: typeof event.output === 'string'
        ? event.output.slice(0, 500)
        : undefined,
    };
  }

  if (type === 'result') {
    // Final result message — contains session_id and cost info
    return null;
  }

  return null;
}

export async function createSandbox(
  config: AgentConfig,
): Promise<Sandbox> {
  return Sandbox.create(config.e2bTemplate, {
    envs: {
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? '',
      DATABASE_URL: 'file:/home/user/project/db/custom.db',
    },
    timeoutMs: config.sandboxTimeoutMs,
  });
}

export function getPreviewUrl(sandbox: Sandbox): string {
  return `https://${sandbox.getHost(3000)}`;
}
```

**Step 2: Verify types compile**

```bash
cd /Volumes/ssd/developer/z-ai-sandbox-agent && bunx tsc --noEmit
```

Expected: PASS.

**Step 3: Commit**

```bash
cd /Volumes/ssd/developer/z-ai-sandbox-agent && git add src/sandbox-agent.ts && git commit -m "feat: add sandbox agent - pipes prompts to Claude Code in E2B and parses streaming output"
```

---

## Task 5: Build Orchestrator

**Files:**
- Create: `/Volumes/ssd/developer/z-ai-sandbox-agent/src/orchestrator.ts`

The orchestrator ties together the session store, sandbox lifecycle, and WebSocket handling.

**Step 1: Write the orchestrator**

```typescript
import { Sandbox } from 'e2b';
import { SessionStore } from './session-store.ts';
import { createSandbox, getPreviewUrl, runPrompt } from './sandbox-agent.ts';
import { ClientMessageSchema, DEFAULT_CONFIG, type AgentConfig, type ServerMessage, type Session } from './types.ts';
import { randomUUID } from 'crypto';

export class Orchestrator {
  private store = new SessionStore();
  private activeCmds = new Map<string, AbortController>();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;
  private config: AgentConfig;

  constructor(config: Partial<AgentConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  start(): void {
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
    console.log(`Orchestrator started. Cleanup every 5 minutes.`);
  }

  async stop(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    // Kill all active commands
    for (const [, controller] of this.activeCmds) {
      controller.abort();
    }

    // Kill all sandboxes
    const sessions = this.store.getAll();
    await Promise.allSettled(
      sessions.map(async (s) => {
        try {
          const sandbox = await Sandbox.connect(s.sandboxId);
          await sandbox.kill();
        } catch {
          // sandbox may already be dead
        }
      }),
    );

    console.log(`Orchestrator stopped. Cleaned up ${sessions.length} sandboxes.`);
  }

  async handleConnection(ws: WebSocket): Promise<void> {
    let currentSessionId: string | undefined;

    ws.addEventListener('message', async (event) => {
      const raw = typeof event.data === 'string' ? event.data : '';
      const parsed = ClientMessageSchema.safeParse(safeJsonParse(raw));

      if (!parsed.success) {
        this.send(ws, { type: 'error', message: 'Invalid message format' });
        return;
      }

      const msg = parsed.data;

      try {
        switch (msg.type) {
          case 'start':
            currentSessionId = await this.handleStart(ws, msg.sessionId, msg.model);
            break;

          case 'message':
            if (!currentSessionId) {
              this.send(ws, { type: 'error', message: 'Session not started. Send "start" first.' });
              return;
            }
            await this.handleMessage(ws, currentSessionId, msg.content);
            break;

          case 'stop':
            if (currentSessionId) {
              this.activeCmds.get(currentSessionId)?.abort();
            }
            break;

          case 'end':
            if (currentSessionId) {
              await this.handleEnd(currentSessionId);
              currentSessionId = undefined;
            }
            break;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        this.send(ws, { type: 'error', message });
      }
    });

    ws.addEventListener('close', () => {
      // Don't kill sandbox on disconnect — allow reconnection
      if (currentSessionId) {
        this.activeCmds.get(currentSessionId)?.abort();
      }
    });
  }

  private async handleStart(
    ws: WebSocket,
    existingSessionId?: string,
    model?: string,
  ): Promise<string> {
    const resolvedModel = model ?? this.config.defaultModel;

    // Resume existing session
    if (existingSessionId) {
      const session = this.store.get(existingSessionId);
      if (session) {
        try {
          const sandbox = await Sandbox.connect(session.sandboxId);
          const previewUrl = getPreviewUrl(sandbox);
          this.store.touch(session.id);

          this.send(ws, {
            type: 'ready',
            sessionId: session.id,
            previewUrl,
          });
          return session.id;
        } catch {
          // Sandbox died, clean up and create fresh
          this.store.delete(existingSessionId);
        }
      }
    }

    // Create new session
    const sandbox = await createSandbox(this.config);
    const previewUrl = getPreviewUrl(sandbox);
    const sessionId = randomUUID();

    const session: Session = {
      id: sessionId,
      sandboxId: sandbox.sandboxId,
      lastActive: Date.now(),
      timeoutMinutes: this.config.idleTimeoutMinutes,
      model: resolvedModel,
    };

    this.store.set(session);

    this.send(ws, { type: 'ready', sessionId, previewUrl });
    return sessionId;
  }

  private async handleMessage(
    ws: WebSocket,
    sessionId: string,
    content: string,
  ): Promise<void> {
    const session = this.store.get(sessionId);
    if (!session) {
      this.send(ws, { type: 'session_expired' });
      return;
    }

    this.store.touch(sessionId);

    const sandbox = await Sandbox.connect(session.sandboxId);
    const controller = new AbortController();
    this.activeCmds.set(sessionId, controller);

    try {
      const result = await runPrompt({
        sandbox,
        prompt: content,
        model: session.model,
        maxTurns: this.config.maxTurns,
        claudeSessionId: session.claudeSessionId,
        onMessage: (msg) => this.send(ws, msg),
        signal: controller.signal,
      });

      // Store claude session ID for resume
      if (result.claudeSessionId) {
        session.claudeSessionId = result.claudeSessionId;
        this.store.set(session);
      }
    } finally {
      this.activeCmds.delete(sessionId);
    }
  }

  private async handleEnd(sessionId: string): Promise<void> {
    const session = this.store.get(sessionId);
    if (!session) return;

    this.activeCmds.get(sessionId)?.abort();
    this.activeCmds.delete(sessionId);

    try {
      const sandbox = await Sandbox.connect(session.sandboxId);
      await sandbox.kill();
    } catch {
      // already dead
    }

    this.store.delete(sessionId);
  }

  private async cleanup(): Promise<void> {
    const expired = this.store.getExpired(Date.now());

    for (const session of expired) {
      try {
        const sandbox = await Sandbox.connect(session.sandboxId);
        await sandbox.kill();
      } catch {
        // already dead
      }
      this.store.delete(session.id);
    }

    if (expired.length > 0) {
      console.log(`Cleanup: removed ${expired.length} expired sessions`);
    }
  }

  private send(ws: WebSocket, msg: ServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }
}

function safeJsonParse(str: string): unknown {
  try {
    return JSON.parse(str);
  } catch {
    return {};
  }
}
```

**Step 2: Verify types compile**

```bash
cd /Volumes/ssd/developer/z-ai-sandbox-agent && bunx tsc --noEmit
```

Expected: PASS.

**Step 3: Commit**

```bash
cd /Volumes/ssd/developer/z-ai-sandbox-agent && git add src/orchestrator.ts && git commit -m "feat: add orchestrator - manages sandbox lifecycle, WebSocket sessions, and cleanup"
```

---

## Task 6: Build Entry Point (WebSocket Server)

**Files:**
- Create: `/Volumes/ssd/developer/z-ai-sandbox-agent/src/index.ts`

**Step 1: Write the server entry point**

```typescript
import { Orchestrator } from './orchestrator.ts';
import { DEFAULT_CONFIG } from './types.ts';

const port = DEFAULT_CONFIG.port;
const orchestrator = new Orchestrator();
orchestrator.start();

const server = Bun.serve({
  port,
  fetch(req, server) {
    const url = new URL(req.url);

    // Health check
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // WebSocket upgrade
    if (url.pathname === '/ws') {
      const upgraded = server.upgrade(req);
      if (!upgraded) {
        return new Response('WebSocket upgrade failed', { status: 400 });
      }
      return undefined;
    }

    return new Response('Not found', { status: 404 });
  },
  websocket: {
    open(ws) {
      orchestrator.handleConnection(ws as unknown as WebSocket);
    },
    message() {
      // Handled by addEventListener in orchestrator.handleConnection
    },
    close() {
      // Handled by addEventListener in orchestrator.handleConnection
    },
  },
});

console.log(`z-ai-sandbox-agent listening on ws://localhost:${port}/ws`);
console.log(`Health check: http://localhost:${port}/health`);

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down...');
  await orchestrator.stop();
  server.stop();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down...');
  await orchestrator.stop();
  server.stop();
  process.exit(0);
});
```

**Important note about Bun WebSocket:** Bun's `serve()` WebSocket API differs from the standard `WebSocket` interface. The orchestrator uses `addEventListener` which is the browser/Node.js WebSocket API. In Step 2 we'll need to adapt the orchestrator's `handleConnection` to work with Bun's `ServerWebSocket` interface. Specifically, Bun WebSocket uses `ws.data` for state and the `message` callback on the server config instead of `addEventListener`. We will refactor accordingly during implementation if `tsc` flags type issues.

**Step 2: Verify types compile**

```bash
cd /Volumes/ssd/developer/z-ai-sandbox-agent && bunx tsc --noEmit
```

If there are type errors related to Bun's WebSocket API vs standard WebSocket, fix them. The key adaptation is:
- Bun's `ServerWebSocket` uses the server-level `websocket.message(ws, data)` callback
- Store the orchestrator's handler context on `ws.data`
- Forward messages from server-level callback to the orchestrator

**Step 3: Commit**

```bash
cd /Volumes/ssd/developer/z-ai-sandbox-agent && git add src/index.ts && git commit -m "feat: add WebSocket server entry point with health check and graceful shutdown"
```

---

## Task 7: Build E2B Template Definition

**Files:**
- Create: `/Volumes/ssd/developer/z-ai-sandbox-agent/template/template.ts`
- Create: `/Volumes/ssd/developer/z-ai-sandbox-agent/template/build.ts`
- Create: `/Volumes/ssd/developer/z-ai-sandbox-agent/template/CLAUDE.md`

The CLAUDE.md file is kept as a separate file that gets `.copy()`-ed into the template, making it easy to iterate on.

**Step 1: Write the CLAUDE.md for the sandbox**

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
- Always use existing shadcn/ui components from src/components/ui/ before creating new ones
- Use the cn() utility from src/lib/utils for className merging
- Use Prisma for all database operations via the singleton in src/lib/db.ts
- Use zod for validation, react-hook-form for forms
- Use @tanstack/react-query for server state
- Use zustand for client state
- Prefer named exports over default exports
- Use 'bun' for package management, never npm/yarn

## Dev Server
- Run 'bun dev' to start the dev server on port 3000
- Start it when the user wants to preview their app
- The dev server is accessible via the sandbox's public URL

## Database
- Schema is at prisma/schema.prisma
- After schema changes: 'bunx prisma db push' then 'bunx prisma generate'
- DATABASE_URL is pre-configured

## Adding Dependencies
- Use 'bun add <package>' to install new dependencies
- Prefer built-in solutions over adding dependencies
```

**Step 2: Write the template definition**

```typescript
// template/template.ts
import { Template } from 'e2b';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const scaffoldDir = resolve(__dirname, '../../z-ai-fullstack-template');

export const template = Template()
  .fromNodeImage('24')
  .aptInstall(['curl', 'git', 'ripgrep', 'sqlite3'])
  // Install bun
  .runCmd('curl -fsSL https://bun.sh/install | bash')
  .runCmd('ln -s /root/.bun/bin/bun /usr/local/bin/bun')
  // Install Claude Code CLI globally
  .npmInstall('@anthropic-ai/claude-code@latest', { g: true })
  // Copy scaffold into sandbox
  .copy(resolve(scaffoldDir, 'package.json'), '/home/user/project/package.json')
  .copy(resolve(scaffoldDir, 'bun.lock'), '/home/user/project/bun.lock')
  .copy(resolve(scaffoldDir, 'tsconfig.json'), '/home/user/project/tsconfig.json')
  .copy(resolve(scaffoldDir, 'next.config.ts'), '/home/user/project/next.config.ts')
  .copy(resolve(scaffoldDir, 'tailwind.config.ts'), '/home/user/project/tailwind.config.ts')
  .copy(resolve(scaffoldDir, 'postcss.config.mjs'), '/home/user/project/postcss.config.mjs')
  .copy(resolve(scaffoldDir, 'eslint.config.mjs'), '/home/user/project/eslint.config.mjs')
  .copy(resolve(scaffoldDir, 'components.json'), '/home/user/project/components.json')
  .copy(resolve(scaffoldDir, 'Caddyfile'), '/home/user/project/Caddyfile')
  .copy(resolve(scaffoldDir, 'src'), '/home/user/project/src')
  .copy(resolve(scaffoldDir, 'prisma'), '/home/user/project/prisma')
  .copy(resolve(scaffoldDir, 'public'), '/home/user/project/public')
  .copy(resolve(scaffoldDir, 'db'), '/home/user/project/db')
  .copy(resolve(scaffoldDir, 'examples'), '/home/user/project/examples')
  .copy(resolve(scaffoldDir, '.zscripts'), '/home/user/project/.zscripts')
  // Copy CLAUDE.md for agent configuration
  .copy(resolve(__dirname, 'CLAUDE.md'), '/home/user/project/CLAUDE.md')
  // Install dependencies
  .runCmd('cd /home/user/project && bun install')
  // Set up database
  .setEnvs({ DATABASE_URL: 'file:/home/user/project/db/custom.db' })
  .runCmd('cd /home/user/project && bunx prisma generate')
  .runCmd('cd /home/user/project && bunx prisma db push')
  // Set working directory
  .setWorkdir('/home/user/project');
```

**Step 3: Write the build script**

```typescript
// template/build.ts
import { Template, defaultBuildLogger } from 'e2b';
import { template } from './template.ts';

console.log('Building E2B template: z-ai-fullstack');
console.log('This may take several minutes on first build...\n');

await Template.build(template, 'z-ai-fullstack', {
  cpuCount: 2,
  memoryMB: 2048,
  onBuildLogs: defaultBuildLogger(),
});

console.log('\nTemplate built successfully!');
console.log('Template alias: z-ai-fullstack');
console.log('You can now create sandboxes with: Sandbox.create("z-ai-fullstack")');
```

**Step 4: Verify types compile**

```bash
cd /Volumes/ssd/developer/z-ai-sandbox-agent && bunx tsc --noEmit
```

Expected: PASS.

**Step 5: Commit**

```bash
cd /Volumes/ssd/developer/z-ai-sandbox-agent && git add template/ && git commit -m "feat: add E2B template with fullstack scaffold, Claude Code, and CLAUDE.md"
```

---

## Task 8: Type-Check and Fix All Compilation Errors

**Files:**
- Modify: any files with type errors

**Step 1: Run full type check**

```bash
cd /Volumes/ssd/developer/z-ai-sandbox-agent && bunx tsc --noEmit
```

**Step 2: Fix any errors**

Common issues to watch for:
- Bun's `ServerWebSocket` vs standard `WebSocket` types in `orchestrator.ts` and `index.ts`
- E2B SDK method signatures (check `sandbox.commands.run` options shape)
- Zod v4 import paths

Fix all errors until `tsc --noEmit` passes cleanly.

**Step 3: Commit**

```bash
cd /Volumes/ssd/developer/z-ai-sandbox-agent && git add -A && git commit -m "fix: resolve all TypeScript compilation errors"
```

---

## Task 9: Add README with Usage Instructions

**Files:**
- Create: `/Volumes/ssd/developer/z-ai-sandbox-agent/README.md`

**Step 1: Write README**

Include:
- What the project does (1-2 sentences)
- Prerequisites (E2B account, Anthropic API key, Bun)
- Environment setup (copy `.env.example` to `.env`, fill in keys)
- Build the template: `bun run build:template` (one-time, ~5 minutes)
- Start the server: `bun dev`
- WebSocket protocol reference (link to design doc or inline summary)
- Example client connection snippet (vanilla JS WebSocket)

**Step 2: Commit**

```bash
cd /Volumes/ssd/developer/z-ai-sandbox-agent && git add README.md && git commit -m "docs: add README with setup and usage instructions"
```

---

## Task 10: End-to-End Smoke Test

**Step 1: Verify the server starts**

```bash
cd /Volumes/ssd/developer/z-ai-sandbox-agent && bun src/index.ts &
```

**Step 2: Test health endpoint**

```bash
curl http://localhost:8080/health
```

Expected: `{"status":"ok"}`

**Step 3: Test WebSocket connection (requires E2B_API_KEY and ANTHROPIC_API_KEY)**

Use `wscat` or a simple script:

```bash
bunx wscat -c ws://localhost:8080/ws
```

Then send:
```json
{"type":"start"}
```

Expected: receive `{"type":"ready","sessionId":"...","previewUrl":"https://3000-....e2b.dev"}`

**Step 4: Stop the server and commit any fixes**

```bash
kill %1
cd /Volumes/ssd/developer/z-ai-sandbox-agent && git add -A && git commit -m "test: verify end-to-end smoke test passes"
```

---

## Summary

| Task | Description | Key Files |
|------|-------------|-----------|
| 1 | Initialize project | package.json, tsconfig.json, .env.example |
| 2 | Define types | src/types.ts |
| 3 | Session store | src/session-store.ts |
| 4 | Sandbox agent (core) | src/sandbox-agent.ts |
| 5 | Orchestrator | src/orchestrator.ts |
| 6 | Entry point | src/index.ts |
| 7 | E2B template | template/template.ts, template/build.ts, template/CLAUDE.md |
| 8 | Fix type errors | All files |
| 9 | README | README.md |
| 10 | Smoke test | — |
