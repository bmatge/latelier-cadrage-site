// Client front du POC cadrage IA (cf. server/src/routes/cadrage.routes.ts).
// La route /api/cadrage/* n'est mountée que si CADRAGE_ENABLED=1 côté serveur.
// `getCadrageStatus` permet à la SPA de tester silencieusement la dispo et
// d'afficher/masquer le bouton « Créer avec IA » sur la HomePage.

import { api } from './client.js';

export interface CadrageStatus {
  readonly enabled: boolean;
  readonly configured: boolean;
  readonly model: string | null;
}

export async function getCadrageStatus(): Promise<CadrageStatus> {
  try {
    const res = await api.get('/cadrage/status');
    return res.data as CadrageStatus;
  } catch {
    return { enabled: false, configured: false, model: null };
  }
}

export interface AjvError {
  readonly path: string;
  readonly message: string;
}

export interface ExtractedDocument {
  readonly text: string;
  readonly format: 'pdf' | 'docx' | 'csv' | 'text';
  readonly charCount: number;
  readonly truncated: boolean;
}

export interface GenerateResult {
  readonly bundle: unknown;
  readonly valid: boolean;
  readonly errors: readonly AjvError[];
  readonly raw: string;
  readonly extracted: ExtractedDocument;
  readonly finishReason: string | null;
  readonly usage: unknown;
  readonly latencyMs: number;
}

export async function generateBundleFromDocument(
  file: File,
  instructions?: string,
): Promise<GenerateResult> {
  const form = new FormData();
  form.append('file', file);
  if (instructions && instructions.trim()) {
    form.append('instructions', instructions.trim());
  }
  const res = await api.post('/cadrage/generate', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data as GenerateResult;
}
