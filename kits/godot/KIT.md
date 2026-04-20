# GIST Kit: Godot

*First-class Godot 4 code generation — nodes, signals, autoloads, resources, and GDScript.*

---

## Overview

The `godot` kit specializes the engine-agnostic `gamedev` kit into idiomatic Godot 4 output. It adds five Godot-native keywords (`node`, `signal`, `autoload`, `resource`, `group`) and tells the LLM how to translate every `gamedev` construct into the Godot equivalent (`.tscn` files, typed GDScript, `InputMap`, `PackedScene.instantiate()`, `.tres` resources, …).

**Activate:** `kit: godot` in your project header. `gamedev` is auto-loaded via `extends_kits:`, so you get both vocabularies without listing them separately.

**Requires `gist.yaml` sections:** `godot` (required), `gdscript`, `godot_physics`, `godot_input_map` (optional). The `gamedev` kit's `engine`, `physics`, `assets`, `audio`, and `input` sections are also available.

**Scope:** Godot **4.x** (4.2+). **GDScript** only — C# and .NET are out of scope for this kit.

---

## Keywords

### `node` — Scene-Tree Node

```gist
node Player {
  base: CharacterBody2D
  script: player.gd

  position: Coord
  sprite: "player.png"
  hitbox: rectangle(16, 24)
  collision_layer: player
  collision_mask: [enemies, items, walls]

  children:
    - CollisionShape2D { shape: rectangle(16, 24) }
    - Sprite2D { texture: "player.png" }
    - Camera2D { current: true }
}
```

**`node Name { }`** declares a Godot node with a specific base class. This is the Godot-native counterpart to gamedev's `entity` — use `entity` for engine-agnostic specs, use `node` when you want explicit control over the Godot base class or the scene-tree structure.

The LLM emits one `.tscn` file per top-level `node` plus a companion GDScript that extends the declared `base:`.

| Field | Purpose |
|-------|---------|
| `base:` | Godot base class (required). Node, Node2D, Node3D, CharacterBody2D/3D, RigidBody2D/3D, Area2D/3D, Control, … |
| `script:` | GDScript file to attach (defaults to `scripts/<Name>.gd`) |
| `children:` | Inline child-node list for the scene tree |
| Everything else | Treated as an `@export` or member variable on the attached script |

### `signal` — Godot Signals

```gist
signal damage_taken(amount: int, source: Node)
signal level_completed(score: int)

signal game_over
  emitter: GameManager
```

**`signal name(args)`** declares a Godot signal. The LLM emits `signal name(args)` in the appropriate script (inferred from context or the `emitter:` field) and wires up `connect()` calls for handlers declared via `on name(...)`.

### `autoload` — Global Singletons

```gist
autoload GameManager
  > Global game state, scene routing, save/load coordination.
  state: playing | paused | game_over
  current_level: int = 1
  player_score: int = 0

  on level_completed(score):
    player_score += score
    transition to next_level

autoload AudioManager
  > Centralized SFX and music playback with bus routing.
  fn play_sfx(name: string)
  fn play_music(name: string, fade: float = 1.0)
```

**`autoload Name`** declares a singleton registered in `project.godot`'s `[autoload]` section. Accessed from any script as `Name.method()` or `Name.field`. The LLM emits a script at `res://autoload/<Name>.gd` and adds the registration line to `project.godot`.

### `resource` — Custom Resource Types

```gist
resource EnemyStats {
  extends: Resource
  hp: int
  atk: int
  def: int
  xp_reward: int
  move_speed: float
  loot_table: string
}
```

**`resource Name { }`** declares a custom `Resource` subclass. The LLM emits:

- `res://resources/types/<Name>.gd` — the `class_name <Name> extends Resource` definition with `@export` fields
- One `.tres` file per instance when combined with a `rules` table (see "Core construct interactions" below)

Use `resource` for data-driven content you want to edit in the Inspector. Use `rules` for tabular data that's easier to write inline in GIST.

### `group` — Node Groups

```gist
node Goblin {
  base: CharacterBody2D
  group: enemies
}

on player_attack:
  for each enemy in group enemies:
    deal damage to enemy
```

**`group <name>`** tags a node into a Godot group. The LLM emits `add_to_group("enemies")` in `_ready()` and translates `group <name>` references into `get_tree().get_nodes_in_group("<name>")` calls.

---

## Godot interpretation of `gamedev` constructs

The Godot kit tells the LLM how to translate each gamedev construct into Godot-native output. When both kits are active:

| gamedev construct | Godot output |
|---|---|
| `scene MainMenu` | `res://scenes/MainMenu.tscn` + `res://scripts/MainMenu.gd`. Scene root is `Control` for UI scenes, `Node2D`/`Node3D` otherwise. Transitions via `get_tree().change_scene_to_file("res://scenes/X.tscn")`. |
| `entity Player` | A scene + script. Base class inferred from `hitbox`/`collision_layer`/`collision_mask`: with collision → `CharacterBody2D`/`CharacterBody3D`; trigger-only → `Area2D`/`Area3D`; static → `StaticBody2D`/`StaticBody3D`; no physics → `Node2D`/`Node3D`. Fields become `@export` when they belong in the Inspector (data-ish values), plain member vars otherwise. |
| `component Damageable` | Either (a) a child node with a companion script, attached via composition, or (b) a mixin script the entity script `extends`. Default is (a). |
| `system Movement` | Autoload singleton with `_process(delta)` (or `_physics_process` when the system touches physics bodies). Query `get_tree().get_nodes_in_group(...)` resolves the `query:` clause. |
| `input:` block | Appends entries to `project.godot`'s `[input]` section. Reads use `Input.is_action_pressed("move_left")` / `is_action_just_pressed` / `is_action_just_released`. Input handlers declared with `on input action pressed/released/held` become `_unhandled_input(event)` branches. |
| `spawn Thing at pos` | `var t = preload("res://scenes/Thing.tscn").instantiate(); t.position = pos; add_child(t)`. |
| `destroy entity` | `entity.queue_free()`. When `ephemeral` specifies a duration, emit a `Timer` node or `await get_tree().create_timer(...).timeout` instead. |
| `on collision(a: A, b: B)` | For `Area2D` → `area_entered` / `body_entered` signal connected in `_ready()`. For `CharacterBody2D` with `move_and_slide()` → iterate `get_slide_collision_count()`. |
| `state X for Entity.status` | GDScript state machine: an `@export var status: State` enum, a `match status:` dispatch inside `_process`, and signal-triggered transitions. For animation-driven states, prefer an `AnimationTree` state machine and document that choice inline. |
| `rules enemy_stats` | Emit one `.tres` file per row under `res://resources/rules/enemy_stats/`, plus a singleton loader `res://autoload/Rules.gd` that `preload`s each `.tres` on startup. Row fields become `@export` vars on a `class_name EnemyStatsRow extends Resource`. |

---

## Core construct interactions

- **`always:` invariants** → type hints on fields (`var health: int`) plus `assert()` in setter code paths when the invariant is enforceable at runtime. Non-runtime-checkable invariants (balance rules) become comments on the generated field.
- **`on` event handlers** → when the event maps to a Godot signal, emit a `connect()` in `_ready()`. When it's a lifecycle callback, emit the appropriate `_ready()` / `_exit_tree()` / `_notification()` method.
- **`ephemeral` state** → short-lived fields emitted with a `Timer` node that calls a reset handler, or a `Tween` when the value animates (`modulate`, `scale`, etc.).
- **`code:` blocks** → inline GDScript verbatim. Indentation is preserved and normalized to the `gdscript.indent` setting.
- **`fn name(args) -> ret`** → a free function on the nearest enclosing autoload or script, with type-hinted signature when `gdscript.typed: true`.

---

## Interpretation Rules

When `kit: godot` is active (which auto-loads `gamedev`), the LLM:

1. Produces a Godot 4 project tree (see "Code generation expectations" below), not an engine-agnostic source tree.
2. Emits one `.tscn` per `scene` and per top-level `node`; each `.tscn` references its companion `.gd` script via `[node ...] script = ExtResource(...)`.
3. Uses `class_name` on every script by default (override via `gdscript.class_name_style`). This lets other scripts refer to the type without `preload`.
4. Emits type hints on all variables and function signatures when `gdscript.typed: true` (default). Omits them when false.
5. Chooses `CharacterBody2D`/`CharacterBody3D` for entities with movement + collision; `Area2D`/`Area3D` for trigger volumes (pickups, detection ranges); `RigidBody2D`/`RigidBody3D` only when the spec describes physics-driven motion (thrown objects, ragdolls).
6. Maps `collision_layer` / `collision_mask` to numeric layers resolved through `godot_physics.layer_names`. Missing names fall back to layer 1.
7. Registers `autoload` singletons in `project.godot`'s `[autoload]` section in declaration order.
8. Emits `rules` tables as `.tres` Resources **and** a singleton loader — so game code reads `Rules.enemy_stats.goblin.hp` rather than parsing dictionaries at runtime.
9. Writes `project.godot` with: application/config, autoload registrations, input map, rendering/renderer, physics layer names, and the `main_scene` path.
10. Emits `signal` declarations on the `emitter:` script (or the nearest enclosing node when `emitter:` is absent) and wires connections in the consumer's `_ready()`.
11. Uses PascalCase for scene/script/class names and snake_case for signal, variable, function, and file-stem names (e.g., `player.gd` attached to scene `Player.tscn`).
12. Prefers code-based signal connection (`connect("name", callable)`) over editor-based connection, so every wire-up is visible in source.
13. Never generates `.godot` cache directories or `.import` files — those are produced by the editor on first open.

---

## Code Generation Expectations

```
project.godot                     # application/config, autoload, input, rendering, physics layers
main.tscn                         # only when no explicit scene is the entry point
scenes/
  MainMenu.tscn                   # one .tscn per gamedev `scene`
  Gameplay.tscn
  Player.tscn                     # one .tscn per top-level `node` or `entity`
  Goblin.tscn
scripts/
  main_menu.gd                    # companion script for each .tscn
  gameplay.gd
  player.gd
  goblin.gd
  systems/
    movement.gd                   # one script per `system`, registered as autoload
autoload/
  game_manager.gd                 # one script per `autoload`
  audio_manager.gd
  rules.gd                        # rules-loader singleton
resources/
  types/
    enemy_stats_row.gd            # class_name EnemyStatsRow extends Resource
    item.gd
  rules/
    enemy_stats/
      goblin.tres
      skeleton.tres
      dragon.tres
    loot_table/
      common.tres
shaders/                          # .gdshader — only when referenced
assets/
  sprites/                        # per gist.yaml assets.sprites
  audio/
  tilesets/
  fonts/
```

---

## Field annotations: `@export` and typed GDScript

Two soft conventions the LLM applies when translating fields:

- **Inspector-exposed fields.** Fields with a default value, a `values:` list, or an explicit `@export` comment in the spec become `@export var name: Type = default`. Fields without defaults that are computed at runtime stay as plain `var`.
- **Typed GDScript.** Every generated variable and function signature gets a type hint when `gdscript.typed: true`. The type is inferred from the field's GIST type (`int`, `float`, `bool`, `string` → GDScript equivalents; `Coord` → `Vector2`/`Vector3`; `-> Entity` → the entity's class_name).

---

## `gist.yaml` example

```yaml
project: dungeon_crawler
version: 0.1.0

runtime:
  language: GDScript
  platform: Godot

engine:
  name: Godot
  version: "4.3"
  renderer: forward_plus
  target_fps: 60

godot:
  version: "4.3"
  renderer: forward_plus
  main_scene: "res://scenes/MainMenu.tscn"
  project_name: "Dungeon Crawler"

gdscript:
  typed: true
  class_name_style: always
  indent: tabs

godot_physics:
  dimension: "2d"
  layer_names:
    1: player
    2: enemies
    3: items
    4: walls

physics:
  type: built-in
  gravity: { x: 0, y: 0 }

assets:
  base_path: res://assets
  sprites: res://assets/sprites
  audio: res://assets/audio
  tilesets: res://assets/tilesets

audio:
  music_bus: Music
  sfx_bus: SFX
```

---

## Full Example

This example builds on the dungeon-crawler spec from the gamedev kit's KIT.md and adds Godot-native constructs where engine-specific control matters.

```gist
project dungeon_crawler
  > 2D roguelike with procedural dungeons and turn-based combat. Godot 4 target.

  kit: godot
  stack: gist.yaml

  rules enemy_stats:
    goblin:   { hp: 30, atk: 5, def: 2, xp: 10, speed: 80 }
    skeleton: { hp: 50, atk: 8, def: 5, xp: 25, speed: 60 }
    dragon:   { hp: 200, atk: 25, def: 15, xp: 500, speed: 40 }

  always:
    player health clamped to [0, max_health]
    dead entities cannot act or be targeted

  input:
    move_left: [a, arrow_left]
    move_right: [d, arrow_right]
    move_up: [w, arrow_up]
    move_down: [s, arrow_down]
    attack: [space]
    pause: [escape]


// ── Custom Resource type for enemy rows (generates .gd + .tres files) ──

resource EnemyStatsRow {
  extends: Resource
  hp: int
  atk: int
  def: int
  xp_reward: int
  move_speed: float
}


// ── Godot signals ──

signal damage_taken(amount: int, source: Node)
signal enemy_defeated(enemy: Node, xp: int)
signal level_completed(score: int)


// ── Global singletons ──

autoload GameManager
  > Game-wide state and scene routing.
  state: playing | paused | game_over
  current_level: int = 1
  player_score: int = 0

  on level_completed(score):
    player_score += score
    if current_level < 10:
      current_level += 1
      transition to Dungeon
    else:
      transition to Victory

autoload AudioManager
  > Centralized SFX and music playback.
  fn play_sfx(name: string)
  fn play_music(name: string, fade: float = 1.0)


// ── Scenes ──

scene MainMenu
  > Title screen. UI-only, so the .tscn root is Control.
  on start:
    AudioManager.play_music("title_theme")
  input:
    enter -> transition to Dungeon
    escape -> quit game

scene Dungeon
  > Main gameplay scene.
  layers: [floor, entities, particles, ui]
  on start:
    generate dungeon using BSP algorithm
    spawn Player at dungeon.start_room
    for each room in dungeon.rooms:
      spawn enemies based on room.difficulty from rules enemy_stats
  on exit:
    save game state


// ── Godot-typed nodes (direct control over base class) ──

node Player {
  base: CharacterBody2D
  group: player

  position: Coord
  sprite: "player.png"
  speed: float = 200.0
  health: int = 100
  max_health: int = 100
  xp: int = 0

  hitbox: rectangle(16, 24)
  collision_layer: player
  collision_mask: [enemies, items, walls]
}

node Goblin {
  base: CharacterBody2D
  group: enemies

  position: Coord
  sprite: "goblin.png"
  stats: -> EnemyStatsRow = from rules enemy_stats.goblin

  hitbox: circle(12)
  collision_layer: enemies
  collision_mask: [player, walls]
}


// ── State machines (GDScript match dispatch) ──

state PlayerState for Player.status:
  idle -> walking -> attacking -> idle
  any -> hurt when damage_taken
  hurt -> idle after 0.3s
  any -> dead when health <= 0

  on enter attacking:
    deal damage to entities in attack range using calculate_damage
  on enter dead:
    AudioManager.play_sfx("player_death")
    transition to GameOver


// ── Systems (emitted as autoload _process) ──

system PlayerInput
  > Convert InputMap actions into player velocity.
  query: Player
  update(dt):
    direction = (0, 0)
    if input move_left held:  direction.x -= 1
    if input move_right held: direction.x += 1
    if input move_up held:    direction.y -= 1
    if input move_down held:  direction.y += 1
    normalize direction
    player.velocity = direction * player.speed

    if input attack pressed and player can attack:
      transition player to attacking


// ── Signal handlers ──

on damage_taken(amount, source):
  player.health -= amount
  AudioManager.play_sfx("hurt")
  if player.health <= 0:
    emit enemy_defeated(player, 0)

on enemy_defeated(enemy, xp):
  player.xp += xp
  destroy enemy after 0.5s
```

The LLM produces:

- `project.godot` with autoload entries (`GameManager`, `AudioManager`, `PlayerInput`, `Rules`), input map, physics layer names, rendering settings, and `run/main_scene="res://scenes/MainMenu.tscn"`.
- `scenes/MainMenu.tscn`, `scenes/Dungeon.tscn`, `scenes/Player.tscn`, `scenes/Goblin.tscn`.
- `scripts/main_menu.gd`, `scripts/dungeon.gd`, `scripts/player.gd` (with the `PlayerState` state machine), `scripts/goblin.gd`.
- `scripts/systems/player_input.gd` registered as autoload.
- `autoload/game_manager.gd`, `autoload/audio_manager.gd`, `autoload/rules.gd`.
- `resources/types/enemy_stats_row.gd` (`class_name EnemyStatsRow extends Resource`).
- `resources/rules/enemy_stats/goblin.tres`, `skeleton.tres`, `dragon.tres`.

---

*GIST Kit: Godot v1.0.0*
