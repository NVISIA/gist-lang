# GIST Kit: Game Development

*Scenes, entities, input, and game loops for any engine.*

---

## Overview

The gamedev kit adds constructs for describing game structure and behavior in GIST. The LLM generates engine-specific code (Godot, Unity, Bevy, Phaser, Pygame, etc.) based on the `engine:` section in `gist.yaml`.

GIST's core constructs already handle most game logic — state machines for entity behavior, events for game events, rules tables for balance data, `fn` for game math, `code:` for algorithms. This kit adds the structural pieces that are unique to games: scenes, entities, input, and the update loop.

**Activate:** `kit: gamedev` in your project header.

**Requires `gist.yaml` sections:** `engine` (required), `physics`, `assets`, `audio`, `input` (optional).

---

## Keywords

### `scene` — Game Scenes

```gist
scene MainMenu
  > Title screen with start and options.
  on start:
    play music "title_theme"
    show title image
  on exit:
    fade out music
  input:
    enter -> transition to Gameplay
    escape -> quit game

scene Gameplay
  > The main gameplay scene.
  layers: [background, terrain, entities, particles, ui]
  on start:
    load level from current save
    spawn Player at level.start_position
  on pause:
    show pause menu
  on exit:
    save game state
```

**`scene Name`** declares a game scene — a discrete screen or mode (main menu, gameplay level, inventory, cutscene). The LLM generates the engine's scene/state equivalent.

**Scene blocks:**

| Block | Purpose |
|-------|---------|
| `on start:` | Runs when scene loads |
| `on exit:` | Runs when scene unloads |
| `on pause:` | Runs when scene pauses |
| `on resume:` | Runs when scene resumes from pause |
| `input:` | Scene-specific input bindings |
| `layers:` | Rendering layer order (back to front) |

**Scene transitions** use prose: `transition to SceneName`. The LLM generates the engine's scene transition mechanism (with optional transition effects when described).

### `entity` — Game Entities

```gist
entity Player {
  position: Coord
  velocity: Coord = (0, 0)
  sprite: "player.png"
  health: int = 100
  max_health: int = 100
  inventory: -> Item[0..20]
  speed: float = 200.0

  hitbox: rectangle(16, 24)
  collision_layer: player
  collision_mask: [enemies, items, walls]
}

entity Goblin {
  position: Coord
  sprite: "goblin.png"
  health: int = from rules enemy_stats.goblin.hp
  attack: int = from rules enemy_stats.goblin.atk
  detection_range: float = 150.0
  patrol_path?: Coord[]

  hitbox: circle(12)
  collision_layer: enemies
  collision_mask: [player, walls]
}
```

**`entity Name { }`** declares a game entity — something that exists in the game world. Like models, entities have typed fields. Unlike models, entities have spatial properties (`hitbox`, `collision_layer`, `collision_mask`) and are not persisted to a database.

**Entity-specific fields:**

| Field | Purpose |
|-------|---------|
| `hitbox:` | Collision shape — `rectangle(w, h)`, `circle(r)`, `polygon(points)` |
| `collision_layer:` | What collision group this entity belongs to |
| `collision_mask:` | What collision groups this entity detects |
| `sprite:` | Visual representation |
| `animation:` | Animation state machine reference |

Entities can use core GIST features: `...TraitName` for shared fields, state machines for behavior states, `always:` for invariants.

### `component` — Reusable Entity Parts

```gist
component Damageable {
  health: int
  max_health: int
  armor: int = 0
  is_invulnerable: bool = false

  always: health clamped to [0, max_health]
}

component Movable {
  velocity: Coord = (0, 0)
  speed: float
  friction: float = 0.9
}

entity Player {
  ...Damageable
  ...Movable
  position: Coord
  sprite: "player.png"
  health: 100
  max_health: 100
  speed: 200.0
}
```

**`component Name { }`** declares a reusable bundle of fields and constraints. Uses GIST's existing trait spread syntax (`...Name`) to attach to entities. Components are the building blocks of entities — they're data bags, not behavior.

### `system` — Game Logic Systems

```gist
system Movement
  > Moves entities with Movable component each frame.
  query: entities with Movable, position
  update(dt):
    entity.position.x += entity.velocity.dx * dt
    entity.position.y += entity.velocity.dy * dt
    entity.velocity.dx *= entity.friction
    entity.velocity.dy *= entity.friction

system EnemyAI
  > Enemies chase player when in detection range.
  query: entities with enemy_ai, position
  update(dt):
    player_pos = get nearest Player position
    distance = distance_to(entity.position, player_pos)
    if distance < entity.detection_range:
      move entity toward player_pos at entity.speed * dt
    else if entity.patrol_path:
      follow patrol path
```

**`system Name`** declares a game system — logic that runs each frame on entities matching a query. This is the "S" in Entity-Component-System.

**System blocks:**

| Block | Purpose |
|-------|---------|
| `query:` | Which entities this system operates on |
| `update(dt):` | Per-frame logic (dt = delta time in seconds) |
| `fixed_update(dt):` | Physics-rate logic (fixed timestep) |

Systems can use `code:` blocks for precise algorithms:

```gist
system Physics
  query: entities with Movable, hitbox
  fixed_update(dt):
    code:
      for each pair (a, b) in query where layers_overlap(a, b):
        if overlaps(a.hitbox, b.hitbox):
          resolve_collision(a, b)
          emit collision(a, b)
```

### `input` — Input Mapping

```gist
input:
  move_left: [a, arrow_left, gamepad_left_stick_left]
  move_right: [d, arrow_right, gamepad_left_stick_right]
  move_up: [w, arrow_up, gamepad_left_stick_up]
  move_down: [s, arrow_down, gamepad_left_stick_down]
  attack: [space, gamepad_a]
  interact: [e, gamepad_x]
  pause: [escape, gamepad_start]
```

**`input:`** maps action names to physical inputs. Defined in the project header or in a scene. Actions are referenced in behavior by name, never by raw key.

**In behavior:**

```gist
on input move_left held:
  accelerate player left at player.speed

on input attack pressed:
  if player can attack:
    start attack animation
    deal damage to entities in attack range
```

**Input modes:**

| Mode | Meaning |
|------|---------|
| `pressed` | Single frame when key goes down |
| `released` | Single frame when key goes up |
| `held` | Every frame while key is down |

---

## Core Construct Usage in Games

### State Machines → Entity Behavior

```gist
state EnemyBehavior for Goblin.ai_state:
  idle -> patrol -> chase -> attack -> idle
  chase -> attack when distance_to_player < attack_range
  idle -> chase when player_detected
  any -> dead when health <= 0

  on enter chase:
    play sound "alert"
    set sprite tint to red
  on enter dead:
    play death animation
    drop loot from rules loot_table
    destroy entity after animation completes
```

### Events → Game Events

```gist
on collision(player: Player, item: Item):
  add item to player.inventory
  play sound "pickup"
  destroy item
  emit item_collected(player, item)

on collision(player: Player, enemy: Goblin) when enemy.is_hostile:
  deal damage to player: calculate_damage(enemy, player)
  apply knockback to player away from enemy
  start player invulnerability for 0.5s

on item_collected(player, item) when player.inventory full:
  show notification "Inventory full!"
```

### Rules Tables → Game Balance

```gist
rules enemy_stats:
  goblin:   { hp: 30, atk: 5, def: 2, xp: 10, speed: 80 }
  skeleton: { hp: 50, atk: 8, def: 5, xp: 25, speed: 60 }
  dragon:   { hp: 200, atk: 25, def: 15, xp: 500, speed: 40 }

rules level_thresholds:
  1: { xp: 0 }
  2: { xp: 100 }
  3: { xp: 300 }
  4: { xp: 600 }
  5: { xp: 1000 }

rules loot_table:
  common:    { weight: 60, items: ["potion", "arrow_x5"] }
  uncommon:  { weight: 30, items: ["iron_sword", "leather_armor"] }
  rare:      { weight: 10, items: ["enchanted_blade", "dragon_scale"] }
```

### `fn` → Game Math

```gist
fn calculate_damage(attacker, defender) -> int
  code:
    base = attacker.atk - defender.def
    crit_chance = 0.1
    is_crit = random() < crit_chance
    multiplier = 2.0 if is_crit else 1.0
    damage = max(1, floor(base * multiplier + random(-2, 2)))
    return damage

fn distance_to(a: Coord, b: Coord) -> float
  code:
    dx = b.x - a.x
    dy = b.y - a.y
    return sqrt(dx * dx + dy * dy)
```

### Ephemeral → Transient Game State

```gist
InvulnerabilityBuff = ephemeral {
  entity: -> Player
  started_at: datetime
  ttl: 0.5s
}

DamageNumber = ephemeral {
  position: Coord
  value: int
  color: string
  ttl: 1s
}
```

---

## Grammar Productions

```ebnf
SceneDecl          = 'scene' <type_name> INDENT
                     { ContextLine }
                     [ SceneLayersLine ]
                     { SceneHook }
                     [ InputBlock ]
                     DEDENT ;

SceneLayersLine    = 'layers:' InlineList ;

SceneHook          = 'on' SceneEvent ':' INDENT { <prose> | CodeBlock } DEDENT ;
SceneEvent         = 'start' | 'exit' | 'pause' | 'resume' ;

EntityDecl         = 'entity' <type_name> '{' INDENT
                     { SpreadOrField | HitboxDecl | CollisionDecl }
                     [ AlwaysBlock ]
                     DEDENT '}' ;

HitboxDecl         = 'hitbox:' HitboxShape ;
HitboxShape        = 'rectangle' '(' <number> ',' <number> ')'
                   | 'circle' '(' <number> ')'
                   | 'polygon' '(' CoordList ')' ;
CollisionDecl      = ( 'collision_layer' | 'collision_mask' ) ':'
                     ( <identifier> | InlineList ) ;

ComponentDecl      = 'component' <type_name> '{' INDENT
                     { FieldDecl }
                     [ AlwaysBlock ]
                     DEDENT '}' ;

SystemDecl         = 'system' <type_name> INDENT
                     { ContextLine }
                     [ 'query:' <prose> ]
                     [ UpdateBlock ]
                     [ FixedUpdateBlock ]
                     DEDENT ;

UpdateBlock        = 'update' '(' <identifier> ')' ':'
                     INDENT { <prose> | CodeBlock } DEDENT ;
FixedUpdateBlock   = 'fixed_update' '(' <identifier> ')' ':'
                     INDENT { <prose> | CodeBlock } DEDENT ;

InputBlock         = 'input:' INDENT { InputMapping } DEDENT ;
InputMapping       = <identifier> ':' InlineList ;

InputHandler       = 'on' 'input' <identifier> InputMode ':'
                     INDENT { <prose> } DEDENT ;
InputMode          = 'pressed' | 'released' | 'held' ;
```

---

## Interpretation Rules

When `kit: gamedev` is active, the LLM:

1. Maps `scene` to the engine's scene/state system (Godot `Node2D`/`Node3D`, Unity `MonoBehaviour`, Bevy `State`, Phaser `Scene`)
2. Maps `entity` to the engine's entity representation (Godot nodes, Unity GameObjects, Bevy entities, Phaser sprites/groups)
3. Maps `component` to data classes or structs that attach to entities
4. Maps `system` to per-frame update functions that query and process entities
5. Maps `input:` bindings to the engine's input system (Godot `InputMap`, Unity `InputSystem`, Bevy `Input<KeyCode>`)
6. Maps `hitbox` and collision declarations to the engine's physics/collision system
7. Interprets `spawn` in prose as entity instantiation
8. Interprets `destroy` in prose as entity removal (with cleanup)
9. Generates asset loading code from `gist.yaml` `assets:` paths
10. Configures physics from `gist.yaml` `physics:` section

---

## Code Generation Expectations

The LLM produces engine-appropriate project structure. For example, with Godot:

- `project.godot` — project configuration
- `scenes/` — one `.tscn` per `scene`
- `scripts/` — GDScript files for entities, systems, event handlers
- `autoload/` — game manager, input manager, audio manager
- `resources/` — data resources from `rules:` tables

With Bevy (Rust):

- `src/main.rs` — app builder with plugins and systems
- `src/components.rs` — component structs
- `src/systems/` — one file per `system`
- `src/scenes/` — scene state and setup
- `src/events.rs` — custom event types
- `Cargo.toml` — dependencies

---

## Full Example

```gist
project dungeon_crawler
  > 2D roguelike with procedural dungeons and turn-based combat.

  kit: gamedev
  stack: gist.yaml

  rules enemy_stats:
    goblin:   { hp: 30, atk: 5, def: 2, xp: 10, speed: 80 }
    skeleton: { hp: 50, atk: 8, def: 5, xp: 25, speed: 60 }
    dragon:   { hp: 200, atk: 25, def: 15, xp: 500, speed: 40 }

  rules loot_table:
    common:    { weight: 60, items: ["potion", "arrow_x5"] }
    uncommon:  { weight: 30, items: ["iron_sword", "leather_armor"] }
    rare:      { weight: 10, items: ["enchanted_blade", "dragon_scale"] }

  rules level_thresholds:
    2: { xp: 100 }
    3: { xp: 300 }
    4: { xp: 600 }
    5: { xp: 1000 }

  always:
    dead entities cannot act or be targeted
    player health clamped to [0, max_health]

  input:
    move_left: [a, arrow_left]
    move_right: [d, arrow_right]
    move_up: [w, arrow_up]
    move_down: [s, arrow_down]
    attack: [space]
    interact: [e]
    pause: [escape]


type Coord = (float, float) { arithmetic: +, -, comparable }

EnemyKind = goblin | skeleton | dragon


component Damageable {
  health: int
  max_health: int
  armor: int = 0
  always: health clamped to [0, max_health]
}

component Movable {
  velocity: Coord = (0, 0)
  speed: float
  friction: float = 0.9
}


entity Player {
  ...Damageable
  ...Movable
  position: Coord
  sprite: "player.png"
  health: 100
  max_health: 100
  speed: 200.0
  level: int = 1
  xp: int = 0
  inventory: Item[] = []

  hitbox: rectangle(16, 24)
  collision_layer: player
  collision_mask: [enemies, items, walls]
}

entity Goblin {
  ...Damageable
  ...Movable
  position: Coord
  sprite: "goblin.png"
  kind: EnemyKind = goblin
  health: from rules enemy_stats.goblin.hp
  speed: from rules enemy_stats.goblin.speed
  detection_range: float = 150.0

  hitbox: circle(12)
  collision_layer: enemies
  collision_mask: [player, walls]
}

Item = {
  id: string
  name: string
  icon: string
  effect?: string
}


scene MainMenu
  > Title screen.
  on start:
    play music "title_theme"
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

scene GameOver
  > Death screen with retry option.
  on start:
    play sound "game_over"
    show final score
  input:
    enter -> transition to Dungeon
    escape -> transition to MainMenu


state PlayerState for Player.status:
  idle -> walking -> attacking -> idle
  any -> hurt when damage_received
  hurt -> idle after 0.3s
  any -> dead when health <= 0

  on enter attacking:
    deal damage to entities in attack range using calculate_damage
  on enter dead:
    transition to GameOver

state GoblinAI for Goblin.ai_state:
  idle -> patrol -> chase -> attack -> idle
  idle -> chase when player_in_detection_range
  chase -> attack when distance_to_player < 20
  any -> dead when health <= 0

  on enter chase:
    play sound "alert"
  on enter dead:
    grant xp from rules enemy_stats[entity.kind].xp
    roll loot from rules loot_table
    destroy entity after death animation


system Movement
  > Apply velocity to position each frame.
  query: entities with Movable, position
  update(dt):
    code:
      entity.position.x += entity.velocity.dx * dt
      entity.position.y += entity.velocity.dy * dt
      entity.velocity.dx *= entity.friction
      entity.velocity.dy *= entity.friction

system PlayerInput
  > Convert input to player movement.
  query: Player
  update(dt):
    direction = (0, 0)
    if input move_left held: direction.x -= 1
    if input move_right held: direction.x += 1
    if input move_up held: direction.y -= 1
    if input move_down held: direction.y += 1
    normalize direction
    player.velocity = direction * player.speed

    if input attack pressed and player can attack:
      transition player to attacking


fn calculate_damage(attacker, defender) -> int
  code:
    base = attacker.atk - defender.armor
    variance = random(-2, 2)
    return max(1, base + variance)


on collision(player: Player, item: Item):
  add item to player.inventory
  play sound "pickup"
  destroy item

on collision(player: Player, enemy) when enemy.collision_layer == enemies:
  deal calculate_damage(enemy, player) to player
  apply knockback to player away from enemy
  start invulnerability for 0.5s
```

```yaml
# gist.yaml
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

*GIST Kit: Gamedev v1.0.0*
