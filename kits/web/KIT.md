# GIST Kit: Web

*Pages, components, layouts, routing, and client-side state for web frontends.*

---

## Overview

The web kit adds constructs for building web frontends. The LLM generates framework-specific code (React, Vue, Svelte, SolidJS, Astro, Next.js, Nuxt, SvelteKit, etc.) based on `runtime:` and `framework:` in `gist.yaml`.

GIST's core constructs handle data models, events, state machines, and business logic. This kit adds the visual and routing layer — pages, components, layouts, and client-side state.

**Activate:** `kit: web` in your project header.

**Requires `gist.yaml` sections:** `web` (required), `styling`, `bundler` (optional).

---

## Keywords

### `page` — Routable Pages

```gist
page Dashboard
  > Overview of key metrics and recent activity.
  route: "/dashboard"
  layout: AppLayout
  auth: true
  title: "Dashboard"

  data:
    metrics: Metrics, loaded from api
    activity: Activity[], loaded from api, paginated

  on mount:
    load metrics and activity
    start polling metrics every 30s

  on unmount:
    stop polling

  layout:
    MetricsGrid(metrics)
    section "Recent Activity":
      ActivityList(activity)
      load more button if has_next_page
```

**`page Name`** declares a routable page. The LLM generates the framework's page/route component.

**Page blocks:**

| Block | Purpose |
|-------|---------|
| `route:` | URL path pattern (supports params: `/users/:id`) |
| `layout:` | Wrapping layout component |
| `auth:` | Requires authentication (redirect if not) |
| `ssr:` | Server-side rendered (for SSR/SSG frameworks) |
| `title:` | HTML `<title>` and meta tag |
| `data:` | Data dependencies — what the page needs |
| `on mount:` | Runs when page mounts (client-side) |
| `on unmount:` | Cleanup on page leave |

**Route params:**

```gist
page UserProfile
  route: "/users/:id"
  data:
    user: User, loaded from api by route.id
```

### `component` — Reusable UI Components

```gist
component SearchBar
  > Auto-completing search input with debounce.
  props: { placeholder: string, on_search: fn }

  client_state query: string = ""
  client_state suggestions: string[] = []
  client_state is_open: bool = false

  on input change:
    set query to input value
    debounce 300ms:
      load suggestions for query
      set is_open to true

  on select suggestion:
    set query to suggestion
    set is_open to false
    call on_search(suggestion)

  on click outside:
    set is_open to false

  render:
    input with placeholder, value: query
    if is_open and suggestions not empty:
      dropdown list of suggestions
```

**`component Name`** declares a reusable UI component with props, local state, event handlers, and a render block.

**Component blocks:**

| Block | Purpose |
|-------|---------|
| `props:` | Input properties with types |
| `client_state` | Local reactive state |
| `on <event>:` | Event handlers (click, input, hover, etc.) |
| `render:` | Declarative UI structure (prose) |

### `layout` — Shared Structure

```gist
layout AppLayout
  > Authenticated app shell with header, sidebar, and content area.

  data:
    user: User, from auth state
    nav_items: NavItem[], from rules navigation

  render:
    Header with user avatar and notifications
    Sidebar with nav_items
    main:
      slot content
    Footer

layout PublicLayout
  > Minimal layout for unauthenticated pages.

  render:
    simple header with logo
    main:
      slot content
    footer with links
```

**`layout Name`** declares a wrapper component. Pages reference layouts by name. **`slot content`** marks where the page content renders inside the layout.

### `client_state` — Reactive State

```gist
client_state cart: CartItem[] = []
client_state theme: "light" | "dark" = "light"
client_state notifications: Notification[] = []
```

**`client_state name: type`** declares client-side reactive state. The LLM generates the framework's state management primitive (React `useState`/Zustand, Vue `ref`/Pinia, Svelte `writable`, SolidJS `createSignal`).

For complex shared state:

```gist
client_state cart
  items: CartItem[] = []
  is_open: bool = false

  fn total() -> Cents
    sum of items[].price * items[].quantity

  to add_item(product: Product, quantity: int = 1)
    if product already in items: increment quantity
    else: add new CartItem

  to remove_item(item_id: string)
    remove from items where id == item_id

  to clear()
    set items to []
```

---

## Core Construct Usage

### State Machines → UI Flows

```gist
state FormWizard for CheckoutForm.step:
  shipping -> payment -> review -> confirmed
  payment -> shipping
  review -> payment
  review -> confirmed when all fields valid

  on enter review:
    calculate totals
    validate all fields
```

### Events → DOM Events

```gist
on window resize:
  update layout breakpoint

on keyboard shortcut "cmd+k":
  open command palette

on scroll near bottom of ActivityList:
  load next page
```

### Rules → Theme Tokens

```gist
rules breakpoints:
  mobile:  { max: 640 }
  tablet:  { min: 641, max: 1024 }
  desktop: { min: 1025 }

rules colors:
  primary: { light: "#007AFF", dark: "#0A84FF" }
  danger:  { light: "#FF3B30", dark: "#FF453A" }
```

---

## Grammar Productions

```ebnf
PageDecl           = 'page' <type_name> INDENT
                     { ContextLine }
                     [ 'route:' <string_literal> ]
                     [ 'layout:' <type_name> ]
                     [ 'auth:' ( 'true' | 'false' ) ]
                     [ 'ssr:' ( 'true' | 'false' ) ]
                     [ 'title:' <string_literal> ]
                     [ DataBlock ]
                     { PageHook }
                     [ RenderBlock ]
                     DEDENT ;

ComponentDecl      = 'component' <type_name> INDENT
                     { ContextLine }
                     [ 'props:' InlineObject ]
                     { ClientStateDecl }
                     { EventHandler }
                     [ RenderBlock ]
                     DEDENT ;

LayoutDecl         = 'layout' <type_name> INDENT
                     { ContextLine }
                     [ DataBlock ]
                     RenderBlock
                     DEDENT ;

ClientStateDecl    = 'client_state' <identifier> ':' TypeRef [ '=' Literal ]
                   | 'client_state' <identifier> INDENT
                     { FieldDecl | FnDecl | IntentDecl }
                     DEDENT ;

RenderBlock        = ( 'render:' | 'layout:' ) INDENT { <prose> } DEDENT ;
DataBlock          = 'data:' INDENT { <prose> } DEDENT ;
PageHook           = 'on' ( 'mount' | 'unmount' | <prose> ) ':'
                     INDENT { <prose> } DEDENT ;
SlotDecl           = 'slot' <identifier> ;
```

---

## Data Loading & API Bridge

Pages use `data:` blocks to declare what data they need. The LLM generates the fetching layer based on the project architecture:

**Same-runtime projects** (e.g., Next.js full-stack): `data:` blocks generate server loaders that call modules directly — `getServerSideProps`, `loader()`, or `+page.server.ts`.

**Separate frontend/backend projects** (e.g., React SPA + Java API): The LLM generates a **typed API client** from the backend module definitions. Each module becomes a client namespace, each `to` intent with a `route:` becomes a typed method:

```
// auto-generated from modules
api.auth.login(email, password)        → POST /api/v1/auth/login
api.lists.getLists()                   → GET  /api/v1/lists
api.todos.createTodo(listId, title)    → POST /api/v1/lists/:list_id/todos
```

`data:` blocks then translate to client calls inside data-fetching hooks:

```
data:
  lists: call lists.get_lists()
→ generates: const { data: lists } = useQuery(() => api.lists.getLists())

data:
  list: call lists.get_list(list_id)
→ generates: const { data: list } = useQuery(() => api.lists.getList(listId))
```

The LLM generates loading, error, and empty states for every `data:` block. On error, show a user-facing message. On loading, show a skeleton or spinner (configurable via `style:` or `always:`).

**`call module.intent(args)` in event handlers** (e.g., `on submit:`) generates a mutation/action that calls the API client and refreshes affected data:

```
on create_list(name):
  call lists.create_list(name)
  refresh lists
→ generates: mutation that calls api.lists.createList(name), then invalidates the lists query
```

**`refresh`** after a mutation invalidates the named `data:` query, triggering a re-fetch.

## Auth Guards

**`auth: required`** on pages or layouts generates a route guard:

1. Check for a valid auth token (JWT in memory, cookie, or auth context — per `gist.yaml` `auth:` strategy)
2. If not authenticated, redirect to the login page (default: `/login`)
3. The guard runs before the page renders or its data loads

For layouts, the guard applies to all pages using that layout. Pages can override with `auth: false` or `public`.

The LLM generates an auth context/provider that stores the current user and token, and exposes `login()`, `logout()`, and `isAuthenticated` to all pages.

## Slot Mapping

Layouts declare named `slot` placeholders. Pages fill them:

- **`slot content`** is the default slot — every page's body renders here automatically.
- **Named slots** (e.g., `slot sidebar`) are filled by the page's `render:` block using the slot name. If a page doesn't fill a named slot, the layout renders its default content or nothing.

## Interpretation Rules

When `kit: web` is active, the LLM:

1. Maps `page` to the framework's page/route component (Next.js page, Nuxt page, SvelteKit `+page`, React Router route)
2. Maps `component` to the framework's component primitive
3. Maps `layout` to the framework's layout mechanism (`+layout`, `_layout`, layout components)
4. Maps `route:` patterns to the framework's router (file-based or config-based)
5. Maps `client_state` to the framework's state management (useState, Pinia, writable stores, signals)
6. Maps `slot content` to the framework's children/slot rendering — named slots map to named outlets or props
7. Generates `data:` blocks as server loaders (SSR) or client-side fetch hooks (SPA) with loading/error states
8. Generates typed API client when frontend and backend are separate runtimes
9. Applies `auth: required` with route guards, redirect to login, and auth context provider
10. Generates `ssr: true` pages with server-side data loading
11. Generates styling from `gist.yaml` `styling:` section

---

## Code Generation Expectations

For Next.js:

- `app/` — file-based routing with `page.tsx`, `layout.tsx`
- `components/` — shared components
- `lib/` — state management, API clients, utilities
- `styles/` — theme and global styles
- `next.config.js` — framework config
- `tailwind.config.js` — if Tailwind styling

For SvelteKit:

- `src/routes/` — file-based routing with `+page.svelte`, `+layout.svelte`
- `src/lib/components/` — shared components
- `src/lib/stores/` — Svelte stores from `client_state`
- `svelte.config.js` — framework config

---

## Full Example

```gist
project blog
  > A personal blog with posts, tags, and a reading list.
  kit: web
  stack: gist.yaml

  rules nav:
    home:     { label: "Home", path: "/", icon: "home" }
    blog:     { label: "Blog", path: "/blog", icon: "book" }
    about:    { label: "About", path: "/about", icon: "user" }

  always:
    show loading skeleton during data fetch
    handle 404 with custom NotFound page
    all images have alt text

Post = {
  id: string, generated, cuid
  title: string
  slug: string, unique
  content: string
  excerpt: string, computed
    > first 160 characters of content
  tags: Tag[]
  published: bool = false
  published_at?: datetime
}

Tag = { name: string, slug: string, unique }


layout BlogLayout
  data:
    nav_items: from rules nav

  render:
    header with site title and nav from nav_items
    main:
      slot content
    footer with copyright


page Home
  route: "/"
  layout: BlogLayout
  title: "My Blog"
  ssr: true

  data:
    recent_posts: Post[5], loaded from api where published, order by published_at desc

  render:
    hero section with tagline
    section "Recent Posts":
      PostCard(post) for each post in recent_posts
    link to "/blog" "View all posts"


page BlogList
  route: "/blog"
  layout: BlogLayout
  title: "All Posts"
  ssr: true

  data:
    posts: Post[], loaded from api where published, paginated
    tags: Tag[], loaded from api

  client_state active_tag: Tag? = null

  render:
    tag filter chips from tags
    PostCard(post) for each post filtered by active_tag
    pagination controls


page BlogPost
  route: "/blog/:slug"
  layout: BlogLayout
  ssr: true

  data:
    post: Post, loaded from api by route.slug

  title: post.title

  render:
    article:
      h1 post.title
      published date and tags
      rendered markdown of post.content
    section "Related Posts":
      PostCard for related posts by shared tags


component PostCard
  props: { post: Post }

  render:
    card with:
      h3 linked to "/blog/${post.slug}": post.title
      p: post.excerpt
      tag badges
      published date


page NotFound
  route: "*"
  layout: BlogLayout
  title: "Not Found"

  render:
    illustration
    "The page you're looking for doesn't exist."
    link to "/" "Go home"
```

```yaml
# gist.yaml
project: blog
version: 0.1.0

runtime:
  language: TypeScript
  platform: Node.js

framework:
  name: Next.js
  version: "14.x"

web:
  type: hybrid
  base_url: https://myblog.com
  meta:
    title: My Blog
    description: Thoughts on software and design
    og_image: /og-image.png

styling:
  type: tailwind
  theme_file: tailwind.config.js

database:
  type: PostgreSQL
  orm: Prisma
  connection:
    env: DATABASE_URL

deploy:
  target: Docker
```

---

*GIST Kit: Web v1.0.0*
