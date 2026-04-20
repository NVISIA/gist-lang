import * as fs from 'fs';
import * as path from 'path';

/**
 * Scaffold a new kit directory with kit.yaml and KIT.md templates.
 */
export function scaffoldKit(name: string, targetDir: string): void {
  fs.mkdirSync(targetDir, { recursive: true });

  // Write kit.yaml
  const kitYaml = generateKitYaml(name);
  fs.writeFileSync(path.join(targetDir, 'kit.yaml'), kitYaml, 'utf-8');

  // Write KIT.md
  const kitMd = generateKitMd(name);
  fs.writeFileSync(path.join(targetDir, 'KIT.md'), kitMd, 'utf-8');
}

function generateKitYaml(name: string): string {
  return `kit: ${name}
version: 0.1.0
author: ""
description: ""
license: MIT

# ─── Keywords ──────────────────────────────────────────
# Keywords this kit adds to the GIST language.
# These become recognized in .gist files when the kit is loaded.

keywords: []
#  - my_keyword

# ─── Cross-kit features this kit uses ─────────────────
# Reference other built-in features like state, on, fn, etc.

extends: []
#  - state
#  - on
#  - fn

# ─── Parent kits ──────────────────────────────────────
# Other kits this kit builds on top of. When a project activates
# this kit, parents listed here are implicitly activated too.

extends_kits: []
#  - gamedev

# ─── Constructs ───────────────────────────────────────
# Define each keyword's behavior for IDE support
# (completions, hover docs, snippets, field validation).

constructs: {}
#  my_keyword:
#    kind: declaration        # declaration | inline | block
#    name_style: identifier   # identifier | PascalCase | none
#    doc: Description of what this construct does
#    fields:
#      name:
#        type: identifier
#        required: true
#        doc: The name of the thing
#    children:
#      - on
#    supports:
#      - do
#      - must
#    snippet: "my_keyword \${1:name}\\n  \${2:body}"

# ─── YAML Sections ────────────────────────────────────
# Custom sections this kit adds to gist.yaml.

yaml_sections: {}
#  ${name}:
#    description: Configuration for ${name}
#    fields:
#      option_name:
#        type: string
#        required: false
#        default: default_value
#        values: [option_a, option_b]
`;
}

function generateKitMd(name: string): string {
  return `# ${name} Kit

## Overview

The **${name}** kit extends GIST with domain-specific constructs for [describe your domain].

## Keywords

<!-- List each keyword this kit introduces and what it means -->

## Interpretation Rules

When an AI agent encounters ${name} constructs in a .gist spec, it should:

1. **[Rule 1]** — describe how to interpret the construct
2. **[Rule 2]** — describe code generation patterns
3. **[Rule 3]** — describe any special handling

## Code Generation

### Construct: \`my_keyword\`

**Input (GIST):**
\`\`\`gist
my_keyword example_name
  do:
    describe what it does
\`\`\`

**Output (Generated code):**
\`\`\`typescript
// Show what code the AI should generate
\`\`\`

## Configuration

Add to your \`gist.yaml\`:

\`\`\`yaml
kit: ${name}

# Kit-specific configuration:
# ${name}:
#   option: value
\`\`\`
`;
}
