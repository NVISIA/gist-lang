import type { TextSpan } from './source-location.js';

export enum DiagnosticSeverity {
  Error = 'error',
  Warning = 'warning',
  Info = 'info',
}

export interface Diagnostic {
  severity: DiagnosticSeverity;
  message: string;
  span: TextSpan;
}
