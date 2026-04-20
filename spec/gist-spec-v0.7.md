# The GIST Language Specification v0.7

*Generative Intent Specification Toolkit — a language for thinking out loud to machines.*

---

## 1. Overview

GIST is a semi-structured language for specifying software that any large language model can interpret into working code, infrastructure, or both. It sits between natural language prompts (too ambiguous) and traditional source code (too detailed). You write the gist. The LLM writes the implementation.

**File extension:** `.gist`
**Manifest:** `gist.yaml`

### Core Beliefs

1. **Intent over implementation.** Say what, not how.
2. **Structure where it disambiguates.** Formal syntax for scope and data flow. Prose for everything else.
3. **Near-determinism.** Same program, different LLMs → functionally equivalent output.
4. **Composability.** Build big things from named small things.
5. **Verifiability.** Every behavior can carry constraints, examples, and tests.
6. **Joy.** If it's tedious to write, the syntax is wrong.
7. **Paradigm-agnostic.** REST, WebSocket, pipelines, event-driven — one language fits all.
8. **Escape when needed.** When prose loses precision, drop to code.

---

## 2. Lexical Basics

**Encoding:** UTF-8. **Indentation:** 2 spaces (defines scope). **No tabs.**

```gist
// line comment
/* block comment */
```

**Line continuation:** `\` at end of line, or implicit within `{ }`.

**Case rules:** Keywords are lowercase. Model/enum/trait names are PascalCase. Everything else is snake_case.

---

## 3. Program Structure

```gist
project name
  > context for the LLM
  kit: domain extensions
  stack: gist.yaml
  style: code conventions
  rules name: { business logic tables }
  always: system invariants
  before: project-wide pre-hooks
  after: project-wide post-hooks

  // types & data
  type Name = primitive | (T, U) | { fields }
  trait Name { shared fields }
  Name = { fields }                    // model
  Name = immutable { fields }          // append-only model
  Name = ephemeral { fields, ttl }     // cache-only model
  Name = value | value                 // enum
  state Lifecycle for Model.field      // state machine

  // modules
  module name
    to operation(args) -> Type
    fn pure_function(args) -> Type
    flow saga(args) -> Type
    on event(args)

  // tests
  test name
```

---

## 4. Project Header

```gist
project clearledger
  > Financial ledger with double-entry bookkeeping.
  > Designed for correctness over performance.

  stack: gist.yaml

  style:
    all monetary calculations use decimal (no floats)
    pessimistic locking for balance updates

  rules currencies:
    USD: { symbol: "$", decimals: 2 }
    JPY: { symbol: "¥", decimals: 0 }
    BTC: { symbol: "₿", decimals: 8 }

  always:
    every debit has an equal and opposite credit
    no financial record is ever deleted
    across accounts:
      sum(balance where type = "asset") == sum(balance where type = "liability") + sum(balance where type = "equity")

  before:
    log audit entry with user, action, timestamp, target entity
  after:
    if write operation: emit to audit_events topic
```

**`project name`** — root declaration.
**`> line`** — context for the LLM.
**`kit:`** — load domain-specific extensions (see §12). Optional.
**`stack: gist.yaml`** — load infrastructure manifest.
**`style:`** — code conventions (prose).
**`rules name:`** — named business config tables. Referenced by name in behavior. `fn` blocks may read rules (they're constants, not side effects). The LLM generates rules as static lookup structures (maps, enums, or constants) accessible at runtime by name — e.g., `priorities["high"].sort_order`.
**`always:`** — system-wide invariants. `across model:` for cross-aggregate constraints (see §13).
**`before:` / `after:`** — project-level hooks that wrap every intent in every module. Precedence: project `before:` → module `before:` → intent → module `after:` → project `after:`.

---

## 5. Data Shapes

### 5.1 Models

```gist
User = {
  id: string, generated, uuid
  email: string, unique
  name: string
  role: Role
  created_at: datetime, generated
  is_deleted: bool = false
}
```

**Field syntax:**

| Pattern | Meaning |
|---------|---------|
| `name: type` | Required |
| `name?: type` | Optional |
| `name: type = val` | Default value |
| `-> Model` | Reference (foreign key) |
| `-> Model[2]` | Exactly 2 references |
| `-> Model[1..500]` | 1 to 500 references |
| `generated` | System-assigned |
| `unique` | Uniqueness constraint |
| `secret` | Never expose or log |
| `computed` | Derived from other data |

**Computed fields:** Derived values with a description of the derivation:

```gist
Account = {
  id: AccountId, generated, uuid
  balance: decimal, computed
    > sum of all posted ledger entries for this account
}
```

The LLM decides the implementation: calculated on read, materialized on write, or cached with invalidation.

### 5.2 Enums

```gist
Role = admin | member | viewer
Status = open | in_progress | done | cancelled
```

### 5.3 Error Types

```gist
NotFound = error {
  code = "NOT_FOUND"
  message: string
}

ValidationFailed = error {
  code = "VALIDATION_FAILED"
  message: string
  fields?: { name: string, reason: string }[]
}
```

### 5.4 Constants

```gist
MAX_TITLE_LENGTH = 200
TOKEN_EXPIRY = "24h"
```

### 5.5 Ephemeral Models

Cache-only data with automatic expiry. Not persisted to database.

```gist
TypingIndicator = ephemeral {
  user: -> User
  channel: -> Channel
  started_at: datetime
  ttl: 5s
}
```

### 5.6 Immutable Models

Append-only records — no updates, no deletes. Corrections use reversal entries.

```gist
LedgerEntry = immutable {
  id: string, generated, uuid
  account: -> Account
  side: Side
  amount: decimal
  posted_at: datetime, generated

  always: amount > 0
}
```

The LLM generates INSERT-only operations, rejects PATCH/PUT/DELETE at the API layer, and does not generate `update()` or `delete()` methods.

| Keyword | Persisted? | Updatable? | Deletable? | Use case |
|---------|-----------|-----------|-----------|----------|
| (none) | DB | Yes | Yes / soft-delete | Normal entities |
| `ephemeral` | Cache | Yes | Auto-expires | Presence, rate limits |
| `immutable` | DB | No | No | Ledger, audit, events |

### 5.7 Data Retention

```gist
Document = {
  ...Timestamped
  id: string, generated, uuid
  storage_key: string
  retain: 7 years
}
```

**`retain: <duration>`** — generates archival/cleanup logic. Valid durations: `30 days`, `90 days`, `1 year`, `7 years`, `10 years`, `forever`. Default for `immutable` models is `forever`.

### 5.8 Traits

Shared field sets with spread syntax:

```gist
trait Timestamped {
  created_at: datetime, generated
  updated_at: datetime, generated
  always: updated_at >= created_at
}

Task = {
  ...Timestamped
  id: string, generated, uuid
  title: string
}
```

`...TraitName` spreads all fields AND all `always:` invariants into the model.

### 5.9 State Machines

```gist
state OrderLifecycle for Order.status:
  cart -> pending_payment -> paid -> shipped -> delivered
  pending_payment -> cancelled
  paid -> refunded

  on enter paid:
    set placed_at to now
  on enter shipped:
    set shipped_at to now
```

**`state Name for Model.field:`** — declares a state machine. The referenced field must exist in the model and its type should be an enum whose values match the declared states. Transitions read left-to-right. Invalid transitions are automatically rejected. The first state in the first transition line is the initial state.

**Conditional transitions:**

```gist
in_transit -> at_customs when is_international
```

`when condition` — transition only valid when condition is true.

**Actions without transition:**

```gist
on customs_rejected while at_customs:
  notify shipper with rejection details
  // stays in at_customs — no transition
```

`on event while state:` — handles events in a specific state without transitioning.

---

## 6. Type System

### 6.1 Primitives

`string`, `int`, `float`, `decimal`, `number`, `bool`, `date`, `datetime`, `bytes`, `any`, `void`

**`decimal`** — fixed-point. Never floating-point. Stored as `NUMERIC`/`DECIMAL` in PostgreSQL. The LLM selects the appropriate library per runtime (Decimal.js, rust_decimal, etc.).

**`bytes`** — binary data (photos, signatures, uploads). In APIs: multipart or base64. In models: stored as a reference to object storage.

### 6.2 Composites

| Syntax | Meaning |
|--------|---------|
| `T[]` | List |
| `T?` | Optional |
| `T \| U` | Union |
| `{ a: T, b: U }` | Inline shape |
| `map<K, V>` | Key-value map |
| `-> Model` | Reference |
| `-> Model[n..m]` | Reference with cardinality |
| `result<T>` | Partial success (data + failures + counts) |

### 6.3 Tagged Types

Branded primitives with semantic meaning:

```gist
type Cents = int
type Email = string
type UserId = string
```

The LLM generates validation appropriate to the tag (Email → format check) and never silently converts between incompatible tags.

**With capabilities:**

```gist
type Cents = int {
  arithmetic: +, -
  comparable
  display: currency
}

type Decimal = string {
  arithmetic: +, -, *, /
  comparable
  roundable: banker
}
```

| Capability | Meaning |
|-----------|---------|
| `arithmetic: ops` | Math operations (`+`, `-`, `*`, `/`) |
| `comparable` | Ordering and equality |
| `roundable: mode` | Rounding semantics (`banker`, `half_up`, `truncate`) |
| `precision: n` | Fixed decimal places |
| `display: hint` | Formatting hint (`currency`, `percentage`, `duration`) |
| `format: pattern` | Validation pattern |

**Structured tagged types:**

```gist
type Coord = (float, float)                    // tuple

type Money = {                                  // value object
  amount: decimal
  currency: Currency
} {
  arithmetic: +, -
  comparable
  display: currency
}
```

Tuples and structured types are value objects — no identity, no persistence, compared by value.

| Need | Syntax |
|------|--------|
| Branded primitive | `type X = primitive` |
| Primitive with behavior | `type X = primitive { caps }` |
| Tuple | `type X = (T, U)` |
| Value object | `type X = { fields }` |
| Value object with behavior | `type X = { fields } { caps }` |

---

## 7. Intents

### 7.1 `to` — Operations

```gist
to name(params) -> ReturnType | ErrorType
  metadata
  do:
    behavior
  fails:
    ErrorType when condition
  must: constraints
  ensure: post-conditions
  eg: examples
```

**Metadata annotations:**

| Annotation | Purpose |
|-----------|---------|
| `needs:` | Precondition |
| `saves:` | Persists data |
| `emits:` | Fires event |
| `route:` | HTTP endpoint |
| `socket:` | WebSocket event |
| `guard:` | Auth check |
| `uses:` | Infrastructure or external service |
| `schedule:` | Time-based trigger |
| `public` | No authentication required |
| `async` | Long-running |
| `trace` | LLM explains reasoning |

**`public`** explicitly means no auth. Without it, absence of `guard:` is ambiguous.

**`do:` block** — optional behavior boundary. Without `do:`, bare prose is behavior.

**Progressive disclosure** — minimal intents are one line:

```gist
to health_check() -> { status: "ok" }
```

Full intents use all blocks:

```gist
to create_task(title, due?: date) -> Task | ValidationFailed
  route: POST /tasks
  guard: user is member or admin
  saves: Task
  emits: task_created
  do:
    validate and create
  fails:
    ValidationFailed when title is empty
  must: due date is future
  ensure: returned task.status is "open"
  eg: create_task("Test") => { id: "t_1", status: "open" }
```

### 7.2 `fn` — Pure Functions

Stateless, side-effect-free transforms. May read `rules:` blocks (constants).

```gist
fn calculate_discount(subtotal: Cents, promo: Promotion) -> Cents
  match promo.type:
    "percentage" -> subtotal * promo.value / 100
    "fixed_amount" -> promo.value

  must: result never negative, never exceeds subtotal

  eg:
    calculate_discount(10000, { type: "percentage", value: 20 }) => 2000
```

| | `fn` | `to` |
|-|------|------|
| Side effects | None | May save, emit, call services |
| Auth | Never | Can use `guard:` |
| Rules access | Yes (read-only) | Yes |
| HTTP/WS | Never | Can use `route:`, `socket:` |

### 7.3 `flow` — Sagas

Multi-step operations with compensating rollback:

```gist
flow checkout(cart_id, address: Address)
  -> Order | OutOfStock | PaymentFailed
  route: POST /checkout

  stage validate:
    verify cart not empty, calculate totals

  stage reserve_inventory:
    for each item: inventory.reserve(item.product_id, item.quantity)
    compensate:
      for each item: inventory.release(item.product_id, item.quantity)

  stage create_payment:
    create Stripe payment intent
    compensate:
      cancel payment intent

  stage finalize:
    create Order, clear cart, emit order_placed
```

Stages execute sequentially. On failure at stage N, `compensate:` blocks for stages N-1 through 1 run in reverse order. Compensations are best-effort.

### 7.4 `code:` — Escape Hatch

When prose loses dangerous precision — financial calculations, complex algorithms, regulatory logic:

```gist
fn calculate_position(trades: Trade[]) -> { quantity: decimal, avg_cost: decimal }
  > FIFO cost basis calculation.

  code:
    long_lots = []
    net_quantity = 0
    total_cost = 0

    for each trade sorted by executed_at:
      if trade.side == "buy":
        long_lots.append((trade.filled_quantity, trade.average_fill_price))
        net_quantity += trade.filled_quantity
        total_cost += trade.filled_quantity * trade.average_fill_price
      if trade.side == "sell":
        remaining = trade.filled_quantity
        while remaining > 0 and long_lots not empty:
          lot = long_lots[0]
          if lot.quantity <= remaining:
            remaining -= lot.quantity
            total_cost -= lot.quantity * lot.price
            net_quantity -= lot.quantity
            long_lots.remove_first()
          else:
            lot.quantity -= remaining
            total_cost -= remaining * lot.price
            net_quantity -= remaining
            remaining = 0

    avg_cost = total_cost / net_quantity if net_quantity > 0 else 0
    return { quantity: net_quantity, avg_cost }
```

`code:` blocks use Python-like pseudocode. The LLM translates them near-literally, preserving algorithm structure, variable names, and operation ordering. Can coexist with `do:` in the same intent. Can appear in `to`, `fn`, `flow` stages, and `on` handlers.

| Situation | Use |
|-----------|-----|
| CRUD, simple logic | Prose (`do:`) |
| Complex algorithms, financial math, regulatory logic | `code:` |

---

## 8. Events & Real-Time

### 8.1 Event Handlers

```gist
on order_placed(order):
  send confirmation email to order.user
```

**With filters:**

```gist
on status_changed(shipment, new_status) when new_status == "out_for_delivery":
  send SMS to receiver with ETA
```

`on event when condition:` — handler only fires when condition is true.

### 8.2 WebSocket

```gist
to send_message(channel_id, content) -> Message
  socket: message
  saves: Message
  emits: new_message

  do:
    validate, save, broadcast to channel members
```

`socket: event_name` maps to WebSocket event. Can coexist with `route:`.

### 8.3 Scheduling

```gist
to cleanup_expired_carts()
  schedule: every 15 minutes
  async

  do:
    find expired carts, release reservations
```

| Pattern | Meaning |
|---------|---------|
| `every 15 minutes` | Interval |
| `every day at 2:00 UTC` | Daily |
| `every Monday at 9:00 UTC` | Weekly |
| `first day of month at 6:00 UTC` | Monthly |
| `cron: "*/15 * * * *"` | Raw cron |

---

## 9. Control Flow

```gist
// conditionals
if status is "done":
  set completed_at to now
else if status is "cancelled":
  require reason

// iteration
for each user in active_users:
  send notification

// error handling
try:
  send notification
or:
  log failure, continue

// pattern matching
match event_type:
  "payment" -> process_payment(payload)
  "refund" -> process_refund(payload)
  _ -> log and discard

// piping
validate(data) -> create_account -> send_welcome

// time delay
after 30s:
  set presence to "offline"
```

---

## 10. Modules

```gist
module auth
  > JWT-based authentication.
  needs: User

  before:
    validate token

  to register(email, password, name) -> User | error
    route: POST /auth/register
    ...
```

**`module name`** — groups related intents. **`needs:`** — dependencies. **`before:` / `after:`** — module-level hooks.

---

## 11. Composition

```gist
use "./shared/auth.gist" as auth      // import

extend create_task                      // append behavior
  also log an activity entry

refine create_task                      // modify behavior
  add param: priority: int = 0

pass to process_payment(payload)        // delegate
```

---

## 12. Kits

A **kit** is a domain-specific extension to GIST that adds keywords, constructs, interpretation rules, and `gist.yaml` sections — without modifying the core spec. The core spec stays lean and paradigm-agnostic. Kits stack on top.

The key insight: since GIST is LLM-interpreted, a kit doesn't need a compiler plugin or parser extension. It needs to be clear enough that an LLM reading the core spec plus the kit spec can generate correct code. The extension mechanism is semantic, not syntactic.

### 12.1 Using a Kit

```gist
project shopfront-infra
  > AWS infrastructure for e-commerce platform.
  kit: iac
  stack: gist.yaml
```

Multiple kits:

```gist
project mmo_backend
  > MMO with real-time combat and persistent world.
  kit: gamedev, multiplayer
  stack: gist.yaml
```

**`kit:`** tells the LLM: load these additional specs before interpreting this file. The LLM reads the core GIST spec, then each kit spec, then interprets the `.gist` file with the combined vocabulary.

### 12.2 Kit Structure

A kit is a directory with two files:

```
kits/
  iac/
    kit.yaml          # metadata + gist.yaml extensions + IDE constructs
    KIT.md            # interpretation rules, examples (for LLMs)
  gamedev/
    kit.yaml
    KIT.md
```

**`kit.yaml`** — metadata, manifest extensions, and IDE-readable construct definitions:

```yaml
kit: iac
version: 1.0.0
author: gist-core
description: Infrastructure as Code — generates Terraform HCL, Pulumi, or CDK
license: MIT

yaml_sections:          # new gist.yaml sections this kit adds
  iac: { ... }
  providers: { ... }
  backend: { ... }

keywords: [resource, group, variable, output, data]

extends: [always, rules, needs]   # core constructs this kit extends

constructs:             # IDE-readable metadata (see §12.7)
  resource:
    kind: block
    name_style: PascalCase
    doc: Declares a cloud infrastructure resource
    fields:
      provider: { type: identifier }
      needs: { type: type_name_list }
    supports: [must, context_line, field_passthrough]
    snippet: "resource ${1:Name} { ${0} }"
  # ... (see kits/iac/kit.yaml for full definitions)
```

`kit.yaml` serves two audiences: **LLMs** read `yaml_sections`, `keywords`, and `extends` during code generation. **IDEs** read `constructs` for syntax highlighting, autocomplete, linting, and snippets. See §12.7 for the full schema. See each kit's `kit.yaml` for complete examples.

**`KIT.md`** — the human-and-LLM-readable spec extension. Describes what the new keywords mean, shows full syntax with examples, and provides interpretation rules — exactly like the core spec, but scoped to this domain. This is the meat of any kit. IDEs may also parse `KIT.md` for hover documentation.

### 12.3 Kit Resolution

Updated parse order:

```
1. gist.yaml (infrastructure + services + kit yaml sections)
2. kit specs (in declaration order)
3. project header
4. ... (rest of core parse order)
```

Resolution rules for kits:

1. **Kit keywords are scoped.** If two kits define the same keyword, the LLM uses context and `kit:` declaration order to disambiguate. If still ambiguous: `// GIST: ambiguous — assumed iac.resource`.
2. **Kit interpretation rules supplement, never override, core rules.** Core rule 4 (`always:` overrides everything) still wins.
3. **Kit yaml sections merge into gist.yaml.** The LLM reads `providers:` because the iac kit declared it.
4. **Unknown constructs in a kit-enabled project are errors.** If you use `resource` without `kit: iac`, the LLM flags it.
5. **Kits may extend core constructs.** A kit can give new meaning to `always:`, `rules:`, `needs:`, etc. within its domain. The core semantics still apply; the kit adds domain-specific interpretation.

### 12.4 Creating a Kit

Anyone can create a kit. No changes to the core spec required. Write a `kit.yaml` and a `KIT.md`, publish it, and any GIST project can use it.

**Referencing kits:**

```gist
// built-in kit (ships with GIST)
kit: iac

// local kit (in project directory)
kit: ./kits/my-custom-kit

// published kit (registry or git)
kit: gist-kits/gamedev@1.0
kit: github:username/gist-kit-ml@0.3
```

**What a `KIT.md` must contain:**

1. **Keywords** — every new keyword, with syntax and meaning
2. **Constructs** — how the new syntax looks (examples, not necessarily EBNF)
3. **Interpretation rules** — how the LLM generates code from the new constructs
4. **Code generation expectations** — what files/artifacts the LLM produces
5. **Examples** — at least one complete worked example

**What a `KIT.md` may contain:**

- Grammar productions (EBNF) for kits that want formal rigor
- Compatibility notes with other kits
- Engine/framework-specific guidance

### 12.5 Built-in Kits

GIST ships with a set of maintained kits for common domains. These are documented separately in their own `KIT.md` files:

| Kit | Domain | Key constructs |
|-----|--------|----------------|
| `iac` | Infrastructure as Code | `resource`, `group`, `variable`, `output`, `data` |
| `gamedev` | Game development | `scene`, `entity`, `component`, `system`, `input` |
| `cli` | Command-line apps | `command`, `arg`, `flag`, `prompt`, `output` |
| `mobile` | Mobile apps | `screen`, `nav`, `gesture`, `sheet`, `toast` |
| `web` | Web frontends | `page`, `component`, `layout`, `slot`, `client_state` |
| `api` | API-first design | `endpoint`, `version`, `paginate`, `rate_limit`, `middleware` |

Community kits can cover any domain: `ml-pipeline`, `embedded`, `data-pipeline`, `blockchain`, `cms`, and more.

### 12.6 Kit Design Guidelines

1. **Reuse core constructs** before inventing keywords — state machines, events, rules, `fn`, `code:`.
2. **Minimize keywords** — 5-15, not 50.
3. **Follow naming conventions** — keywords lowercase, types PascalCase.
4. **Document interpretation rules** — the LLM needs to know what to generate.
5. **Provide a complete example** — `.gist` input to generated output.
6. **Declare yaml sections** — infrastructure config goes in `kit.yaml`.
7. **Don't duplicate core** — extend `always:`, don't create `constraints:`.
8. **Version with semver.** Breaking changes bump major.
9. **Define constructs for tooling** — IDEs need `constructs:` without parsing `KIT.md`.

### 12.7 Construct Definitions for Tooling

The `constructs:` section in `kit.yaml` provides machine-readable metadata for IDE tooling — syntax highlighting, autocomplete, linting, and snippet expansion.

**Schema:**

```yaml
constructs:
  <keyword>:
    kind: block | declaration | inline
    name_style: PascalCase | identifier | none
    doc: Short description for hover tooltips
    fields:
      <field_name>:
        type: identifier | type_name | type_name_list | prose
              | literal | expression | boolean | list | object
        required: true | false
        doc: Field description
        values: [allowed, values]        # autocomplete options
        completions: [suggested, items]  # non-exhaustive suggestions
    children: [<keyword>, ...]           # nestable kit constructs
    supports: [must, context_line, always, field_passthrough, code]
    snippet: "keyword ${1:Name} { ${0} }"  # TabStop syntax
```

**`kind`** — `block` opens with `{ }`, `declaration` uses INDENT/DEDENT, `inline` takes no body. **`name_style`** — expected casing for the construct name (`none` for unnamed constructs). **`children`** — which kit keywords can nest inside (e.g., `group` allows `resource`). **`supports`** — which core blocks (`must:`, `always:`, `code:`, etc.) the construct accepts. **`snippet`** — TabStop syntax compatible with LSP and VSCode.

---

## 13. Verification & Testing

### 13.1 Invariants

**`always:`** — project or module scope. **`across model:`** — cross-aggregate constraints:

```gist
always:
  no balance goes negative
  across accounts:
    sum(balance where type = "asset") == sum(balance where type = "liability") + sum(balance where type = "equity")
```

`across` generates aggregate-level enforcement (DB constraints, verification queries, or reconciliation jobs).

### 13.2 Post-conditions

**`ensure:`** — intent scope:

```gist
ensure: balance_after == balance_before - amount
```

### 13.3 Tests

```gist
// standard
test register_success
  call auth.register("bob@co.io", "pass1234", "Bob")
  expect:
    returns User with email "bob@co.io"
    role is "member"

// external event trigger
test trade_fills
  given: pending trade
  trigger fill_received(trade.order_id, "10", "149.50")
  expect: trade status is "filled"

// negative test
test immutable_entry_cannot_be_updated
  given: posted journal entry J1
  must fail:
    update J1.memo to "changed"
  expect: error indicating immutability

// async / delayed
test presence_offline_after_disconnect
  call realtime.disconnect(alice.id)
  expect after 30s:
    alice.presence is "offline"

// WebSocket broadcast
test message_broadcasts
  given: channel with Alice and Bob connected
  call realtime.send_message("general", "Hello!") as Alice
  expect client Bob receives:
    message with content "Hello!"

// multi-context
test tenant_isolation
  as Alice in tenant A:
    call tasks.list_tasks()
    expect: only tenant A tasks
  as Bob in tenant B:
    call tasks.list_tasks()
    expect: only tenant B tasks
```

| Keyword | Purpose |
|---------|---------|
| `given:` | Setup / preconditions |
| `call` | Invoke an intent |
| `trigger` | Fire an event handler |
| `then` | Chain calls sequentially |
| `expect:` | Assert outcomes |
| `expect after <dur>:` | Assert after delay |
| `expect client X receives:` | Assert WebSocket delivery |
| `must fail:` | Assert action should error |
| `as X in Y:` | Set user/tenant context |

---

## 14. The Interpretation Contract

### 14.1 Parse Order

```
1. gist.yaml (infrastructure + services + kit yaml sections)
2. kit specs (in declaration order from kit: line)
3. project header (context, style, rules, always, hooks)
4. types (tagged types with capabilities, traits)
5. data shapes (models, enums, errors, ephemeral, immutable, state machines)
6. modules (dependency order)
7. intents, flows, functions within each module
8. tests
```

### 14.2 Resolution Rules

1. **Explicit beats implicit.** Written types, constraints, behavior → follow exactly.
2. **Examples are truth.** `eg:` overrides contradicting prose.
3. **`must:` overrides `do:`.** Constraints beat behavior steps.
4. **`always:` overrides everything.** Project invariants supersede all.
5. **State machines are enforced.** No undeclared transitions. `when` guards are checked.
6. **Traits spread fully.** Fields AND `always:` invariants.
7. **Tagged types are boundaries.** No silent conversion between incompatible tags.
8. **Capabilities are contracts.** Declared operations must be generated.
9. **`fn` is pure.** No side effects. Reading `rules:` is allowed.
10. **`flow` compensates in reverse.** On failure, rollback stages in reverse order.
11. **`code:` is near-literal.** Preserve algorithm structure. Do not reinterpret.
12. **`immutable` is absolute.** Never generate update/delete for immutable models.
13. **`public` means no auth.** No authentication middleware generated.
14. **Project hooks wrap all.** Run around every intent in every module.
15. **`across` is enforced.** Cross-aggregate invariants generate verification logic.
16. **Infer conservatively.** Unknown types → narrowest reasonable type.
17. **Don't invent behavior.** Missing spec = out of scope.
18. **Flag uncertainty.** `// GIST: ambiguous — assumed X` in generated code.

### 14.3 Error Mapping

| Error Type | HTTP Status |
|-----------|------------|
| `NotFound` | 404 |
| `Unauthorized` | 401 |
| `Forbidden` | 403 |
| `ValidationFailed` | 422 |
| `RateLimited` | 429 |
| `Conflict` | 409 |
| Generic `error` | 500 |

### 14.4 `uses:` Resolution

The LLM looks up the name in gist.yaml infrastructure sections (`cache`, `events`, `search`, `storage`), then in `services:`. Generates client code with connection config, auth handling, and error wrapping. Note: `database`, `auth`, and `api` are implicit — they're configured globally, not referenced per-intent.

### 14.5 Code Generation Expectations

**Without kits:** source code, package manifest, database migrations, env template, Dockerfile, README — plus as needed: WebSocket server, scheduler, cache, search client, state machine validation, decimal library, immutable enforcement, service clients, middleware, retention jobs, cross-aggregate verification.

**With kits:** each kit's `KIT.md` specifies additional outputs. The LLM follows kit interpretation rules alongside core rules.

---

## 15. Keyword Quick Reference

```
Structure:    project  kit:  stack:  style:  rules:  always:  across  module
Hooks:        before:  after:  guard:
Types:        type X = primitive  type X = primitive { caps }
              type X = (T, U)    type X = { fields } { caps }
              trait Name { }     ...TraitName
Data:         = { }  = a | b  error { }  ephemeral { }  immutable { }
              ? (optional)  -> (ref)  [n] (exact)  [n..m] (range)
              ttl:  retain:  computed
State:        state Name for Model.field:  when  on enter:
              on event while state:  via
Intents:      to  fn  flow  public  async  trace
              needs:  saves:  emits:  route:  socket:  uses:  schedule:
Behavior:     do:  stage:  compensate:  code:
              must:  ensure:  eg:  fails:
Control:      if  else  for each  continue  try  or  match  _  after <dur>:
Events:       on  on when  emits:  broadcast
Kits:         kit:  kit.yaml  KIT.md  yaml_sections  keywords  extends
              constructs  kind  snippet  supports  children
Composition:  use  extend  refine  pass to  ->  as
Testing:      test  given:  call  then  trigger  expect:
              expect after:  expect client receives:
              must fail:  as X in Y:
Results:      T | error  result<T>  T | NamedError
```

---

## 16. IDE & Tooling

GIST targets two interpreters: LLMs (prose) and IDE tooling (structured data). The `kit.yaml` `constructs` section bridges this gap.

### 16.1 Language Server Protocol

A GIST LSP provides standard features: syntax highlighting (core grammar + kit `keywords`), autocomplete (kit `constructs.fields` + project scope), linting (grammar + constructs + `gist.yaml` validation), hover docs (kit `constructs.doc` + `KIT.md`), go-to-definition, and snippet expansion.

**LSP startup:** read `gist.yaml` → resolve `kit:` line → load each kit's `kit.yaml` → parse `.gist` files with combined vocabulary → validate.

### 16.2 Syntax Highlighting

Core keywords are static. Kit keywords register dynamically at project load from each kit's `keywords` list.

**TextMate scopes:** `keyword.control.gist` (project, module, kit:), `keyword.declaration.gist` (to, fn, flow, on), `keyword.constraint.gist` (always:, must:, ensure:), `keyword.kit.gist` (kit keywords), `entity.name.type.gist` (PascalCase types), `comment.context.gist` (> lines), `source.pseudocode.gist` (code: blocks), `string.unquoted.prose.gist` (do:/must: prose).

### 16.3 Autocomplete

Context-aware: top-level suggests core + kit keywords, inside constructs suggests fields from `constructs.fields` with dropdown values, type positions suggest models/enums/primitives, `uses:` suggests `gist.yaml` services, `kit:` suggests available kits.

### 16.4 Linting & Diagnostics

Key diagnostics: unknown keyword without kit (error), missing required field in kit construct (warning), `uses:` referencing undefined service (error), undeclared model in type position (warning), invalid state machine transition (error), purity violation in `fn` (error), kit keyword without `kit:` declaration (error).

### 16.5 Project Discovery

IDE discovers structure from existing files — no additional config needed. `gist.yaml` provides infrastructure data, `*.gist` files are source, `kits/` directories contain local kits. Remote kits (`gist-kits/gamedev@1.0`, `github:user/kit@0.3`) are resolved, downloaded, and cached like package manager dependencies.

---

## 17. Reserved for Future Versions

Concurrency (`parallel`, `await`, `race`), standard library (`use std/crud`), LLM negotiation (`clarify:`), file versioning, kit registry and discovery, multi-file modules, generics, hierarchy/tree queries, strategy/policy patterns.

---

*GIST Language Specification v0.7 — Draft*
