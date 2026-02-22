# gist.yaml Manifest Specification v2.1

The `gist.yaml` file defines the infrastructure and services for a GIST project. It separates *what the system runs on* from *what the system does*. Behavior lives in `.gist` files. Infrastructure lives here.

---

## Structure

```yaml
project: <name>
version: <semver>
description: <text>

# Application infrastructure
runtime:       # language and platform
framework:     # web framework
database:      # primary data store
cache:         # caching layer
events:        # messaging / pub-sub
storage:       # file / object storage
search:        # full-text search
auth:          # authentication strategy
api:           # API configuration
services:      # third-party integrations
testing:       # test framework
deploy:        # deployment target
env:           # environment variables
conventions:   # code style defaults

# Kit-provided sections (added by loaded kits)
# e.g., iac kit adds: iac, providers, backend
# e.g., gamedev kit adds: engine, physics, assets, audio, input
```

All sections are optional except `project`. Include only what the project uses. Application projects typically use `runtime` through `conventions`. Kits add their own sections (see §Kit-Provided Sections below).

---

## Sections

### `project` (required)

```yaml
project: shopfront
version: 0.1.0
description: E-commerce platform with cart, checkout, and promotions
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `project` | string | yes | Project name (kebab-case or snake_case) |
| `version` | string | no | Semver |
| `description` | string | no | One-line summary |

---

### `runtime`

```yaml
runtime:
  language: TypeScript
  version: "5.x"
  platform: Node.js
  package_manager: pnpm
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `language` | string | yes | TypeScript, Rust, Python, Go, Java, etc. |
| `version` | string | no | Language version constraint |
| `platform` | string | no | Node.js, Bun, Deno, etc. |
| `package_manager` | string | no | npm, pnpm, yarn, cargo, pip, etc. |

---

### `framework`

```yaml
framework:
  name: Fastify
  version: "4.x"
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `name` | string | yes | Express, Fastify, Axum, Flask, Gin, Spring, etc. |
| `version` | string | no | Framework version constraint |

---

### `database`

```yaml
database:
  type: PostgreSQL
  version: "16.x"
  orm: Drizzle
  migrations: managed
  connection:
    env: DATABASE_URL
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `type` | string | yes | PostgreSQL, MySQL, MongoDB, SQLite, etc. |
| `version` | string | no | Database version |
| `orm` | string | no | Drizzle, Prisma, SQLx, SQLAlchemy, GORM, etc. |
| `migrations` | string | no | `managed` (auto) or `manual` |
| `connection.env` | string | yes | Env var name for connection string |

---

### `cache`

```yaml
cache:
  type: Redis
  connection:
    env: REDIS_URL
  strategy: aside
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `type` | string | yes | Redis, Memcached, in-memory |
| `connection.env` | string | yes | Env var for connection |
| `strategy` | string | no | `aside` (cache-aside), `through` (write-through), `back` (write-back) |

---

### `events`

```yaml
events:
  type: Kafka
  connection:
    env: KAFKA_BROKERS
  topics:
    - orders
    - payments
    - notifications
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `type` | string | yes | Kafka, RabbitMQ, Redis pub/sub, SQS, NATS |
| `connection.env` | string | yes | Env var for connection |
| `topics` | string[] | no | Pre-declared topic names |

---

### `storage`

```yaml
storage:
  type: S3
  bucket_env: S3_BUCKET
  region_env: AWS_REGION
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `type` | string | yes | S3, GCS, Azure Blob, local |
| `bucket_env` | string | yes | Env var for bucket name |
| `region_env` | string | no | Env var for region |

---

### `search`

```yaml
search:
  type: Elasticsearch
  version: "8.x"
  connection:
    env: ELASTICSEARCH_URL
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `type` | string | yes | Elasticsearch, OpenSearch, Typesense, Meilisearch |
| `version` | string | no | Engine version |
| `connection.env` | string | yes | Env var for connection |

---

### `auth`

```yaml
auth:
  strategy: JWT
  token_expiry: 7d
  refresh_token: true
  password_hashing: bcrypt
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `strategy` | string | yes | JWT, session, OAuth2, API key |
| `token_expiry` | string | no | Duration (e.g., `1h`, `7d`) |
| `refresh_token` | bool | no | Enable refresh tokens |
| `password_hashing` | string | no | bcrypt, argon2, scrypt |

---

### `api`

```yaml
api:
  style: REST
  prefix: /api/v1
  docs: OpenAPI
  rate_limiting:
    enabled: true
    default: 1000/minute
  cors:
    origins: ["*"]
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `style` | string | yes | REST, GraphQL |
| `prefix` | string | no | URL prefix for all routes |
| `docs` | string | no | OpenAPI, none |
| `rate_limiting.enabled` | bool | no | Enable rate limiting |
| `rate_limiting.default` | string | no | Default rate limit |
| `cors.origins` | string[] | no | Allowed CORS origins |

---

### `services` 
Third-party APIs and external protocols. Referenced in `.gist` files via `uses:`.

```yaml
services:
  stripe:
    type: REST
    base_url: https://api.stripe.com
    auth:
      type: api_key
      key_env: STRIPE_SECRET_KEY
    docs: https://stripe.com/docs/api

  google_maps:
    type: REST
    base_url_env: GOOGLE_MAPS_URL
    auth:
      type: api_key
      key_env: GOOGLE_MAPS_API_KEY

  fix_gateway:
    type: TCP
    host_env: FIX_GATEWAY_HOST
    port_env: FIX_GATEWAY_PORT
    protocol: FIX 4.4

  twilio:
    type: REST
    base_url: https://api.twilio.com
    auth:
      type: basic
      username_env: TWILIO_ACCOUNT_SID
      password_env: TWILIO_AUTH_TOKEN

  compliance_api:
    type: REST
    base_url_env: COMPLIANCE_API_URL
    auth:
      type: oauth2
      client_id_env: COMPLIANCE_CLIENT_ID
      client_secret_env: COMPLIANCE_CLIENT_SECRET
      token_url_env: COMPLIANCE_TOKEN_URL

  internal_auth:
    type: gRPC
    host_env: AUTH_SERVICE_HOST
    port_env: AUTH_SERVICE_PORT
    proto: ./protos/auth.proto
```

**Service fields:**

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `type` | string | yes | `REST`, `gRPC`, `TCP`, `WebSocket` |
| `base_url` | string | no | Static base URL |
| `base_url_env` | string | no | Env var for base URL (use instead of `base_url` for secrets) |
| `host_env` | string | no | Env var for host (TCP/gRPC) |
| `port_env` | string | no | Env var for port (TCP/gRPC) |
| `protocol` | string | no | Protocol spec (e.g., `FIX 4.4`, `SWIFT`) |
| `proto` | string | no | Protobuf file path (gRPC) |
| `auth` | object | no | Authentication config |
| `docs` | string | no | URL to API documentation |

**Auth types:**

| Type | Fields |
|------|--------|
| `api_key` | `key_env` |
| `basic` | `username_env`, `password_env` |
| `bearer` | `token_env` |
| `oauth2` | `client_id_env`, `client_secret_env`, `token_url_env` |
| `none` | (no fields) |

**How services connect to GIST:** When a `.gist` file declares `uses: stripe`, the LLM:
1. Looks up `stripe` in `gist.yaml` → `services.stripe`
2. Generates a typed client with the base URL and auth configured
3. Wraps calls with error handling and retry logic
4. Uses env vars for all secrets (never hardcoded)

---

### Kit-Provided Sections

Kits can add their own sections to `gist.yaml`. Each kit's `kit.yaml` declares the sections it introduces under `yaml_sections:`. When a project uses `kit: iac`, the LLM expects and reads the `iac:`, `providers:`, and `backend:` sections. When a project uses `kit: gamedev`, the LLM expects `engine:`, `physics:`, `assets:`, etc.

Kit-provided sections are documented in each kit's own `KIT.md` file — not here. This manifest spec covers only the core sections that every GIST project can use regardless of kits.

**How the LLM resolves kit sections:** When parsing `gist.yaml`, the LLM reads the core sections first, then reads any additional sections declared by loaded kits. Unknown sections without a matching kit are flagged: `// GIST: unknown yaml section '<name>' — no kit loaded`.

---

### `testing`

```yaml
testing:
  framework: Vitest
  coverage: true
  e2e: Playwright
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `framework` | string | yes | Vitest, Jest, pytest, cargo test, etc. |
| `coverage` | bool | no | Enable coverage reporting |
| `e2e` | string | no | E2E framework (Playwright, Cypress) |

---

### `deploy`

```yaml
deploy:
  target: Docker
  compose: true
  registry: ghcr.io
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `target` | string | yes | Docker, Kubernetes, Serverless, Fly, Railway |
| `compose` | bool | no | Generate docker-compose.yml |
| `registry` | string | no | Container registry URL |

---

### `env`

Declares all environment variables the project requires. The LLM generates a `.env.example` from this.

```yaml
env:
  DATABASE_URL:
    type: string
    required: true
    secret: true
  REDIS_URL:
    type: string
    required: true
  STRIPE_SECRET_KEY:
    type: string
    required: true
    secret: true
  PORT:
    type: integer
    default: 3000
  LOG_LEVEL:
    type: string
    default: info
    values: [debug, info, warn, error]
  FEATURE_NEW_CHECKOUT:
    type: boolean
    default: false
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `type` | string | yes | `string`, `integer`, `boolean`, `float` |
| `required` | bool | no | Must be set (default: false) |
| `default` | any | no | Default value if not set |
| `secret` | bool | no | Sensitive — don't log or expose |
| `values` | array | no | Allowed values (enum constraint) |

---

### `conventions`

Code style defaults that the LLM follows when generating.

```yaml
conventions:
  id_format: cuid
  timestamps: ISO-8601-UTC
  soft_delete: true
  json_keys: camelCase
  db_columns: snake_case
  error_format: { code, message, details }
```

| Field | Type | Notes |
|-------|------|-------|
| `id_format` | string | `uuid`, `cuid`, `ulid`, `auto_increment` |
| `timestamps` | string | `ISO-8601-UTC`, `unix`, `unix_ms` |
| `soft_delete` | bool | Use `is_deleted` flag vs hard delete |
| `json_keys` | string | `camelCase`, `snake_case` |
| `db_columns` | string | `snake_case`, `camelCase` |
| `error_format` | object | Standard error response shape |

---

## Split Principle

**Infrastructure goes in `gist.yaml`. Behavior goes in `.gist` files.**

| Belongs in `gist.yaml` | Belongs in `.gist` |
|------------------------|--------------------|
| Database type and connection | Models and relationships |
| Cache provider | Ephemeral model definitions |
| Event broker and topics | Event handlers (`on`) |
| Auth strategy | Guard rules (`guard:`) |
| API prefix and rate limits | Routes (`route:`) |
| External service config | `uses:` references |
| Env var declarations | Business rules (`rules:`) |
| Deploy target | State machines |
| Test framework | Test cases |
| Kit infrastructure config | Kit constructs in `.gist` |

---

## Minimal Example

```yaml
project: todo-api
runtime:
  language: TypeScript
  platform: Node.js
framework:
  name: Express
database:
  type: SQLite
  orm: Prisma
  migrations: managed
  connection:
    env: DATABASE_URL
env:
  DATABASE_URL:
    type: string
    default: "file:./dev.db"
  PORT:
    type: integer
    default: 3000
```

---

## Kit Examples

Kit-specific `gist.yaml` examples are documented in each kit's `KIT.md`. See `kits/iac/KIT.md` for IaC examples and `kits/gamedev/KIT.md` for game development examples.

---

## Full Application Example

```yaml
project: clearledger
version: 0.1.0
description: Financial ledger with multi-currency support and trading

runtime:
  language: Rust
  version: "1.78"
  package_manager: cargo

framework:
  name: Axum

database:
  type: PostgreSQL
  version: "16.x"
  orm: SQLx
  migrations: manual
  connection:
    env: DATABASE_URL

cache:
  type: Redis
  connection:
    env: REDIS_URL

events:
  type: Kafka
  connection:
    env: KAFKA_BROKERS
  topics: [trades, settlements, ledger_entries, compliance_events]

auth:
  strategy: JWT
  token_expiry: 1h

api:
  style: REST
  prefix: /api/v1
  docs: OpenAPI
  rate_limiting:
    enabled: true
    default: 1000/minute

services:
  market_data:
    type: REST
    base_url_env: MARKET_DATA_API_URL
    auth:
      type: api_key
      key_env: MARKET_DATA_API_KEY

  fix_gateway:
    type: TCP
    host_env: FIX_GATEWAY_HOST
    port_env: FIX_GATEWAY_PORT
    protocol: FIX 4.4

  compliance_reporting:
    type: REST
    base_url_env: COMPLIANCE_REPORTING_URL
    auth:
      type: oauth2
      client_id_env: COMPLIANCE_CLIENT_ID
      client_secret_env: COMPLIANCE_CLIENT_SECRET
      token_url_env: COMPLIANCE_TOKEN_URL

testing:
  framework: cargo test
  coverage: true

deploy:
  target: Docker
  compose: true

env:
  DATABASE_URL:
    type: string
    required: true
    secret: true
  KAFKA_BROKERS:
    type: string
    required: true
  REDIS_URL:
    type: string
    required: true
  MARKET_DATA_API_KEY:
    type: string
    required: true
    secret: true
  FIX_GATEWAY_HOST:
    type: string
    required: true
  FIX_GATEWAY_PORT:
    type: integer
    default: 9878
  COMPLIANCE_REPORTING_URL:
    type: string
    required: true
  COMPLIANCE_CLIENT_ID:
    type: string
    required: true
    secret: true
  COMPLIANCE_CLIENT_SECRET:
    type: string
    required: true
    secret: true
  COMPLIANCE_TOKEN_URL:
    type: string
    required: true

conventions:
  id_format: uuid
  timestamps: ISO-8601-UTC
  soft_delete: false
  json_keys: snake_case
  db_columns: snake_case
```

---

*gist.yaml Manifest Specification v2.1 — Draft*
