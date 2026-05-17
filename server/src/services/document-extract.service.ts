// Extraction de texte plat depuis un fichier uploadé (PDF / DOCX / CSV / TXT /
// Markdown). On reste minimal volontairement : pas d'OCR pour les PDF scannés,
// pas de parsing CSV structuré (le modèle sait lire un CSV brut). Tout ce qui
// n'est pas reconnu est traité comme texte UTF-8.

// pdf-parse v2 expose une classe `PDFParse` (et plus une fonction directe
// comme v1.x). On passe par `createRequire` car son export ESM ne propose
// pas de `default`.
import { createRequire } from 'node:module';
import mammoth from 'mammoth';

interface PdfParseTextResult {
  readonly text: string;
}
interface PdfParseInstance {
  getText(): Promise<PdfParseTextResult>;
  destroy(): Promise<void>;
}
interface PdfParseModule {
  PDFParse: new (opts: { data: Uint8Array }) => PdfParseInstance;
}

const require = createRequire(import.meta.url);
const pdfParseModule = require('pdf-parse') as PdfParseModule;

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
    // PDFParse veut un Uint8Array (Buffer en hérite mais le contrat explicite
    // évite les surprises avec les versions futures de pdf-parse).
    const parser = new pdfParseModule.PDFParse({
      data: new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength),
    });
    try {
      const result = await parser.getText();
      return result.text;
    } finally {
      await parser.destroy();
    }
  }
  if (format === 'docx') {
    const { value } = await mammoth.extractRawText({ buffer });
    return value;
  }
  return buffer.toString('utf-8');
}
