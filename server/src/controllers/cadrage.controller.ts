// POST /api/cadrage/generate — ingère 1 à N fichiers (PDF/DOCX/CSV/TXT) +
// instructions optionnelles, proxy vers Albert, renvoie un bundle JSON
// candidat + diagnostic. POST /api/cadrage/refine — prend un bundle déjà
// généré + une instruction d'affinage, demande à Albert de le modifier.
// Aucune écriture DB ici.

import type { Request, Response, NextFunction } from 'express';
import { asyncH } from '../middleware/async-handler.js';
import { AppError, ValidationError } from '../domain/errors.js';
import { createAlbertFromEnv } from '../services/albert.service.js';
import {
  generateBundleFromDocuments,
  refineBundle,
  type GenerateInput,
} from '../services/cadrage.service.js';

function pickInstructions(body: unknown): string | null {
  const raw = (body as { instructions?: unknown } | undefined)?.instructions;
  if (typeof raw === 'string' && raw.trim().length > 0) return raw.trim();
  return null;
}

function mapAlbertError(e: unknown): never {
  const message = e instanceof Error ? e.message : String(e);
  if (message.startsWith('albert_http_')) {
    throw new AppError(502, 'albert_unavailable', message);
  }
  throw e;
}

export const generateCadrage = asyncH(
  async (req: Request, res: Response, _next: NextFunction): Promise<unknown> => {
    const cfg = createAlbertFromEnv();
    if (!cfg) throw new AppError(500, 'albert_not_configured');

    // multer.array → `req.files` est un tableau de `Express.Multer.File`.
    const files = (req.files ?? []) as Express.Multer.File[];
    if (files.length === 0) throw new ValidationError('file_required');

    const trimmed = pickInstructions(req.body);
    const inputs: readonly GenerateInput[] = files.map((f) => ({
      buffer: f.buffer,
      mimetype: f.mimetype,
      filename: f.originalname,
    }));

    try {
      const result = await generateBundleFromDocuments(cfg, inputs, trimmed ?? undefined);
      return res.json(result);
    } catch (e) {
      mapAlbertError(e);
    }
  },
);

export const refineCadrage = asyncH(
  async (req: Request, res: Response, _next: NextFunction): Promise<unknown> => {
    // Validation du body avant le check Albert : un payload malformé doit
    // remonter 400, pas 500 (le caller n'y peut rien si Albert est offline,
    // mais il peut corriger un body cassé tout de suite).
    const body = req.body as { bundle?: unknown; instructions?: unknown } | undefined;
    if (!body || typeof body !== 'object') throw new ValidationError('bundle_required');
    const bundle = body.bundle;
    if (!bundle || typeof bundle !== 'object' || Array.isArray(bundle)) {
      throw new ValidationError('bundle_required');
    }
    const instructions = pickInstructions(body);
    if (!instructions) throw new ValidationError('data_required', 'Instructions vides');

    const cfg = createAlbertFromEnv();
    if (!cfg) throw new AppError(500, 'albert_not_configured');

    try {
      const result = await refineBundle(cfg, { bundle, instructions });
      return res.json(result);
    } catch (e) {
      mapAlbertError(e);
    }
  },
);
