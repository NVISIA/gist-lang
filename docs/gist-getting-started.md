# Getting Started with GIST

*Write the gist. The LLM writes the code.*

---

## What is GIST?

GIST (Generative Intent Specification Toolkit) is a language for specifying software that any large language model can interpret into working code. You describe what your system does — models, business rules, API endpoints, state machines — and an LLM generates a complete, buildable project.

GIST sits between natural language prompts (too ambiguous) and traditional source code (too detailed). It gives you structure where it matters and prose where it doesn't.

---

## Install

**Prerequisites:** Node.js ≥ 18 and [pnpm](https://pnpm.io/) (this repo pins `pnpm@10.30.1` via `packageManager`).

```bash
# Clone the monorepo and install dependencies
git clone https://github.com/NVISIA/gist-lang.git
cd gist-lang
pnpm install

# Build the CLI (and the workspace packages it depends on)
pnpm build

# Link the CLI onto your PATH as `gist`
pnpm --filter @gist-lang/cli link --global

# Verify
gist --version
```

This gives you the `gist` command with tools for scaffolding, validating, formatting, and managing GIST projects.

To update later:

```bash
cd gist-lang && git pull && pnpm install && pnpm build
```

---

The rest of this guide walks through the four post-install flows in the same order you'll see them in the top [README](../README.md) and the [CLI reference](../packages/gist-cli/README.md). Throughout, `/gist.*` commands are **slash commands run inside your AI agent, not at the terminal.**

---

## Init (blank workspace)

Start from a clean slate and author the spec by hand. This flow is for when you already know what you want to build and prefer direct control over the model and module shape.

**Prerequisites:** none.

### Scaffold the project

Interactive (recommended for first-time users):

```bash
gist init bookmarks
```

You'll see something like:

```
? Project name: bookmarks
? Primary language: typescript
? Framework: fastify
? Kits to include: api
? AI agent for code generation: claude-code
? Short description (optional):

✓ created gist.yaml
✓ created bookmarks.gist
✓ installed 8 skills into .claude/commands/

Next:
  - Edit bookmarks.gist to declare your models and modules
  - Run `gist check` to validate
```

Non-interactive (scripts / CI):

```bash
gist init bookmarks --yes --language typescript --framework fastify --kit api --agent claude-code
```

### What gets created

Starter `bookmarks.gist`:

```gist
project bookmarks
  > A short description of what this project does.
  kit: api
  stack: gist.yaml

// Declare your models here:
// User = {
//   id: string, unique, generated, cuid
//   email: string, unique
// }

// Declare your modules here:
// module users
//   to create(email: string) -> User
//     do: create a user
```

Starter `gist.yaml`:

```yaml
project: bookmarks
version: 0.1.0

runtime:
  language: typescript

framework:
  name: fastify
```

### Write the manifest

Edit `gist.yaml` to describe your infrastructure:

```yaml
project: bookmarks
version: 0.1.0
description: Personal bookmark manager with tags and search

runtime:
  language: TypeScript
  platform: Node.js
  package_manager: pnpm

framework:
  name: Fastify

database:
  type: SQLite
  orm: Drizzle
  migrations: managed
  connection:
    env: DATABASE_URL

auth:
  strategy: JWT
  token_expiry: 7d

api:
  style: REST
  prefix: /api
  docs: OpenAPI

testing:
  framework: Vitest

env:
  DATABASE_URL:
    type: string
    default: "file:./dev.db"
  JWT_SECRET:
    type: string
    required: true
    secret: true
  PORT:
    type: integer
    default: 3000

conventions:
  id_format: cuid
  timestamps: ISO-8601-UTC
  soft_delete: false
  json_keys: camelCase
  db_columns: snake_case
```

This tells the LLM: build me a Fastify app in TypeScript with SQLite and JWT auth. Every service, database, and convention is declared here — not in the `.gist` file.

### Write the spec

Edit `bookmarks.gist`:

```gist
project bookmarks
  > Personal bookmark manager. Save URLs, tag them, search later.
  stack: gist.yaml

  always:
    URLs must be valid (http or https)
    tags are lowercase and trimmed

// --- Models ---

Tag = { id: string, generated, cuid; name: string, unique }

Bookmark = {
  id: string, generated, cuid
  url: string
  title: string
  description?: string
  tags: -> Tag[]
  created_at: datetime, generated
  updated_at: datetime, generated
}

// --- Module ---

module bookmarks

  to create(url: string, title: string, description?: string, tags?: string[])
    -> Bookmark | ValidationFailed
    route: POST /bookmarks
    saves: Bookmark, Tag
    do:
      validate URL format
      create or find each tag by name
      create bookmark with tags
    must: url starts with "http://" or "https://"
    eg: create("https://example.com", "Example", tags: ["reference"])
      => { id: "clx...", url: "https://example.com", title: "Example", tags: [{ name: "reference" }] }

  to list(tag?: string, q?: string) -> Bookmark[]
    route: GET /bookmarks
    public
    do:
      if tag provided: filter bookmarks by tag name
      if q provided: search title and description
      order by created_at descending

  to delete(id: string) -> void | NotFound
    route: DELETE /bookmarks/:id
    do:
      find bookmark, delete it and orphaned tags

// --- Tests ---

test create_and_find
  call bookmarks.create("https://gist-lang.dev", "GIST", tags: ["language", "ai"])
  expect: returns Bookmark with 2 tags

  then call bookmarks.list(tag: "ai")
  expect: includes bookmark with title "GIST"

test invalid_url_rejected
  call bookmarks.create("not-a-url", "Bad")
  must fail: ValidationFailed

test search_by_query
  given: bookmark with title "Rust Programming Guide"
  call bookmarks.list(q: "rust")
  expect: includes bookmark with title containing "Rust"
```

That's it. ~60 lines of spec describe a complete API with validation, search, and tests.

### Validate and format

```bash
gist check
```

```
✓ 1 file checked — no issues found.
```

Add `--checklist` for spec-quality feedback (completeness, error handling, test coverage, guard coverage, underspecification):

```bash
gist check --checklist
```

Format in place before committing:

```bash
gist fmt --write
```

When you're happy with the spec, jump to [Generate code](#generate-code).

---

## Init from prompt + `/gist.constitution`

Describe the project in natural language; let the agent generate the first draft; then codify invariants. Use this when you want to get from idea to working spec fast.

**Prerequisites:** an AI agent with GIST skills installed. `gist init --agent <name>` handles this automatically. If you skipped `--agent` at init, run `gist skills install --agent <name>` now.

### Step 1 — stage the intent

```bash
gist init bookmarks --agent claude-code --prompt "a bookmark manager with tags and full-text search"
```

This creates:

```
bookmarks/
  .gist/
    intent.md          ← your prompt, timestamped
  .claude/commands/     ← agent skill files (8 slash commands)
  gist.yaml             ← minimal manifest; /gist.gistify will fill it in
  bookmarks.gist        ← starter with comments; /gist.gistify will populate
```

Open `.gist/intent.md` to inspect what was staged:

```markdown
# Intent

Staged 2026-04-21T16:04:23Z

a bookmark manager with tags and full-text search
```

### Step 2 — materialize the spec

Open your AI agent and run:

```
# run inside your AI agent, not at the terminal
/gist.gistify
```

The agent reads `.gist/intent.md`, infers models / modules / routes from the prose, and writes them into `gist.yaml` and `bookmarks.gist`. A representative result:

```gist
project bookmarks
  > Personal bookmark manager with tags and full-text search.
  kit: api
  stack: gist.yaml

Tag = { id: string, unique, generated, cuid; name: string, unique }

Bookmark = {
  id: string, unique, generated, cuid
  url: string
  title: string
  tags: -> Tag[]
  created_at: datetime, generated
}

module bookmarks
  to create(url: string, title: string, tags?: string[]) -> Bookmark | ValidationFailed
    route: POST /bookmarks
    saves: Bookmark, Tag
    do: validate URL, create or find tags, create bookmark

  to search(q: string) -> Bookmark[]
    route: GET /bookmarks/search
    do: full-text search across title and url
```

### Step 3 — codify principles

```
# run inside your AI agent, not at the terminal
/gist.constitution
```

The agent walks through project invariants — code quality, testing standards, security/auth, data hygiene — and writes them into the project header's `always:` block plus `conventions:` in `gist.yaml`. Representative additions:

```gist
project bookmarks
  > Personal bookmark manager with tags and full-text search.
  kit: api
  stack: gist.yaml

  always:
    URLs must be valid (http or https)
    tags are lowercase and trimmed
    every public intent must declare `guard:`
    every `to` that writes must declare `fails:`
```

```yaml
# added to gist.yaml
conventions:
  id_format: cuid
  timestamps: ISO-8601-UTC
  json_keys: camelCase
  db_columns: snake_case
```

No separate "constitution" file is created — the invariants live in the files you already have, so they flow into code generation automatically.

---

## `/gist.gistify` — augment an existing project

Use the same slash command against a populated workspace to add features (e.g. a new auth flow) without regenerating everything.

**Prerequisites:** an AI agent with GIST skills installed.

### Step 1 — stage the new intent

```bash
gist gistify "Add password reset with email tokens, 15-minute expiry"
```

Alternatives:

```bash
gist gistify --file notes.md            # read from a file
cat notes.md | gist gistify --stdin     # pipe from stdin
```

Each overwrites `.gist/intent.md` with the new prompt.

### Step 2 — run the slash command

```
# run inside your AI agent, not at the terminal
/gist.gistify
```

On a populated workspace the slash command detects the existing files and asks:

```
The project is already populated. What would you like to do?
  1. Replace — discard current specs, regenerate from scratch
  2. Augment — add new models/modules alongside existing ones
  3. Abort — leave everything unchanged
Choose [1/2/3]:
```

Pick **Augment**. The agent writes new models/intents into your existing `.gist` file and shows you the diff before saving. A representative addition:

```gist
PasswordResetToken = {
  id: string, unique, generated
  user_id: -> User
  token: string, secret
  expires_at: datetime
}

module auth
  to request_reset(email: string) -> void | NotFound
    route: POST /auth/reset-request
    saves: PasswordResetToken
    emits: password_reset_requested
    do: find user by email, generate token, email link, record expiry 15 minutes from now
    fails: NotFound when no user with that email
```

---

## `/gist.revise` — close spec gaps

After any init flow, use `/gist.revise` to surface and fix underspecification.

**Prerequisites:** an AI agent with GIST skills installed.

### Step 1 — see the gaps

```bash
gist check --checklist
```

Sample output:

```
bookmarks.gist:

  ⚠ Intent `bookmarks.delete` has no `fails:` clause
      What happens if the bookmark doesn't exist?

  ⚠ Intent `auth.request_reset` uses vague verb "email link"
      Which service sends email? Is there a retry policy?

  ⚠ Model `Bookmark` has no corresponding test
      Add a `test create_bookmark` or similar coverage

3 items to address.
```

### Step 2 — run the slash command

```
# run inside your AI agent, not at the terminal
/gist.revise
```

The agent reads the checklist output and asks up to 5 focused questions:

```
Q1: For `bookmarks.delete`, what should happen if the bookmark
    doesn't exist?
    a) Return NotFound error
    b) Silently succeed (idempotent)
    c) Something else

  > a

Q2: For `auth.request_reset`, which email service should be used,
    and what's the retry policy?

  > use the `mailer` service from gist.yaml, retry 3x with backoff
```

It then surgically patches the affected `.gist` files:

```diff
   to delete(id: string) -> void | NotFound
     route: DELETE /bookmarks/:id
     do:
       find bookmark, delete it and orphaned tags
+    fails: NotFound when no bookmark with that id
```

Loop `/gist.revise` until `gist check --checklist` is clean.

---

## Generate code

Once your specs are clean, produce the project.

**Via an AI agent** (if you installed skills):

```
# run inside your AI agent, not at the terminal
/gist.generate
```

The agent reads your specs, the interpreter instructions, and your manifest, then generates a complete project: routes, models, migrations, tests, Dockerfile, and README.

**Manual LLM prompting** (any LLM, no skills needed):

```bash
gist bundle --output prompt.md
```

This assembles all project inputs into a single prompt you can paste into any LLM.

---

## Key Concepts in 5 Minutes

### Models are data shapes

```gist
User = {
  id: string, generated, uuid
  email: string, unique
  name: string
  created_at: datetime, generated
}
```

The LLM generates: database table, ORM model, API schema, migration.

### Intents are what the system does

```gist
to create_user(email: string, name: string) -> User | ValidationFailed
  route: POST /users
  saves: User
  do: validate email uniqueness, create user
  must: email is valid format
```

`to` = operation with side effects. `fn` = pure function. `flow` = multi-step saga with rollback.

### State machines enforce lifecycles

```gist
OrderStatus = pending | paid | shipped | delivered | cancelled

state OrderLifecycle for Order.status:
  pending -> paid -> shipped -> delivered
  pending -> cancelled
  paid -> cancelled

  on enter paid:
    set paid_at to now
```

The field must exist in the model. The enum values must match the states. Invalid transitions are rejected automatically.

### Modules group related behavior

```gist
module payments
  > Handles checkout and refunds.
  needs: Order, User

  before:
    guard: user is authenticated

  to checkout(order_id) -> Order | NotFound
    route: POST /payments/checkout
    ...
```

### Tests are behavioral

```gist
test checkout_success
  given: user with items in cart
  call payments.checkout(order.id)
  expect: order status is "paid"
```

### Kits extend the language

```gist
project my-app
  kit: web
  stack: gist.yaml
```

Kits add domain-specific keywords without changing the core spec. Built-in kits: `web`, `api`, `cli`, `mobile`, `iac`, `gamedev`. Create your own with `gist kit create <name>`.

---

## CLI Reference

| Command | Description |
|---------|-------------|
| `gist init [name]` | Scaffold a new project |
| `gist init --prompt "..."` | Scaffold and stage a natural-language prompt for `/gist.gistify` |
| `gist gistify [prompt...]` | Stage a prompt in an existing project (also supports `--file` and `--stdin`) |
| `gist check [files...]` | Validate syntax and semantics |
| `gist check --checklist` | Include spec quality checks |
| `gist fmt [files...]` | Format .gist files |
| `gist fmt --write` | Write formatted output in place |
| `gist fmt --check` | Check formatting (CI mode) |
| `gist kit list` | List available kits |
| `gist kit install <name>` | Install a kit |
| `gist kit create <name>` | Scaffold a custom kit |
| `gist kit validate [path]` | Validate kit structure |
| `gist skills install --agent <name>` | Install AI agent skills |
| `gist skills list` | Show installed skills |
| `gist skills agents` | List supported AI agents and their config paths |
| `gist bundle` | Assemble project into a prompt |

See the [full CLI documentation](../packages/gist-cli/README.md) for all options and flags.

---

## Editor Support

Install the **GIST Language** extension for VS Code for:

- **Syntax highlighting** — keywords, types, strings, comments, HTTP methods
- **Real-time diagnostics** — parse errors and semantic warnings as you type
- **Autocomplete** — context-aware completions for keywords, types, kit constructs
- **Hover documentation** — rich docs for models, intents, kit keywords, services
- **Go to Definition** — Ctrl+click on a type name to jump to its declaration
- **Find References** — see everywhere a type, model, or trait is used
- **Rename Symbol** — rename a declaration and all its references
- **Quick Fixes** — "Create model X" for undeclared type errors
- **Document Formatting** — format on save using the GIST formatter

---

## Project Structure

```
my-project/
  gist.yaml              # infrastructure manifest
  app.gist               # main spec (or split across files)
  kits/                   # local custom kits (optional)
    my-kit/
      kit.yaml
      KIT.md
```

### What goes where

| `gist.yaml` | `.gist` files |
|---|---|
| Database type and connection | Models and relationships |
| Auth strategy | Guard rules |
| API prefix and rate limits | Routes and handlers |
| External service config | `uses:` references |
| Env variables | Business rules |
| Framework and runtime | State machines and events |

---

## Common Patterns

### CRUD with soft delete

```gist
trait SoftDeletable {
  is_deleted: bool = false
  deleted_at?: datetime
}

Post = {
  ...SoftDeletable
  id: string, generated, uuid
  title: string
  body: string
}
```

### Auth guard on a module

```gist
module admin
  before:
    guard: user.role is "admin"

  to delete_user(id) -> void | NotFound
    route: DELETE /admin/users/:id
    ...
```

### External service integration

```yaml
# gist.yaml
services:
  stripe:
    type: REST
    base_url: https://api.stripe.com
    auth:
      type: api_key
      key_env: STRIPE_SECRET_KEY
```

```gist
to charge(amount: Cents, customer_id: string) -> Payment | PaymentFailed
  uses: stripe
  do: create payment intent via Stripe
```

### Scheduled jobs

```gist
to cleanup_expired_sessions()
  schedule: every 1 hour
  async
  do: delete sessions older than 24 hours
```

### WebSocket events

```gist
to send_message(channel_id, content) -> Message
  socket: message
  saves: Message
  emits: new_message
  do: validate, save, broadcast to channel members
```

---

## Next Steps

- **Read the spec:** [gist-spec.md](../spec/gist-spec.md) — the full language reference
- **Browse examples:** [examples/](../examples/) — todo app, bookmark API, deployer CLI
- **Build a kit:** [gist-kit-authoring.md](gist-kit-authoring.md) — create your own domain extension
- **Use the interpreter:** [gist-interpreter.md](../spec/gist-interpreter.md) — the system prompt for LLM code generation
- **CLI reference:** [@gist-lang/cli](../packages/gist-cli/README.md) — full command documentation

---

*GIST Getting Started Guide — for use with GIST Language Specification v0.8*
