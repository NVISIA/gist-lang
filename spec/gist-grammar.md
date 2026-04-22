# GIST Formal Grammar

EBNF notation for the GIST language (v0.8). This grammar defines the structural skeleton that an LLM or parser can validate. Prose blocks within behavior are intentionally left as opaque strings — GIST is semi-structured by design.

---

## Notation Conventions

```
=           definition
|           alternation
[ ... ]     optional
{ ... }     repetition (zero or more)
( ... )     grouping
'...'       terminal literal (keyword)
"..."       terminal string
<...>       named token (lexical)
UPPER       non-terminal
NEWLINE     line break with same or deeper indentation
INDENT      increase indentation level
DEDENT      decrease indentation level
```

---

## 1. Lexical Tokens

```ebnf
<identifier>      = <lower_start> { <alphanum> | '_' } ;
<type_name>        = <upper_start> { <alphanum> } ;
<string_literal>   = '"' { <any_char> } '"' ;
<int_literal>      = [ '-' ] <digit> { <digit> } ;
<float_literal>    = [ '-' ] <digit> { <digit> } '.' <digit> { <digit> } ;
<duration>         = <int_literal> ( 's' | 'm' | 'h' | 'd' ) ;
<prose>            = <any_text_to_end_of_indented_block> ;
<comment>          = '//' <any_text_to_eol>
                   | '/*' <any_text> '*/' ;
```

---

## 2. Program

```ebnf
Program            = ProjectDecl
                     { TypeDecl | TraitDecl | ModelDecl | EnumDecl
                     | ErrorDecl | ConstDecl | StateDecl | ModuleDecl
                     | KitConstruct
                     | TestDecl } ;
```

---

## 3. Project Declaration

```ebnf
ProjectDecl        = 'project' <identifier> INDENT
                     { ContextLine }
                     [ KitLine ]
                     [ StackLine ]
                     [ StyleBlock ]
                     { RulesBlock }
                     [ AlwaysBlock ]
                     [ BeforeBlock ]
                     [ AfterBlock ]
                     DEDENT ;

ContextLine        = '>' <prose> ;
KitLine            = 'kit:' KitRef { ',' KitRef } ;
KitRef             = <identifier>
                   | <string_literal>              (* path or qualified name *)
                   ;
StackLine          = 'stack:' <string_literal> ;
StyleBlock         = 'style:' INDENT { <prose> } DEDENT ;
RulesBlock         = 'rules' <identifier> ':' INDENT
                     { RulesEntry } DEDENT ;
RulesEntry         = <identifier> ':' InlineObject ;
AlwaysBlock        = 'always:' INDENT { AlwaysLine } DEDENT ;
AlwaysLine         = [ 'across' <identifier> ':' ] <prose> ;
BeforeBlock        = 'before:' INDENT { <prose> } DEDENT ;
AfterBlock         = 'after:' INDENT { <prose> } DEDENT ;
```

---

## 4. Types

```ebnf
TypeDecl           = 'type' <type_name> '=' TypeBody [ Capabilities ] ;

TypeBody           = PrimitiveType                       (* branded primitive *)
                   | TupleType                           (* tuple *)
                   | StructType                          (* value object *)
                   ;

TupleType          = '(' TypeRef ',' TypeRef { ',' TypeRef } ')' ;
StructType         = '{' FieldList '}' ;
Capabilities       = '{' { CapabilityEntry } '}' ;
CapabilityEntry    = CapName [ ':' CapValue { ',' CapValue } ] ;
CapName            = 'arithmetic' | 'comparable' | 'roundable'
                   | 'precision' | 'display' | 'format' ;
CapValue           = <identifier> | <string_literal> | <int_literal>
                   | '+' | '-' | '*' | '/' | '<' | '>' | '<=' | '>=' | '==' ;
```

---

## 5. Traits

```ebnf
TraitDecl          = 'trait' <type_name> '{' INDENT
                     { FieldDecl }
                     [ AlwaysBlock ]
                     DEDENT '}' ;
```

---

## 6. Models

```ebnf
ModelDecl          = <type_name> '=' ModelKind '{' INDENT
                     { SpreadOrField }
                     [ AlwaysBlock ]
                     [ RetainDecl ]
                     DEDENT '}' ;

ModelKind          = [ 'ephemeral' | 'immutable' ] ;

SpreadOrField      = SpreadField | FieldDecl | TtlDecl ;
SpreadField        = '...' <type_name> ;
TtlDecl            = 'ttl:' <duration> ;
RetainDecl         = 'retain:' RetainDuration ;
RetainDuration     = <int_literal> ( 'days' | 'years' ) | 'forever' ;

FieldDecl          = <identifier> [ '?' ] ':' TypeRef
                     { ',' FieldModifier }
                     [ '=' Literal ]
                     [ ComputedDesc ] ;

FieldModifier      = 'generated' | 'unique' | 'secret' | 'computed'
                   | <identifier> ;           (* e.g., uuid, cuid *)

ComputedDesc       = INDENT '>' <prose> DEDENT ;
```

---

## 7. Enums

```ebnf
EnumDecl           = <type_name> '=' EnumValue { '|' EnumValue } ;
EnumValue          = <identifier> ;
```

---

## 8. Error Types

```ebnf
ErrorDecl          = <type_name> '=' 'error' '{' INDENT
                     { ErrorField }
                     DEDENT '}' ;

ErrorField         = <identifier> ( '=' Literal | ':' TypeRef [ '=' Literal ] ) ;
```

---

## 9. Constants

```ebnf
ConstDecl          = <UPPER_IDENTIFIER> '=' Literal ;
```

---

## 10. State Machines

```ebnf
StateDecl          = 'state' <type_name> 'for' <type_name> '.' <identifier> ':'
                     INDENT
                     { TransitionLine }
                     { StateHook }
                     DEDENT ;

TransitionLine     = <identifier> { '->' <identifier> }
                     [ 'when' <prose> ] ;

StateHook          = OnEnterHook | OnWhileHook ;
OnEnterHook        = 'on' 'enter' <identifier> ':' INDENT <prose> DEDENT ;
OnWhileHook        = 'on' <identifier> 'while' <identifier> ':'
                     INDENT <prose> DEDENT ;
```

---

## 11. Modules

```ebnf
ModuleDecl         = 'module' <identifier> INDENT
                     { ContextLine }
                     [ NeedsLine ]
                     [ BeforeBlock ]
                     [ AfterBlock ]
                     { IntentDecl | FnDecl | FlowDecl | OnHandler }
                     DEDENT ;

NeedsLine          = 'needs:' <identifier> { ',' <identifier> } ;
```

---

## 12. Intents (`to`)

```ebnf
IntentDecl         = 'to' <identifier> '(' [ ParamList ] ')'
                     [ '->' TypeRef ]
                     INDENT
                     { MetadataLine }
                     [ DoBlock ]
                     [ CodeBlock ]
                     [ FailsBlock ]
                     [ MustBlock ]
                     [ EnsureBlock ]
                     [ EgBlock ]
                     DEDENT ;

ParamList          = Param { ',' Param } ;
Param              = <identifier> [ '?' ] [ ':' TypeRef ] [ '=' Literal ] ;

MetadataLine       = 'needs:' <prose>
                   | 'saves:' <identifier> { ',' <identifier> }
                   | 'emits:' <identifier> { ',' <identifier> }
                   | 'route:' HttpMethod <path>
                   | 'socket:' <identifier>
                   | 'guard:' <prose>
                   | 'uses:' <identifier> { ',' <identifier> }
                   | 'schedule:' ScheduleExpr
                   | 'public'
                   | 'async'
                   | 'trace' ;

HttpMethod         = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' ;
ScheduleExpr       = 'every' <prose>
                   | 'first' <prose>
                   | 'cron:' <string_literal> ;

DoBlock            = 'do:' INDENT { <prose> } DEDENT ;
CodeBlock          = 'code:' INDENT { <pseudocode_line> } DEDENT ;
FailsBlock         = 'fails:' INDENT { <type_name> 'when' <prose> } DEDENT ;
MustBlock          = 'must:' ( <prose> | INDENT { <prose> } DEDENT ) ;
EnsureBlock        = 'ensure:' ( <prose> | INDENT { <prose> } DEDENT ) ;
EgBlock            = 'eg:' INDENT { <prose> } DEDENT ;
```

---

## 13. Pure Functions (`fn`)

```ebnf
FnDecl             = 'fn' <identifier> '(' [ ParamList ] ')'
                     [ '->' TypeRef ]
                     INDENT
                     [ ContextLine ]
                     ( <prose> | CodeBlock )
                     [ MustBlock ]
                     [ EnsureBlock ]
                     [ EgBlock ]
                     DEDENT ;
```

---

## 14. Flows (`flow`)

```ebnf
FlowDecl           = 'flow' <identifier> '(' [ ParamList ] ')'
                     [ '->' TypeRef ]
                     INDENT
                     { MetadataLine }
                     { StageBlock }
                     [ MustBlock ]
                     [ EnsureBlock ]
                     DEDENT ;

StageBlock         = 'stage' <identifier> ':'
                     INDENT
                     { <prose> | CodeBlock }
                     [ CompensateBlock ]
                     DEDENT ;

CompensateBlock    = 'compensate:' INDENT { <prose> } DEDENT ;
```

---

## 15. Event Handlers (`on`)

```ebnf
OnHandler          = 'on' <identifier> '(' [ ParamList ] ')'
                     [ 'when' <prose> ] ':'
                     INDENT
                     { MetadataLine }
                     { <prose> | CodeBlock }
                     DEDENT ;
```

---

## 16. Kit Extensions

Kits introduce domain-specific constructs that are not part of the core grammar. The core grammar provides a generic extension point:

```ebnf
KitConstruct       = <kit_keyword> <type_name> [ '{' INDENT
                     { FieldDecl | ContextLine | <prose> }
                     DEDENT '}' ]
                   | <kit_keyword> <type_name> INDENT
                     { ContextLine | <prose> | CodeBlock | KitBlock }
                     DEDENT ;

KitBlock           = <identifier> ':' ( <prose> | InlineList | InlineObject
                   | INDENT { <prose> | CodeBlock } DEDENT ) ;
```

**`<kit_keyword>`** is any keyword declared in a kit's `kit.yaml` `keywords:` list. The LLM validates that a keyword belongs to a loaded kit. Unknown keywords without a kit trigger: `// GIST: unknown keyword — no kit loaded for '<keyword>'`.

Each kit's `KIT.md` provides the specific grammar productions for its constructs. For example, the IaC kit defines `ResourceDecl`, `GroupDecl`, `VariableDecl`, `OutputDecl`, and `DataDecl`. The gamedev kit defines `SceneDecl`, `EntityDecl`, `ComponentDecl`, `SystemDecl`, and `InputBlock`. These are documented in each kit's own `KIT.md` file.

---

## 17. Tests

```ebnf
TestDecl           = 'test' <identifier> INDENT
                     [ GivenBlock ]
                     { TestStep }
                     DEDENT ;

GivenBlock         = 'given:' ( <prose> | INDENT { <prose> } DEDENT ) ;

TestStep           = CallStep
                   | TriggerStep
                   | ExpectStep
                   | ExpectAfterStep
                   | ExpectClientStep
                   | MustFailStep
                   | AsContextStep
                   | ThenStep ;

CallStep           = 'call' <dotted_name> '(' [ ArgList ] ')'
                     [ 'as' <identifier> ] ;
TriggerStep        = 'trigger' <identifier> '(' [ ArgList ] ')' ;
ThenStep           = 'then' <dotted_name> '(' [ ArgList ] ')' ;
ExpectStep         = 'expect:' INDENT { <prose> } DEDENT ;
ExpectAfterStep    = 'expect' 'after' <duration> ':' INDENT { <prose> } DEDENT ;
ExpectClientStep   = 'expect' 'client' <identifier> 'receives:'
                     INDENT { <prose> } DEDENT ;
MustFailStep       = 'must' 'fail:' INDENT { <prose> } DEDENT ;
AsContextStep      = 'as' <identifier> 'in' <identifier> ':'
                     INDENT { TestStep } DEDENT ;
```

---

## 18. Type References

```ebnf
TypeRef            = BaseType [ '?' ] [ '[]' ] { '|' BaseType [ '?' ] [ '[]' ] } ;

BaseType           = PrimitiveType
                   | <type_name>
                   | 'result' '<' TypeRef '>'
                   | 'map' '<' TypeRef ',' TypeRef '>'
                   | '->' <type_name> [ Cardinality ]
                   | '{' FieldList '}'
                   | 'error' ;

PrimitiveType      = 'string' | 'int' | 'float' | 'decimal' | 'number'
                   | 'bool' | 'date' | 'datetime' | 'bytes' | 'any' | 'void' ;

Cardinality        = '[' <int_literal> ']'
                   | '[' <int_literal> '..' ( <int_literal> | 'n' ) ']' ;

FieldList          = FieldDecl { ',' FieldDecl } ;
```

---

## 19. Composition

```ebnf
UseDecl            = 'use' <string_literal> 'as' <identifier> [ ExposingClause ] ;
ExposingClause     = 'exposing' ExposedName { ',' ExposedName } ;
ExposedName        = <TYPE_NAME> | <identifier> ;
ExtendDecl         = 'extend' <identifier> INDENT <prose> DEDENT ;
RefineDecl         = 'refine' <identifier> INDENT <prose> DEDENT ;
PassDecl           = 'pass' 'to' <dotted_name> '(' [ ArgList ] ')' ;
```

Type references in §5 (traits), §6 (models), and anywhere a `BaseType` is
permitted also accept a qualified form `<identifier> '.' <TYPE_NAME>`,
resolved via the `use … as` alias declared in the importing file. The
`SpreadField` production (`'...' <TYPE_NAME>`) is extended to
`'...' [ <identifier> '.' ] <TYPE_NAME>` for cross-file spread.

---

## 20. Common Productions

```ebnf
Literal            = <string_literal> | <int_literal> | <float_literal>
                   | 'true' | 'false' | 'null' | 'unlimited' | 'now' ;

ArgList            = Arg { ',' Arg } ;
Arg                = [ <identifier> ':' ] ( Literal | <identifier>
                   | InlineObject | InlineList ) ;

InlineObject       = '{' [ InlineField { ',' InlineField } ] '}' ;
InlineField        = <identifier> ':' ( Literal | <identifier>
                   | InlineObject | InlineList ) ;
InlineList         = '[' [ ( Literal | <identifier> | InlineObject )
                     { ',' ( Literal | <identifier> | InlineObject ) } ] ']' ;

<dotted_name>      = <identifier> { '.' <identifier> } ;
<path>             = '/' { <path_segment> } ;
<path_segment>     = <identifier> | ':' <identifier> ;
```

---

## Notes

**Semi-structured by design.** Many productions include `<prose>` — freeform natural language text within an indented block. This is intentional. GIST is not a fully formal language; the grammar captures the structural skeleton while prose carries behavioral intent.

**Prose-level keywords.** Several keywords appear within prose blocks rather than as top-level declarations. These are recognized patterns the LLM interprets but are not formally parsed:

| Keyword | Context | Meaning |
|---------|---------|---------|
| `if` / `else if` / `else` | `do:`, `code:` | Conditionals |
| `for each` | `do:`, `code:` | Iteration |
| `continue` | `for each` blocks | Skip current item |
| `try` / `or` | `do:` | Error handling |
| `match` / `_` | `do:`, `code:` | Pattern matching |
| `after <dur>:` | `do:` | Time delay |
| `->` (pipe) | `do:` | Chain operations |
| `broadcast` | `socket:` intents | WebSocket message distribution |
| `via` | `do:` | Validate transition against a state machine |
| `transition` | `do:` | Trigger a state machine transition |

**`code:` blocks** contain Python-like pseudocode. A more formal grammar for `code:` internals could be defined but is deliberately left open — the LLM interprets it as structured pseudocode, not as a formally parsed sub-language.

**Whitespace sensitivity.** Like Python and YAML, GIST uses indentation to define scope. The INDENT/DEDENT tokens represent changes in indentation level (2 spaces per level).

**Ordering within intents.** The grammar allows metadata, behavior, and constraint blocks in any order within an intent. The interpretation contract (§14 of the spec) defines the semantic priority regardless of declaration order.

**Kit extensions.** Kits add domain-specific productions beyond the core grammar. The `KitConstruct` production is intentionally permissive — it recognizes that kit keywords introduce structured blocks, but defers specific validation to the kit's `KIT.md`. Each kit documents its own grammar productions for formal rigor. For IDE tooling, each kit's `kit.yaml` provides a machine-readable `constructs:` section with field types, allowed values, and snippet templates (see §12.7 and §16 of the spec).
