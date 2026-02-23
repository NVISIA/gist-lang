# GIST Kit: API

*API-first design — endpoints, versioning, pagination, rate limits, schemas, and SDK generation.*

---

## Overview

The API kit extends GIST's core `to` intents into full API product design. While the core spec handles basic `route:` declarations, this kit adds the concerns of APIs as products: versioning, pagination, rate limiting, schema generation (OpenAPI, GraphQL), middleware pipelines, and client SDK generation.

**Activate:** `kit: api` in your project header.

**Requires `gist.yaml` sections:** `api_product` (required), `schema`, `sdk`, `gateway` (optional).

---

## Keywords

### `endpoint` — API Endpoints

```gist
endpoint list_users
  GET /users
  version: v1
  tags: [users]
  guard: api_key or bearer token
  rate_limit: standard
  cache: "max-age=60"

  query:
    page?: int = 1
    per_page?: int = 20
    sort?: string = "created_at"
    filter?: string

  -> paginate User[]

  do:
    apply filters and sorting
    return paginated results

  eg:
    GET /v1/users?page=2&per_page=10
    => { data: [...], meta: { page: 2, per_page: 10, total: 47 } }
```

**`endpoint name`** declares a full API endpoint. Unlike core `to` with `route:`, endpoints add `query:` params, pagination, versioning, rate limits, caching, and tags for documentation.

**Endpoint blocks:**

| Block | Purpose |
|-------|---------|
| `GET/POST/PUT/PATCH/DELETE path` | HTTP method and path (first line) |
| `version:` | API version this endpoint belongs to |
| `tags:` | OpenAPI tags for grouping in docs |
| `guard:` | Authentication/authorization (inherited from core) |
| `rate_limit:` | Named rate limit tier |
| `cache:` | HTTP cache-control header value |
| `query:` | URL query parameters with types and defaults |
| `body:` | Request body shape (POST/PUT/PATCH) |
| `-> Type` | Response type |
| `-> paginate Type[]` | Paginated response (see pagination) |
| `headers:` | Required or notable headers |

```gist
endpoint create_user
  POST /users
  version: v1
  tags: [users]
  guard: admin only

  body: {
    email: string
    name: string
    role?: Role = "member"
  }

  -> User | ValidationFailed

  do:
    validate email uniqueness
    create user with hashed password placeholder
    send invitation email
    emit user_created

  must: email must be valid format
  ensure: returned user has id and created_at
```

### `version` — API Versioning

```gist
version v1
  > Initial release. Stable.

version v2
  > Restructured user endpoints. Added pagination metadata.

  changes:
    list_users: response shape changed (wrapped in { data, meta })
    get_user: added "preferences" field to response
    create_user: "name" split into "first_name" and "last_name"

  migration:
    v1 get_user -> v2: add empty preferences object
    v1 create_user -> v2: split name on first space
```

**`version name`** declares an API version boundary. The `changes:` block documents what changed. The `migration:` block tells the LLM how to transform between versions — it generates adapter/shim code.

### `paginate` — Pagination

```gist
-> paginate User[]
```

**`paginate`** in a return type declaration generates pagination support. The LLM generates:

- `page` and `per_page` query params (or cursor-based, depending on `api_product.pagination`)
- Response wrapper with `data`, `meta` (total, page, per_page, has_next)
- Link headers or next/prev URLs

**Pagination strategies** (configured in `gist.yaml` or per-endpoint):

| Strategy | Query params | Use case |
|----------|-------------|----------|
| `offset` | `page`, `per_page` | Simple lists, small datasets |
| `cursor` | `cursor`, `limit` | Large datasets, real-time feeds |
| `keyset` | `after`, `first` | GraphQL-style, performant |

```gist
endpoint list_events
  GET /events
  -> paginate Event[] using cursor

  query:
    cursor?: string
    limit?: int = 50
    since?: datetime
```

### `rate_limit` — Rate Limiting

```gist
rate_limit free_tier
  requests: 100/hour
  burst: 20
  scope: api_key
  > Applied to free plan API keys.

rate_limit standard
  requests: 1000/minute
  burst: 100
  scope: api_key

rate_limit admin
  requests: 10000/minute
  scope: user

rate_limit public
  requests: 30/minute
  scope: ip
  > Applied to unauthenticated endpoints.
```

**`rate_limit name`** declares a named rate limit tier. Endpoints reference tiers by name. The LLM generates rate limiting middleware with the appropriate storage backend (Redis, in-memory, etc.).

Rate limit headers generated: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`.

### `middleware` — Request/Response Processing

```gist
middleware request_id
  > Adds a unique request ID to every request and response.
  on request:
    generate uuid
    set request header X-Request-ID
    set response header X-Request-ID
    add to log context

middleware cors
  > Handles CORS preflight and response headers.
  on request:
    if OPTIONS: respond with cors headers
    else: add cors headers to response

middleware api_versioning
  > Routes request to correct version handler.
  on request:
    extract version from URL prefix (e.g., /v1/...)
    if version not supported: respond 400
    set version in request context
```

**`middleware name`** declares a reusable request/response processing step. The LLM generates framework-appropriate middleware (Express middleware, Fastify hooks, Axum layers, etc.).

---

## Core Construct Usage

### `always` → API-Wide Constraints

```gist
always:
  all endpoints return JSON with Content-Type: application/json
  all error responses follow format: { error: { code, message, details? } }
  all responses include X-Request-ID header
  all list endpoints support pagination
  all write endpoints are idempotent with Idempotency-Key header
```

### `rules` → Rate Limit Tiers and Pagination Defaults

```gist
rules pagination_defaults:
  default: { page_size: 20, max_page_size: 100 }
  events:  { page_size: 50, max_page_size: 500, strategy: "cursor" }
```

### `guard` → Auth Strategies

```gist
endpoint get_user
  GET /users/:id
  guard: bearer token with scope "users:read"

endpoint admin_stats
  GET /admin/stats
  guard: bearer token with role "admin"

endpoint public_health
  GET /health
  public
```

---

## Grammar Productions

```ebnf
EndpointDecl       = 'endpoint' <identifier> INDENT
                     HttpMethodLine
                     { ContextLine }
                     [ 'version:' <identifier> ]
                     [ 'tags:' InlineList ]
                     [ 'guard:' <prose> ]
                     [ 'rate_limit:' <identifier> ]
                     [ 'cache:' <string_literal> ]
                     [ QueryBlock ]
                     [ BodyBlock ]
                     [ HeadersBlock ]
                     [ '->' ReturnSpec ]
                     [ DoBlock | CodeBlock ]
                     [ FailsBlock ]
                     [ MustBlock ]
                     [ EnsureBlock ]
                     [ EgBlock ]
                     DEDENT ;

HttpMethodLine     = ( 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' ) <path> ;
QueryBlock         = 'query:' INDENT { ParamDecl } DEDENT ;
BodyBlock          = 'body:' ( InlineObject | INDENT { FieldDecl } DEDENT ) ;
HeadersBlock       = 'headers:' INDENT { <identifier> ':' <prose> } DEDENT ;
ReturnSpec         = [ 'paginate' ] TypeRef [ 'using' <identifier> ] ;

VersionDecl        = 'version' <identifier> INDENT
                     { ContextLine }
                     [ ChangesBlock ]
                     [ MigrationBlock ]
                     DEDENT ;

ChangesBlock       = 'changes:' INDENT { <prose> } DEDENT ;
MigrationBlock     = 'migration:' INDENT { <prose> } DEDENT ;

RateLimitDecl      = 'rate_limit' <identifier> INDENT
                     { ContextLine }
                     'requests:' <prose>
                     [ 'burst:' <int_literal> ]
                     [ 'scope:' <identifier> ]
                     DEDENT ;

MiddlewareDecl     = 'middleware' <identifier> INDENT
                     { ContextLine }
                     { MiddlewareHook }
                     DEDENT ;

MiddlewareHook     = 'on' ( 'request' | 'response' | 'error' ) ':'
                     INDENT { <prose> | CodeBlock } DEDENT ;
```

---

## Interpretation Rules

When `kit: api` is active, the LLM:

1. Maps `endpoint` to route handlers with full HTTP semantics (method, path, query, body, headers)
2. Maps `version` to URL-prefix versioning (default), header versioning, or query versioning per `gist.yaml`
3. Maps `-> paginate Type[]` to paginated response wrapper with metadata
4. Maps `rate_limit` tiers to middleware with Redis/memory-based counters and standard headers
5. Maps `middleware` to framework-appropriate request/response processing
6. Generates OpenAPI/Swagger spec from endpoints, types, query params, and examples
7. Generates GraphQL schema if `schema.type: graphql`
8. Generates client SDKs in configured languages from `gist.yaml` `sdk:` section
9. Generates version migration adapters from `migration:` blocks
10. Applies `always:` constraints to all endpoints (error format, headers, pagination)

---

## Code Generation Expectations

The LLM produces:

- Route handlers organized by version and resource
- Middleware stack in correct order
- Rate limiting middleware with storage backend
- API documentation: `openapi.yaml` or `schema.graphql`
- Client SDKs (if `sdk:` configured): typed clients in each target language
- Request/response validation from type declarations
- Pagination utilities
- Version migration adapters (if multiple versions)
- Error handling middleware with standard error format
- Health check and readiness endpoints

---

## Full Example

```gist
project tasks_api
  > A task management API with versioning and rate limiting.
  kit: api
  stack: gist.yaml

  rules rate_tiers:
    free:    { requests: "100/hour", burst: 20 }
    pro:     { requests: "1000/minute", burst: 200 }
    enterprise: { requests: "10000/minute", burst: 1000 }

  always:
    all responses include X-Request-ID header
    all error responses use { error: { code, message, details? } }
    all list endpoints support pagination
    all write endpoints accept Idempotency-Key header

Task = {
  id: string, generated, cuid
  title: string
  description?: string
  status: TaskStatus
  priority: Priority
  assignee?: -> User
  due?: date
  created_at: datetime, generated
  updated_at: datetime, generated
}

TaskStatus = open | in_progress | done | cancelled
Priority = low | medium | high


rate_limit free_tier
  requests: 100/hour
  burst: 20
  scope: api_key

rate_limit standard
  requests: 1000/minute
  burst: 200
  scope: api_key


middleware request_logging
  on request:
    log method, path, request_id, user_id
  on response:
    log status_code, duration_ms


version v1
  > Initial release.

endpoint list_tasks
  GET /tasks
  version: v1
  tags: [tasks]
  guard: bearer token
  rate_limit: standard

  query:
    status?: TaskStatus
    priority?: Priority
    assignee?: string
    sort?: string = "created_at"

  -> paginate Task[]

  do:
    apply filters from query params
    sort by sort param
    return paginated results


endpoint get_task
  GET /tasks/:id
  version: v1
  tags: [tasks]
  guard: bearer token
  cache: "max-age=10"

  -> Task | NotFound


endpoint create_task
  POST /tasks
  version: v1
  tags: [tasks]
  guard: bearer token with scope "tasks:write"
  rate_limit: standard

  body: {
    title: string
    description?: string
    priority?: Priority = "medium"
    assignee?: string
    due?: date
  }

  -> Task | ValidationFailed

  do:
    validate title not empty
    create task
    emit task_created

  must: title length between 1 and 200
  ensure: returned task has id and status "open"


endpoint update_task
  PATCH /tasks/:id
  version: v1
  tags: [tasks]
  guard: bearer token with scope "tasks:write"

  body: {
    title?: string
    description?: string
    status?: TaskStatus
    priority?: Priority
    assignee?: string
    due?: date
  }

  -> Task | NotFound | ValidationFailed

  do:
    validate status transition if status changed
    update fields
    emit task_updated


endpoint delete_task
  DELETE /tasks/:id
  version: v1
  tags: [tasks]
  guard: bearer token with scope "tasks:write"

  -> void | NotFound

  do:
    soft delete task
    emit task_deleted
```

```yaml
# gist.yaml
project: tasks-api
version: 0.1.0
description: Task management REST API

runtime:
  language: TypeScript
  platform: Node.js
  package_manager: pnpm

framework:
  name: Fastify
  version: "4.x"

api_product:
  name: Tasks API
  base_url: https://api.tasks.example.com
  versioning: url
  current_version: v1

schema:
  type: openapi
  output: docs/openapi.yaml
  servers:
    - url: https://api.tasks.example.com
      description: Production
    - url: http://localhost:3000
      description: Development

sdk:
  languages: [typescript, python]
  output_dir: sdks
  package_name: tasks-client

database:
  type: PostgreSQL
  version: "16.x"
  orm: Drizzle
  migrations: managed
  connection:
    env: DATABASE_URL

cache:
  type: Redis
  connection:
    env: REDIS_URL

auth:
  strategy: JWT
  token_expiry: 1h

testing:
  framework: Vitest
  coverage: true

deploy:
  target: Docker
  compose: true
```

---

*GIST Kit: API v1.0.0*
