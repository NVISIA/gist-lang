# GIST Kit: Mobile

*Screens, navigation, gestures, offline storage, and push notifications for mobile apps.*

---

## Overview

The mobile kit adds constructs for describing mobile application structure and behavior. The LLM generates framework-specific code (React Native, Flutter, SwiftUI, Jetpack Compose, Expo, etc.) based on the `runtime:` and `framework:` in `gist.yaml`.

GIST's core constructs handle most app logic — state machines for auth flows, events for push notifications, models for data, `fn` for transforms. This kit adds screens, navigation, gestures, and mobile-specific patterns.

**Activate:** `kit: mobile` in your project header.

**Requires `gist.yaml` sections:** `app` (required), `navigation`, `offline`, `push` (optional).

---

## Keywords

### `screen` — App Screens

```gist
screen Home
  > Main feed with recent activity.
  nav: large
  tab: "Home"
  pull_to_refresh: true

  data:
    feed: Activity[], loaded from api
    user: User, from auth state

  on appear:
    load feed for current user
    track screen view "home"

  on pull_refresh:
    reload feed
    toast "Updated" on success

  layout:
    if feed is empty:
      show empty state with illustration
    else:
      scrollable list of feed items
      each item: ActivityCard(activity)

  on tap ActivityCard(activity):
    nav push ActivityDetail(activity.id)
```

**`screen Name`** declares a full-screen view. The LLM generates the framework's screen/page equivalent (React Native `Screen`, Flutter `Widget`, SwiftUI `View`).

**Screen blocks:**

| Block | Purpose |
|-------|---------|
| `nav:` | Navigation bar style (`default`, `large`, `hidden`, `custom`) |
| `tab:` | Associates screen with a tab bar item |
| `auth:` | Screen requires authenticated user (redirects if not) |
| `data:` | Data dependencies — what the screen needs to render |
| `on appear:` | Runs when screen becomes visible |
| `on disappear:` | Runs when screen leaves view |
| `on pull_refresh:` | Pull-to-refresh handler |
| `layout:` | Declarative UI structure (prose) |

### `nav` — Navigation

```gist
nav push ProfileScreen(user.id)
nav pop
nav replace LoginScreen
nav reset to Home
nav switch tab "Settings"
nav present sheet EditProfile
```

**`nav`** triggers navigation actions. The LLM generates framework-appropriate navigation calls.

| Action | Meaning |
|--------|---------|
| `push` | Push onto navigation stack |
| `pop` | Go back one screen |
| `replace` | Replace current screen |
| `reset to` | Clear stack and go to screen |
| `switch tab` | Switch to a different tab |
| `present sheet` | Show as bottom sheet/modal |

### `gesture` — Touch Gestures

```gist
gesture swipe left on MessageRow:
  show delete action
  on confirm: delete message

gesture long_press on Avatar:
  show sheet with user options

gesture pinch on ImageView:
  zoom image with bounds [0.5, 3.0]
```

| Gesture | Meaning |
|---------|---------|
| `tap` | Single tap |
| `double_tap` | Double tap |
| `long_press` | Press and hold |
| `swipe left/right/up/down` | Directional swipe |
| `pinch` | Pinch to zoom |
| `pan` | Drag/pan gesture |

### `sheet` — Bottom Sheets and Modals

```gist
sheet EditProfile
  > Edit user profile fields.
  height: half
  dismissible: true

  layout:
    form with fields [name, bio, avatar]
    save button
    cancel button

  on save:
    validate form
    update profile via api
    nav pop
    toast "Profile updated"
```

### `toast` — Temporary Notifications

```gist
toast "Saved successfully" style: success duration: 2s
toast "Network error" style: error action: "Retry"
toast "Item deleted" style: info action: "Undo" duration: 5s
```

### `local_store` — Device Storage

```gist
local_store save user_preferences
local_store load cached_feed -> Activity[]
local_store clear session_data
```

---

## Core Construct Usage

### State Machines → App State

```gist
state AuthState for App.auth:
  logged_out -> authenticating -> logged_in -> logged_out
  authenticating -> login_failed -> logged_out
  logged_in -> token_expired -> authenticating

  on enter logged_out:
    nav reset to LoginScreen
    local_store clear session
  on enter logged_in:
    nav reset to Home
    register for push notifications
```

### Events → App Events

```gist
on app_foreground:
  refresh auth token if expired
  sync pending changes

on app_background:
  save draft state to local_store

on push_received(notification):
  if app is foreground:
    toast notification.title
  if notification.type == "message":
    increment badge count

on connectivity_changed(status) when status == "offline":
  toast "You're offline" style: warning
  switch to cached data
```

### Ephemeral → Transient UI State

```gist
SearchState = ephemeral {
  query: string = ""
  results: Item[] = []
  is_loading: bool = false
  ttl: 5m
}
```

### Rules → Theme and Platform Overrides

```gist
rules theme:
  light: { background: "#FFFFFF", text: "#000000", accent: "#007AFF" }
  dark:  { background: "#1C1C1E", text: "#FFFFFF", accent: "#0A84FF" }

rules platform_overrides:
  ios:     { nav_style: "large", haptics: true }
  android: { nav_style: "default", haptics: false }
```

---

## Grammar Productions

```ebnf
ScreenDecl         = 'screen' <type_name> INDENT
                     { ContextLine }
                     [ 'nav:' <identifier> ]
                     [ 'tab:' <string_literal> ]
                     [ 'auth:' ( 'true' | 'false' ) ]
                     [ 'pull_to_refresh:' ( 'true' | 'false' ) ]
                     [ DataBlock ]
                     { ScreenHook }
                     [ LayoutBlock ]
                     DEDENT ;

DataBlock          = 'data:' INDENT { <prose> } DEDENT ;
LayoutBlock        = 'layout:' INDENT { <prose> | CodeBlock } DEDENT ;
ScreenHook         = 'on' ScreenEvent ':' INDENT { <prose> } DEDENT ;
ScreenEvent        = 'appear' | 'disappear' | 'pull_refresh'
                   | 'tap' <identifier> | <prose> ;

NavAction          = 'nav' ( 'push' | 'pop' | 'replace' | 'reset' 'to'
                   | 'switch' 'tab' | 'present' 'sheet' )
                   [ <type_name> [ '(' ArgList ')' ] ] ;

SheetDecl          = 'sheet' <type_name> INDENT
                     { ContextLine }
                     [ 'height:' <identifier> ]
                     [ 'dismissible:' ( 'true' | 'false' ) ]
                     [ LayoutBlock ]
                     { ScreenHook }
                     DEDENT ;
```

---

## Interpretation Rules

When `kit: mobile` is active, the LLM:

1. Maps `screen` to the framework's screen/page component (React Native `Screen`, Flutter `StatefulWidget`, SwiftUI `View`)
2. Maps `nav` actions to the framework's navigation API (React Navigation, GoRouter, NavigationStack)
3. Generates tab bar and navigation structure from `gist.yaml` `navigation:` section
4. Maps `gesture` to the framework's gesture recognizer system
5. Maps `sheet` to modal/bottom sheet presentation
6. Maps `toast` to the framework's toast/snackbar system
7. Generates offline storage layer from `gist.yaml` `offline:` section
8. Generates push notification handling from `gist.yaml` `push:` section
9. Applies `auth: true` screens with authentication guards and redirects
10. Generates `data:` block dependencies as data fetching hooks or state bindings

---

## Code Generation Expectations

For React Native:

- `src/screens/` — one file per `screen`
- `src/navigation/` — stack, tab, and drawer navigators
- `src/components/` — shared UI components from `layout:` blocks
- `src/store/` — state management (Zustand, Redux, etc.)
- `src/services/` — API clients, push notification handler, offline sync
- `app.json` — app configuration from `gist.yaml` `app:` section

For Flutter:

- `lib/screens/` — one file per `screen`
- `lib/routes/` — GoRouter or Navigator 2.0 config
- `lib/widgets/` — shared widgets
- `lib/providers/` — state management (Riverpod, Bloc, etc.)
- `pubspec.yaml` — dependencies

---

## Full Example

```gist
project task_app
  > A mobile task management app with offline support.
  kit: mobile
  stack: gist.yaml

  rules priorities:
    low:    { color: "#4CAF50", icon: "arrow_down" }
    medium: { color: "#FF9800", icon: "minus" }
    high:   { color: "#F44336", icon: "arrow_up" }

  always:
    show loading indicator during network requests
    show offline banner when no connectivity
    all destructive actions require confirmation

Task = {
  id: string, generated, cuid
  title: string
  priority: Priority
  due?: date
  completed: bool = false
}

Priority = low | medium | high

state AuthState for App.auth:
  logged_out -> authenticating -> logged_in -> logged_out
  on enter logged_out: nav reset to Login
  on enter logged_in: nav reset to TaskList


screen Login
  > Sign in with email and password.
  nav: hidden
  auth: false

  layout:
    logo and app name
    email input
    password input
    sign in button
    sign up link

  on tap sign_in:
    validate email and password
    authenticate via api
    transition auth to logged_in

  on tap sign_up:
    nav push SignUp


screen TaskList
  > Main task list with filtering.
  nav: large
  tab: "Tasks"
  pull_to_refresh: true
  auth: true

  data:
    tasks: Task[], loaded from api
    filter: Priority?, from local state

  on appear:
    load tasks, fall back to local_store if offline

  on pull_refresh:
    sync pending changes
    reload tasks

  layout:
    filter chips for each Priority
    if tasks is empty:
      empty state "No tasks yet"
    else:
      list of TaskRow(task) for each task
    floating action button "+"

  on tap TaskRow(task):
    nav push TaskDetail(task.id)

  on tap floating_action_button:
    nav present sheet NewTask

  gesture swipe left on TaskRow(task):
    show delete action
    on confirm: delete task, toast "Deleted" action: "Undo"


sheet NewTask
  > Create a new task.
  height: half
  dismissible: true

  layout:
    title input
    priority select from rules priorities
    due date picker (optional)
    save button

  on save:
    create task via api
    if offline: queue for sync
    nav pop
    toast "Task created"


screen TaskDetail
  > View and edit a single task.
  nav: default
  auth: true

  data:
    task: Task, loaded from api by id

  layout:
    title (editable)
    priority badge (colored from rules priorities)
    due date
    completed toggle
    delete button

  on tap completed toggle:
    update task.completed via api
    toast "Done!" when completed

  on tap delete:
    prompt confirm "Delete this task?"
    delete task via api
    nav pop
    toast "Deleted"


on push_received(notification) when notification.type == "task_reminder":
  toast notification.body
  increment badge count

on connectivity_changed(status) when status == "online":
  sync all pending changes from local_store
```

```yaml
# gist.yaml
project: task-app
version: 0.1.0

runtime:
  language: TypeScript
  platform: Node.js

framework:
  name: React Native
  version: "0.74"

app:
  name: Tasks
  bundle_id: com.example.tasks
  platforms: [ios, android]
  min_ios: "16.0"
  min_android: 26

navigation:
  type: bottom_tabs
  initial_screen: TaskList

offline:
  storage: async_storage
  sync_strategy: optimistic

push:
  provider: fcm
  token_env: FCM_SERVER_KEY

database:
  type: PostgreSQL
  orm: Prisma
  connection:
    env: DATABASE_URL

auth:
  strategy: JWT
  token_expiry: 7d
  refresh_token: true

api:
  style: REST
  prefix: /api/v1
```

---

*GIST Kit: Mobile v1.0.0*
