import type { SymbolInformation, SymbolKind as LspSymbolKind } from 'vscode-languageserver/node';
import { SymbolKind } from 'vscode-languageserver/node';
import type { SymbolTable, SymbolInfo, SymbolKind as GistSymbolKind } from '@gist-lang/workspace';

/**
 * Compute workspace symbols matching a query.
 * Used for Ctrl+T / workspace symbol search.
 */
export function computeWorkspaceSymbols(
  query: string,
  symbolsByUri: Map<string, SymbolTable>,
): SymbolInformation[] {
  const results: SymbolInformation[] = [];
  const lowerQuery = query.toLowerCase();

  for (const [uri, symbols] of symbolsByUri) {
    const allSymbols = symbols.getAllSymbols();
    for (const [name, infos] of allSymbols) {
      // Filter by query (case-insensitive substring match)
      if (lowerQuery && !name.toLowerCase().includes(lowerQuery)) continue;

      for (const info of infos) {
        results.push({
          name: info.module ? `${info.module}.${info.name}` : info.name,
          kind: gistKindToLspKind(info.kind),
          location: {
            uri,
            range: {
              start: { line: info.span.start.line, character: info.span.start.column },
              end: { line: info.span.end.line, character: info.span.end.column },
            },
          },
          containerName: info.module,
        });
      }
    }
  }

  return results;
}

function gistKindToLspKind(kind: GistSymbolKind): LspSymbolKind {
  switch (kind) {
    case 'model': return SymbolKind.Class;
    case 'enum': return SymbolKind.Enum;
    case 'type': return SymbolKind.TypeParameter;
    case 'trait': return SymbolKind.Interface;
    case 'error': return SymbolKind.Event;
    case 'constant': return SymbolKind.Constant;
    case 'state_machine': return SymbolKind.Struct;
    case 'module': return SymbolKind.Module;
    case 'intent': return SymbolKind.Method;
    case 'fn': return SymbolKind.Function;
    case 'flow': return SymbolKind.Operator;
    case 'kit_construct': return SymbolKind.Constructor;
    case 'test': return SymbolKind.Null;
    case 'service': return SymbolKind.Object;
    default: return SymbolKind.Variable;
  }
}
