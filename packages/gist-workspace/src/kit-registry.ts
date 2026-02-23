import type { LoadedKit, KitConstruct, KitYamlSection } from './types.js';

/**
 * Unified registry of all loaded kit keywords and constructs.
 * Merges multiple kits into a single lookup interface.
 */
export class KitRegistry {
  /** keyword → source kit name */
  private keywordToKit = new Map<string, string>();
  /** keyword → construct definition */
  private constructMap = new Map<string, KitConstruct>();
  /** yaml section name → section definition + source kit */
  private yamlSectionMap = new Map<string, { section: KitYamlSection; kit: string }>();
  /** All loaded kits by name */
  private kits = new Map<string, LoadedKit>();

  /**
   * Register a loaded kit into the registry.
   * Later kits override earlier ones for conflicting keywords.
   */
  addKit(kit: LoadedKit): void {
    this.kits.set(kit.name, kit);

    for (const keyword of kit.keywords) {
      this.keywordToKit.set(keyword, kit.name);
    }

    for (const [keyword, construct] of kit.constructs) {
      this.constructMap.set(keyword, construct);
      // Also register as keyword if not already in keywords list
      if (!this.keywordToKit.has(keyword)) {
        this.keywordToKit.set(keyword, kit.name);
      }
    }

    for (const [sectionName, section] of Object.entries(kit.yamlSections)) {
      this.yamlSectionMap.set(sectionName, { section, kit: kit.name });
    }
  }

  /** Check if a word is a registered kit keyword. */
  isKitKeyword(word: string): boolean {
    return this.keywordToKit.has(word);
  }

  /** Get the construct definition for a keyword. */
  getConstruct(keyword: string): KitConstruct | undefined {
    return this.constructMap.get(keyword);
  }

  /** Get the source kit name for a keyword. */
  getKitForKeyword(keyword: string): string | undefined {
    return this.keywordToKit.get(keyword);
  }

  /** Get all registered kit keywords as a Set (for passing to the lexer). */
  getAllKeywords(): ReadonlySet<string> {
    return new Set(this.keywordToKit.keys());
  }

  /** Get a loaded kit by name. */
  getKit(name: string): LoadedKit | undefined {
    return this.kits.get(name);
  }

  /** Get all loaded kit names. */
  getLoadedKitNames(): string[] {
    return [...this.kits.keys()];
  }

  /** Get a YAML section definition by name. */
  getYamlSection(name: string): { section: KitYamlSection; kit: string } | undefined {
    return this.yamlSectionMap.get(name);
  }

  /** Get all YAML section names. */
  getYamlSectionNames(): string[] {
    return [...this.yamlSectionMap.keys()];
  }

  /** Clear all registered kits and keywords. */
  clear(): void {
    this.keywordToKit.clear();
    this.constructMap.clear();
    this.yamlSectionMap.clear();
    this.kits.clear();
  }
}
