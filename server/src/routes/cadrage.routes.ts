// Routeur du POC cadrage IA. Monté conditionnellement dans `app.ts` derrière
// `CADRAGE_ENABLED=1` (cf. createApp). Permission : `project:import` global —
// même droit que pour importer un bundle, puisque le résultat finit par y être
// importé.

import { Router } from 'express';
import multer from 'multer';
import express from 'express';
import { authorize } from '../middleware/authorize.js';
import { generateCadrage, refineCadrage } from '../controllers/cadrage.controller.js';
import { AppError } from '../domain/errors.js';
import { createAlbertFromEnv } from '../services/albert.service.js';

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_FILES = 5;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: MAX_FILES },
});

export function makeCadrageRouter(): Router {
  const router = Router();

  // Endpoint léger pour que la SPA sache si afficher le bouton « Créer avec
  // IA » sur la HomePage. Réponse 200 = router mounté ; absence de la route
  // (404) = flag CADRAGE_ENABLED off. `configured` distingue « activé mais
  // pas de clé Albert » (UI peut afficher un avertissement admin).
  router.get('/cadrage/status', (_req, res) => {
    const cfg = createAlbertFromEnv();
    res.json({
      enabled: true,
      configured: cfg !== null,
      model: cfg?.model ?? null,
      maxFiles: MAX_FILES,
      maxFileMiB: MAX_FILE_BYTES / 1024 / 1024,
    });
  });

  router.post(
    '/cadrage/generate',
    authorize('project:import', 'global'),
    (req, res, next) => {
      upload.array('files', MAX_FILES)(req, res, (err: unknown) => {
        if (err) {
          if (err instanceof multer.MulterError) {
            if (err.code === 'LIMIT_FILE_SIZE') {
              next(
                new AppError(
                  413,
                  'file_too_large',
                  `Fichier > ${MAX_FILE_BYTES / 1024 / 1024} MiB`,
                ),
              );
              return;
            }
            if (err.code === 'LIMIT_FILE_COUNT') {
              next(new AppError(413, 'file_too_large', `Plus de ${MAX_FILES} fichiers`));
              return;
            }
          }
          next(err);
          return;
        }
        next();
      });
    },
    generateCadrage,
  );

  // Affinage post-génération : le client renvoie le bundle déjà produit + une
  // instruction libre. Le serveur compose un nouveau prompt qui demande à
  // Albert de modifier ce bundle selon l'instruction, en gardant le reste
  // intact. Stateless côté serveur : pas de session, le contexte vit dans
  // les payloads HTTP.
  router.post(
    '/cadrage/refine',
    authorize('project:import', 'global'),
    express.json({ limit: '5mb' }),
    refineCadrage,
  );
  return router;
}
