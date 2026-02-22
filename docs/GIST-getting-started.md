# Getting Started with GIST

*Write the gist. The LLM writes the code.*

---

## What is GIST?

GIST (Generative Intent Specification Toolkit) is a language for specifying software that any large language model can interpret into working code. You describe what your system does — models, business rules, API endpoints, state machines — and an LLM generates a complete, buildable project.

GIST sits between natural language prompts (too ambiguous) and traditional source code (too detailed). It gives you structure where it matters and prose where it doesn't.

---

## Your First GIST Project

Let's build a simple bookmark API — users save URLs with tags, and can search them.

### Step 1: Create the manifest

Every GIST project starts with a `gist.yaml` file that describes your infrastructure:

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

### Step 2: Write the spec

Create `bookmarks.gist`:

```gist
project bookmarks
  > Personal bookmark manager. Save URLs, tag them, search later.
  stack: gist.yaml

  always:
    URLs must be valid (http or https)
    tags are lowercase and trimmed

// ─── Models ────────────────────────────────────────────

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

// ─── Module ────────────────────────────────────────────

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

// ─── Tests ─────────────────────────────────────────────

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

### Step 3: Generate code

Feed both files to an LLM with the GIST interpreter instructions:

```
You are a GIST interpreter. Read the attached spec and generate a complete project.

[Attach: GIST-spec-v0.7.md, GIST-interpreter.md, gist.yaml, bookmarks.gist]
```

The LLM produces: Fastify routes, Drizzle models, SQLite migrations, JWT middleware, Vitest tests, `.env.example`, Dockerfile, and a README.

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

### Rules tables are named constants

```gist
rules pricing:
  basic: { price: 0, storage: "5GB", support: "community" }
  pro:   { price: 29, storage: "100GB", support: "email" }
  team:  { price: 79, storage: "1TB", support: "priority" }
```

Accessed by name in `fn` blocks: `pricing[plan].price`.

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

Kits add domain-specific keywords without changing the core spec. Built-in kits: `iac`, `gamedev`, `cli`, `mobile`, `web`, `api`. Community kits can cover anything.

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

- **Read the spec:** `GIST-spec-v0.7.md` — the full language reference
- **Browse examples:** `examples/` — todo app, bookmark API, and more
- **Build a kit:** `GIST-kit-authoring.md` — create your own domain extension
- **Use the interpreter:** `GIST-interpreter.md` — the system prompt for LLM code generation

---

*GIST Getting Started Guide — for use with GIST Language Specification v0.7*
