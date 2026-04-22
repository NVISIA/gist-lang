# Kit Authoring Guide

*How to create domain-specific extensions for the GIST language.*

---

## What is a Kit?

A kit adds domain-specific keywords, constructs, and interpretation rules to GIST without modifying the core spec. When a developer writes `kit: my-kit` in their project header, the LLM loads your kit's spec alongside the core spec and uses both to generate code.

Kits are the extension mechanism that makes GIST general-purpose. The core spec handles models, types, intents, events, state machines, and testing. Kits add everything else — infrastructure, game engines, CLI tools, web frontends, APIs, mobile apps, or any domain you can imagine.

---

## Kit Structure

A kit is a directory with two files:

```
kits/
  my-kit/
    kit.yaml    # metadata, yaml sections, IDE constructs
    KIT.md      # interpretation rules, examples (for LLMs and humans)
```

**`kit.yaml`** is machine-readable. LLMs read it for yaml sections and keyword lists. IDEs read it for syntax highlighting, autocomplete, and linting.

**`KIT.md`** is the prose specification. LLMs read it to understand what your keywords mean, how to interpret them, and what code to generate. This is the heart of your kit.

---

## Step-by-Step: Building a Kit

Let's build a `notifications` kit that adds push notifications, in-app messages, and email templates to GIST projects.

### Step 1: Design your keywords

Before writing anything, decide what new constructs your domain needs. Start with the developer experience — what would a GIST author want to write?

```gist
project my-app
  kit: notifications

notification welcome_email
  channel: email
  to: user.email
  subject: "Welcome to {{app_name}}"
  template: welcome
  delay: none

notification order_shipped
  channel: push, in_app
  to: order.user
  title: "Your order shipped!"
  body: "{{order.id}} is on its way. Track it here."
  action: deep_link("/orders/{{order.id}}")
  delay: none

notification trial_ending
  channel: email, push
  to: user.email
  schedule: 3 days before user.trial_ends_at
  subject: "Your trial ends soon"
  template: trial_reminder
```

From this, I see three keywords: `notification` (the main construct), plus maybe `template` (reusable content blocks) and `channel` (channel configuration). Let's keep it simple — just `notification` and `template`.

**Guideline: minimize keywords.** A good kit adds 3-10 keywords. If you're above 15, you're probably duplicating core constructs.

### Step 2: Create kit.yaml

```yaml
kit: notifications
version: 1.0.0
author: your-name
description: Push notifications, in-app messages, and email templates
license: MIT

# New gist.yaml sections
yaml_sections:
  notifications:
    description: Notification channel configuration
    fields:
      email:
        type: object
        fields:
          provider: { type: string, required: true, values: [sendgrid, ses, mailgun, postmark] }
          from_env: { type: string, required: true }
          template_dir: { type: string }
      push:
        type: object
        fields:
          provider: { type: string, required: true, values: [fcm, apns, onesignal] }
          key_env: { type: string, required: true }
      in_app:
        type: object
        fields:
          storage: { type: string, values: [database, redis] }
          max_unread: { type: integer }

# Keywords this kit introduces
keywords:
  - notification
  - template

# Core constructs this kit extends
extends:
  - on        # notifications can trigger on events
  - emits     # intents can emit notifications

# IDE-readable construct definitions
constructs:
  notification:
    kind: declaration
    name_style: identifier
    doc: Declares a notification that can be sent through one or more channels
    fields:
      channel:
        type: list
        required: true
        values: [email, push, in_app]
        doc: Delivery channel(s)
      to:
        type: expression
        required: true
        doc: Recipient expression (e.g., user.email, order.user)
      subject:
        type: prose
        doc: Email subject line (supports {{interpolation}})
      title:
        type: prose
        doc: Push/in-app notification title
      body:
        type: prose
        doc: Notification body text
      template:
        type: identifier
        doc: Reference to a named template
        completions: [welcome, reset_password, invoice, reminder]
      action:
        type: prose
        doc: Action on tap/click (deep_link, url, dismiss)
      delay:
        type: prose
        doc: Send delay (none, 5m, 1h, or expression)
      schedule:
        type: prose
        doc: Scheduled send (relative to a datetime field)
    supports: [context_line, must]
    snippet: |
      notification ${1:name}
        channel: ${2:email}
        to: ${3:user.email}
        ${0}

  template:
    kind: declaration
    name_style: identifier
    doc: Reusable notification content template
    fields:
      subject:
        type: prose
        doc: Email subject line
      body:
        type: prose
        doc: Template body (supports {{variables}})
      variables:
        type: list
        doc: Required template variables
    supports: [context_line]
    snippet: |
      template ${1:name}
        subject: "${2:Subject}"
        body: "${3:Body text}"
        variables: [${0}]
```

**Key decisions explained:**

- `yaml_sections` — the kit needs infrastructure config (which email provider? which push service?). This goes in `gist.yaml`, not `.gist` files.
- `keywords` — just two: `notification` and `template`.
- `extends` — notifications interact with core constructs: they fire `on` events and intents can reference them via `emits`.
- `constructs` — full IDE metadata so editors can autocomplete fields, validate channels, and offer snippets.

### Step 3: Write KIT.md

This is where you teach the LLM how to interpret your keywords. Structure it like the core spec: keywords with syntax, interpretation rules, code generation expectations, and a complete example.

```markdown
# GIST Kit: Notifications

*Push notifications, in-app messages, and email templates.*

---

## Overview

The notifications kit adds constructs for declaring and sending
notifications across multiple channels (email, push, in-app).
Notifications are declared once and the LLM generates the
delivery infrastructure for each configured channel.

**Activate:** `kit: notifications` in your project header.

**Requires `gist.yaml` sections:** `notifications` (at least one
channel configured).

---

## Keywords

### `notification` — Notification Declarations

notification welcome_email
  channel: email
  to: user.email
  subject: "Welcome to {{app_name}}"
  template: welcome

**`notification name`** declares a notification. The LLM generates
a send function, channel-specific delivery code, and template
rendering.

**Fields:**

| Field | Required | Meaning |
|-------|----------|---------|
| `channel:` | yes | One or more: email, push, in_app |
| `to:` | yes | Recipient expression |
| `subject:` | email only | Email subject line |
| `title:` | push/in_app | Notification title |
| `body:` | no | Inline body text |
| `template:` | no | Named template reference |
| `action:` | no | Tap/click action |
| `delay:` | no | Send delay |
| `schedule:` | no | Scheduled relative to a field |

**Multi-channel:** When multiple channels are listed, the LLM
generates delivery code for each. If one channel fails, others
still send (best-effort).

**Template interpolation:** `{{variable}}` in subject, title,
and body is replaced at send time. Variables come from the
notification's trigger context.

### `template` — Reusable Templates

template welcome
  subject: "Welcome to {{app_name}}, {{user.name}}!"
  body:
    Thanks for signing up. Here's what you can do next:
    - Complete your profile
    - Explore the dashboard
    - Invite your team
  variables: [app_name, user.name]

**`template name`** declares a reusable content block. Notifications
reference templates by name via `template: name`. The LLM generates
template files appropriate to the email provider (HTML for SendGrid,
Handlebars for Mailgun, etc.).

---

## How Core Constructs Work with Notifications

### Triggering via events

on order_shipped(order):
  send order_shipped to order.user

The `send <notification>` pattern in event handlers triggers
the named notification. The handler's arguments become the
template context.

### Triggering via intents

to register(email, password, name) -> User
  saves: User
  emits: welcome_email

When an intent lists a notification name in `emits:`, the
notification sends after the intent completes successfully.

### Conditional notifications

notification trial_ending
  channel: email, push
  to: user.email
  schedule: 3 days before user.trial_ends_at
  must: user.plan is "trial"

`must:` constraints on notifications act as send conditions.
The notification only fires when the condition is true.

---

## Interpretation Rules

When `kit: notifications` is active, the LLM:

1. Generates a notification service/module with a `send(name, context)` method
2. For each `notification` declaration, generates channel-specific delivery:
   - **email:** renders template, calls email provider API
   - **push:** formats payload, calls push provider API
   - **in_app:** creates record in database/cache, marks as unread
3. For `template` declarations, generates template files per provider format
4. Wires `emits: notification_name` in intents to trigger the notification
5. Wires `send notification_name` in event handlers to trigger delivery
6. For `schedule:` notifications, generates a scheduled job that checks the condition and sends
7. For `delay:` notifications, generates a delayed job (queue-based or setTimeout)
8. Generates delivery status tracking (sent, delivered, failed, read) for in_app notifications
9. Uses `gist.yaml` `notifications:` section for provider credentials and config

---

## Code Generation Expectations

The LLM produces:

- `src/notifications/` — notification service, channel adapters, template renderer
- `src/notifications/templates/` — email templates (HTML/text)
- For each channel: provider-specific client (SendGrid SDK, FCM SDK, etc.)
- Database migration for in_app notification storage (if in_app channel configured)
- Scheduled job registrations for `schedule:` notifications
- Queue job definitions for `delay:` notifications

---

## gist.yaml Example

notifications:
  email:
    provider: sendgrid
    from_env: EMAIL_FROM_ADDRESS
    template_dir: ./templates/email
  push:
    provider: fcm
    key_env: FCM_SERVER_KEY
  in_app:
    storage: database
    max_unread: 50

---

## Full Example

project saas-app
  kit: notifications
  stack: gist.yaml

  // ... models, modules ...

template welcome
  subject: "Welcome to {{app_name}}, {{user.name}}!"
  body:
    Thanks for joining! Get started by completing your profile.
  variables: [app_name, user.name]

template invoice_ready
  subject: "Your invoice for {{month}} is ready"
  body:
    Your invoice for {{amount}} is available. View it here:
    {{invoice_url}}
  variables: [month, amount, invoice_url]

notification welcome_email
  channel: email
  to: user.email
  template: welcome

notification invoice_notification
  channel: email, in_app
  to: account.billing_email
  template: invoice_ready
  title: "Invoice ready"
  body: "Your invoice for {{amount}} is available."

notification payment_failed_alert
  channel: email, push, in_app
  to: account.owner.email
  title: "Payment failed"
  body: "We couldn't process your payment. Please update
         your billing info."
  action: deep_link("/settings/billing")

on user_registered(user):
  send welcome_email to user

on invoice_generated(invoice):
  send invoice_notification to invoice.account
    with { month: invoice.period, amount: invoice.total,
           invoice_url: invoice.public_url }

on payment_failed(payment):
  send payment_failed_alert to payment.account
```

### Step 4: Test your kit

Write a `.gist` file that uses your kit and verify it covers:

1. Every keyword works as documented
2. The LLM can generate code from each construct
3. Core constructs interact correctly with kit constructs
4. The `gist.yaml` sections parse correctly
5. Edge cases are handled (missing fields, multi-channel, scheduled sends)

### Step 5: Publish

Place your kit directory where projects can find it:

```gist
// local kit (in project)
kit: ./kits/notifications

// published to a registry
kit: gist-kits/notifications@1.0

// from git
kit: github:your-username/gist-kit-notifications@1.0
```

---

## Kit Design Checklist

Before publishing, verify:

- [ ] **Keywords are minimal** — 3-15 keywords. Reuse core constructs (state machines, events, rules, fn) before adding new ones.
- [ ] **Naming follows conventions** — keywords are lowercase, type names are PascalCase.
- [ ] **KIT.md has interpretation rules** — the LLM knows exactly what code to generate.
- [ ] **KIT.md has a complete example** — `.gist` input to generated output.
- [ ] **kit.yaml has constructs** — IDEs can provide syntax support without parsing KIT.md.
- [ ] **kit.yaml declares yaml_sections** — infrastructure config goes in `gist.yaml`, not `.gist`.
- [ ] **extends is declared** — if your kit gives new meaning to `always:`, `rules:`, `on`, or other core constructs, list them.
- [ ] **No core duplication** — if `always:` or `rules:` already does what you need, extend it, don't reinvent it.
- [ ] **Versioned with semver** — breaking changes bump the major version.
- [ ] **Tested with a real project** — feed your kit + a sample project to an LLM and verify the output.

---

## Common Patterns

### Wrapping an external SDK

Many kits wrap an existing ecosystem (Terraform, React, Unity). The pattern:

1. Kit keywords map to the SDK's concepts (e.g., `resource` → Terraform resource)
2. `gist.yaml` sections capture SDK configuration (e.g., `providers:` → Terraform providers)
3. Interpretation rules say "generate SDK-native code" with GIST's constraints and invariants applied on top

### Extending core constructs

Kits can give new meaning to core keywords within their domain:

```yaml
extends:
  - always    # e.g., gamedev: "always: frame rate above 60fps"
  - rules     # e.g., api: "rules rate_limits: standard: { requests: 1000 }"
  - needs     # e.g., iac: "needs: Vpc" means infrastructure dependency
```

The core semantics still apply — your kit adds domain-specific interpretation.

### Multi-kit composition

Projects can load multiple kits. Your kit should play well with others:

- Don't use generic keyword names that might conflict (`resource` is fine for IaC, but `item` would conflict with everything)
- Document which other kits yours pairs well with
- Test with at least one other kit loaded alongside yours

### Extending another kit with `extends_kits:`

When your kit specializes another kit (e.g., a `godot` kit that builds on the engine-agnostic `gamedev` kit), declare the parent with `extends_kits:`:

```yaml
kit: godot
version: 1.0.0
extends_kits:
  - gamedev     # auto-loaded whenever `kit: godot` is activated
```

This does three things:

1. **Topological load order.** The loader registers `gamedev` before `godot`, so when both define the same keyword the child kit's definition wins (useful when the child wants to override a parent construct's behavior).
2. **Transitive activation.** A project that writes only `kit: godot` implicitly activates `gamedev` too — authors don't have to remember to list both.
3. **Validated graph.** `gist kit validate` (with no path) checks that every `extends_kits:` entry exists and that there are no cycles.

Use `extends_kits:` for *kit-to-kit* relationships. Use `extends:` (core constructs list) when your kit gives new meaning to built-in keywords like `state`, `on`, or `rules` — those are different concepts.

---

## Reference: kit.yaml Schema

```yaml
kit: <name>                    # required
version: <semver>              # required
author: <name>                 # recommended
description: <text>            # recommended
license: <SPDX>               # recommended

yaml_sections:                 # gist.yaml sections this kit adds
  <section_name>:
    description: <text>
    fields:
      <field_name>:
        type: string | integer | boolean | object | array
        required: true | false
        values: [allowed, values]
        fields: { ... }        # nested for type: object

keywords: [list, of, keywords] # new keywords this kit introduces

extends: [core, constructs]    # core constructs this kit gives new meaning to
extends_kits: [other, kits]    # other kits this kit builds on (auto-loaded)

constructs:                    # IDE metadata (see spec §12.7)
  <keyword>:
    kind: block | declaration | inline
    name_style: PascalCase | identifier | none
    doc: <tooltip text>
    fields:
      <field_name>:
        type: identifier | type_name | type_name_list | prose | literal | expression | boolean | list | object
        required: true | false
        doc: <description>
        values: [allowed, values]
        completions: [suggestions]
    children: [nestable, keywords]
    supports: [must, context_line, always, field_passthrough, code]
    snippet: <TabStop template>
```

## Reference: KIT.md Required Sections

1. **Overview** — what the kit does, how to activate it, required gist.yaml sections
2. **Keywords** — every new keyword with syntax, fields, and meaning
3. **Core construct interactions** — how your keywords work with events, always, rules, etc.
4. **Interpretation rules** — numbered list of what the LLM generates
5. **Code generation expectations** — what files/artifacts the LLM produces
6. **gist.yaml example** — show the kit-specific yaml sections
7. **Full example** — complete `.gist` project using the kit

---

*Kit Authoring Guide — for use with GIST Language Specification v0.8*
