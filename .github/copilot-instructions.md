# Copilot instructions for `fragments`

Fragments is a Next.js 16 (App Router) app that uses the Vercel AI SDK to stream
LLM-generated code into an E2B sandbox and renders the running result back to
the user. Most non-trivial work touches the chat → schema → sandbox pipeline.

## Commands

Package manager: **pnpm** (lockfile is `pnpm-lock.yaml`), though `npm` works too.

- `pnpm dev` – Next dev server.
- `pnpm build` – production build.
- `pnpm lint` – ESLint (flat config in `eslint.config.mjs`; `sandbox-templates/**` is ignored).
- `pnpm typecheck` – `tsc --noEmit`.

There is no test runner configured in this repo; do not invent one.

## Architecture (the big picture)

The end-to-end flow lives across four layers — change one and you usually need
to update the others:

1. **`app/page.tsx`** – client root. Uses `experimental_useObject` from
   `@ai-sdk/react` to stream a `FragmentSchema` from `/api/chat`. Selected model,
   template, provider API keys, and chat history are persisted in
   `localStorage` via `usehooks-ts`.
2. **`app/api/chat/route.ts`** – server route. Builds prompt via
   `lib/prompt.ts`, resolves the model client via `lib/models.ts` +
   `lib/model-providers.ts`, and calls `streamObject({ schema: fragmentSchema })`.
   Rate-limited per `userID` via `lib/ratelimit.ts` (Upstash) **only when the
   user has no own API key**.
3. **`lib/schema.ts`** – `fragmentSchema` (zod) is the contract the LLM must
   produce. The whole UI/sandbox assumes these exact field names
   (`template`, `code`, `file_path`, `port`, `additional_dependencies`,
   `install_dependencies_command`, …). Changing it breaks every template and
   the sandbox runner.
4. **`app/api/sandbox/route.ts`** – takes the parsed fragment, creates an E2B
   `Sandbox` from the template id, installs `additional_dependencies`, writes
   files into `/home/user/project`, and returns either an
   `ExecutionResultInterpreter` (for `code-interpreter-v1`) or
   `ExecutionResultWeb` (URL of the running server). See `lib/types.ts`.

Other notable pieces:

- **Templates** are defined twice and must stay in sync:
  - `sandbox-templates/<id>/` – `e2b.Dockerfile` + `e2b.toml`, deployed via
    `e2b template build --name <id>` (see README "Adding custom personas").
  - `lib/templates.json` – metadata (entry file, libs, port, instructions)
    consumed by the prompt via `templatesToPrompt` in `lib/templates.ts`.
  The template `id` (JSON key) must equal the deployed E2B template name.
- **Models** are discovered at runtime, not hard-coded: `lib/model-providers.ts`
  declares providers and how to list their models (`anthropic`, `google`,
  `ollama`, or `openai-compatible`); `app/api/models/route.ts` queries them with
  the configured env keys. `lib/models.ts#getModelClient` then maps a
  `providerId` to the right `@ai-sdk/*` factory. Adding a provider requires
  editing **both** files.
- **Auth** is optional Supabase, gated by `NEXT_PUBLIC_ENABLE_SUPABASE`
  (`lib/auth.ts`, `lib/supabase.ts`). When disabled the UI generates an
  anonymous `userID` used as the rate-limit key.
- **Short-link proxy**: `proxy.ts` is a Next middleware-style handler matching
  `/s/:path*` that resolves `fragment:<id>` keys from Upstash KV
  (`lib/kv.ts`); only active when `KV_REST_API_*` are set.
- **Publish**: `app/actions/publish.ts` is the server action that mints the
  short link.

## Conventions

- **Path alias**: import from `@/...` (configured in `tsconfig.json`); avoid
  long relative paths.
- **Prettier** (`.prettierrc`): single quotes, no semicolons, and
  `@trivago/prettier-plugin-sort-imports` controls import order — don't manually
  reorder imports.
- Server routes use `export const maxDuration = 60` (Vercel function limit);
  keep this on any new long-running route.
- The `FragmentSchema.code` field is currently a single string keyed by
  `file_path`, but `app/api/sandbox/route.ts#getFragmentFiles` already handles
  the array-of-files shape. If you reintroduce multi-file output, update the
  schema and the prompt, not just the sandbox.
- **Do not** add lint/format rules to `sandbox-templates/**` — they are E2B
  build contexts, not part of the Next app, and are eslint-ignored.
- React 19 + Next 16 are in use; `eslint-plugin-react-hooks` v7 rules
  `react-hooks/immutability` and `react-hooks/set-state-in-effect` are
  intentionally disabled in `eslint.config.mjs` — don't re-enable them without
  a refactor pass.

## Required env (local dev)

At minimum: `E2B_API_KEY` plus one LLM provider key (e.g. `OPENAI_API_KEY`).
Full list in `README.md` and `.env.template`. Supabase, Upstash KV/Redis, and
PostHog are all optional and code paths gracefully no-op when their env vars
are absent.
