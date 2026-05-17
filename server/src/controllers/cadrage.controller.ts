// POST /api/cadrage/generate — POC : ingère un fichier (PDF/DOCX/CSV/TXT) +
// instructions optionnelles, proxy vers Albert, renvoie un bundle JSON candidat
// + son diagnostic de validation. Ne touche pas à la DB.

import type { Request, Response, NextFunction } from 'express';
import { asyncH } from '../middleware/async-handler.js';
import { AppError, ValidationError } from '../domain/errors.js';
import { createAlbertFromEnv } from '../services/albert.service.js';
import { generateBundleFromDocument, type GenerateInput } from '../services/cadrage.service.js';

export const generateCadrage = asyncH(
  async (req: Request, _res: Response, _next: NextFunction): Promise<unknown> => {
    const cfg = createAlbertFromEnv();
    if (!cfg) throw new AppError(500, 'albert_not_configured');

    // `req.file` est typé via @types/multer (module augmentation Express.Multer.File).
    const file = req.file;
    if (!file) throw new ValidationError('file_required');

    const rawInstructions = (req.body as { instructions?: unknown } | undefined)?.instructions;
    const trimmed =
      typeof rawInstructions === 'string' && rawInstructions.trim().length > 0
        ? rawInstructions
        : null;

    // `exactOptionalPropertyTypes` exige qu'on N'ait pas la clé du tout si
    // pas de valeur (vs `undefined` explicite), d'où ce build conditionnel.
    const input: GenerateInput = trimmed
      ? {
          buffer: file.buffer,
          mimetype: file.mimetype,
          filename: file.originalname,
          instructions: trimmed,
        }
      : {
          buffer: file.buffer,
          mimetype: file.mimetype,
          filename: file.originalname,
        };

    try {
      const result = await generateBundleFromDocument(cfg, input);
      return _res.json(result);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (message.startsWith('albert_http_')) {
        throw new AppError(502, 'albert_unavailable', message);
      }
      throw e;
    }
  },
);
