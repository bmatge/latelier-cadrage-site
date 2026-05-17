// Extraction de texte plat depuis un fichier uploadé (PDF / DOCX / CSV / TXT /
// Markdown). On reste minimal volontairement : pas d'OCR pour les PDF scannés,
// pas de parsing CSV structuré (le modèle sait lire un CSV brut). Tout ce qui
// n'est pas reconnu est traité comme texte UTF-8.

// pdf-parse est CJS et son export ESM ne propose pas de `default`. On passe
// par `createRequire` (officiel Node ESM) pour récupérer la fonction comme
// avec un `require('pdf-parse')` classique — sans déclencher le side-effect
// de son `index.js` (`if (require.main === module)`) qui tente de lire un
// fichier de test si le module est exécuté directement.
import { createRequire } from 'node:module';
import mammoth from 'mammoth';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse') as (buffer: Buffer) => Promise<{ text: string }>;

export type DocumentFormat = 'pdf' | 'docx' | 'csv' | 'text';

export interface ExtractedDocument {
  readonly text: string;
  readonly format: DocumentFormat;
  readonly charCount: number;
  readonly truncated: boolean;
}

// Limite anti-runaway côté prompt (≈ 60k tokens à 4 chars/token). Au-delà on
// tronque et on signale au caller via `truncated: true`. Ajustable plus tard.
const MAX_CHARS = 240_000;

export async function extractDocument(
  buffer: Buffer,
  mimetype: string,
  filename: string,
): Promise<ExtractedDocument> {
  const format = detectFormat(mimetype, filename);
  const raw = await extractRaw(buffer, format);
  const normalized = raw.replace(/\r\n/g, '\n').trim();
  const truncated = normalized.length > MAX_CHARS;
  const text = truncated ? normalized.slice(0, MAX_CHARS) : normalized;
  return { text, format, charCount: text.length, truncated };
}

function detectFormat(mimetype: string, filename: string): DocumentFormat {
  const name = filename.toLowerCase();
  if (mimetype === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if (
    mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    name.endsWith('.docx')
  ) {
    return 'docx';
  }
  if (mimetype === 'text/csv' || name.endsWith('.csv') || name.endsWith('.tsv')) return 'csv';
  return 'text';
}

async function extractRaw(buffer: Buffer, format: DocumentFormat): Promise<string> {
  if (format === 'pdf') {
    const result = await pdfParse(buffer);
    return result.text;
  }
  if (format === 'docx') {
    const { value } = await mammoth.extractRawText({ buffer });
    return value;
  }
  return buffer.toString('utf-8');
}
