// Routeur du POC cadrage IA. Monté conditionnellement dans `app.ts` derrière
// `CADRAGE_ENABLED=1` (cf. createApp). Permission : `project:import` global —
// même droit que pour importer un bundle, puisque le résultat finit par y être
// importé.

import { Router } from 'express';
import multer from 'multer';
import { authorize } from '../middleware/authorize.js';
import { generateCadrage } from '../controllers/cadrage.controller.js';
import { AppError } from '../domain/errors.js';

const MAX_FILE_BYTES = 10 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: 1 },
});

export function makeCadrageRouter(): Router {
  const router = Router();
  router.post(
    '/cadrage/generate',
    authorize('project:import', 'global'),
    (req, res, next) => {
      upload.single('file')(req, res, (err: unknown) => {
        if (err) {
          if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
            next(
              new AppError(413, 'file_too_large', `Fichier > ${MAX_FILE_BYTES / 1024 / 1024} MiB`),
            );
            return;
          }
          next(err);
          return;
        }
        next();
      });
    },
    generateCadrage,
  );
  return router;
}
