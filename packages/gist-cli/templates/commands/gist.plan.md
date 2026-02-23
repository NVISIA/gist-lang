---
description: Analyze GIST specs and produce an implementation plan before generating code
arguments:
  - name: focus
    description: "Optional: specific module or concern to plan around"
    required: false
---

# /gist.plan

Analyze the GIST specification and produce a detailed implementation plan — without generating any code yet.

## Steps

### 1. Load the specification

Read in order:
1. `gist.yaml` — project manifest
2. All `.gist` files in the project
3. Kit files for any declared kits (`kits/<name>/kit.yaml` + `kits/<name>/KIT.md`)

### 2. Analyze the architecture

Produce a plan covering:

**Data layer**
- List all models with their fields, relationships (model refs `->Model`), and constraints
- Identify the database schema: tables, columns, indexes, foreign keys
- Note any state machines and their transition graphs
- List migrations needed

**Module dependency graph**
- Map module `needs:` relationships
- Identify the processing order
- Flag any circular dependencies

**API surface** (if applicable)
- List all routes from `to` intents with `route:` declarations
- Group by module
- Note auth requirements (`guard:`), rate limits, pagination

**Services and integrations**
- List all `uses:` service references
- Map to `gist.yaml` `services:` definitions
- Identify client libraries needed

**Kit-specific architecture**
- For each declared kit, list the constructs used and what they produce
- Note any kit-specific infrastructure needs

### 3. Identify decisions

Flag areas where the spec is ambiguous or where architectural choices are needed:
- Multiple valid approaches for a feature
- Missing infrastructure details
- Performance considerations
- Security implications

### 4. Propose file structure

Output the proposed directory tree showing every file that `/gist.generate` would create, organized by concern.

### 5. Estimate scope

Provide a rough breakdown:
- Number of source files
- Number of test files
- Number of migrations
- Key dependencies to install
- Infrastructure requirements

## Output format

Structure the plan with clear headers. End with a "Ready to generate?" section listing any blockers or open questions that should be resolved before running `/gist.generate`.
