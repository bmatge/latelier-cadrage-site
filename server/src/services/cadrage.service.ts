// Orchestre le POC « cadrage IA » : extrait le texte du document fourni,
// envoie le tout à Albert avec le prompt système figé ci-dessous, parse la
// sortie JSON et la valide contre `docs/bundle-schema.json` (ajv).
//
// Retourne TOUJOURS un objet diagnostic (bundle + valid + errors + raw) — la
// décision « importer / corriger / réessayer » est laissée au caller (UI ou
// curl). Ne touche pas à la DB.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
// Ajv 2020 — notre bundle-schema.json déclare $schema draft 2020-12, donc on
// instancie la variante correspondante (le default Ajv ne gère que draft-07).
// Ces deux libs sont CJS et leurs types ESM exposent un namespace, pas un
// constructor. On passe par `createRequire` (CJS classique) avec un typage
// minimal local pour l'API qu'on utilise effectivement.
import { createRequire } from 'node:module';
import type { ErrorObject } from 'ajv';

interface AjvValidateFn {
  (data: unknown): boolean;
  errors?: readonly ErrorObject[] | null;
}
interface AjvInstance {
  compile: (schema: unknown) => AjvValidateFn;
}
const require = createRequire(import.meta.url);
const Ajv2020 = require('ajv/dist/2020.js') as {
  default: new (opts?: { strict?: boolean; allErrors?: boolean }) => AjvInstance;
};
const addFormats = require('ajv-formats') as { default: (ajv: AjvInstance) => void };
import { chatCompletion, extractJsonObject, type AlbertConfig } from './albert.service.js';
import { extractDocument, type ExtractedDocument } from './document-extract.service.js';

const here = dirname(fileURLToPath(import.meta.url));

// Le schéma vit en `docs/bundle-schema.json` à la racine du repo. Pour le
// runtime, le Dockerfile en copie une copie à côté du bundle compilé
// (`server/dist/bundle-schema.json`). On essaie les deux paths dans l'ordre.
const SCHEMA_CANDIDATES = [
  resolve(here, '../bundle-schema.json'), // prod (Dockerfile copie ici)
  resolve(here, '../../../docs/bundle-schema.json'), // dev local (depuis le repo)
];

// Init lazy : le serveur ne doit PAS crasher au boot si le schéma est
// introuvable. Seul un appel à `/cadrage/generate` ou `/refine` retombe
// alors sur une erreur explicite. Idempotent (cache).
let cachedValidate: AjvValidateFn | null = null;
let cachedError: Error | null = null;

function getBundleValidator(): AjvValidateFn {
  if (cachedValidate) return cachedValidate;
  if (cachedError) throw cachedError;
  for (const path of SCHEMA_CANDIDATES) {
    try {
      const schema = JSON.parse(readFileSync(path, 'utf-8')) as unknown;
      const ajv = new Ajv2020.default({ strict: false, allErrors: true });
      addFormats.default(ajv);
      cachedValidate = ajv.compile(schema);
      return cachedValidate;
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') {
        cachedError = e instanceof Error ? e : new Error(String(e));
        throw cachedError;
      }
    }
  }
  cachedError = new Error(
    `bundle-schema.json introuvable (paths essayés : ${SCHEMA_CANDIDATES.join(', ')})`,
  );
  throw cachedError;
}

// Prompt système — variante courte de docs/prompt-cadrage.md, condensée pour
// la consommation API (tokens comptent). Si on modifie le format du bundle,
// mettre à jour ici en miroir de la `docs/prompt-cadrage.md` (section
// « Variante courte »).
const SYSTEM_PROMPT = `Tu cadres un projet web pour L'atelier 🪢 et produis UN SEUL objet JSON {version:1, exported_at, project, tree, roadmap, data:{dispositifs,mesures,objectifs,drupal_structure}}.

Règles :
- project.slug : 1-50 chars, regex ^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$ ; project.name max 100 ; description max 500.
- tree : { id:"root", label, type:"hub", types:["hub"], children:[...] } ; chaque enfant a { id, label } et optionnellement types[], tldr, audiences[], dispositifs[], mesures[], deadline, children[]. IDs uniques courts (p1, p1a, b2...).
- roadmap : meta.calendrier=[{id,label,echeance}], meta.actions=[{id,label,desc}], items=[{id:"rm-001",slice,action,story,status:"pending",nodes:[],dispositifs:[]}].
- dispositifs : meta.categories[], items {id:"D-XX01",category,audiences:[],name,url,description,porteur,tutelle,type,maturite}. ATTENTION : audiences est TOUJOURS un tableau de keys du vocab (jamais une string, jamais un champ singulier audience).
- mesures : meta.axes=[{id,label}], meta.objectifs={[axeId]:[{id,label}]}, items {id:"M1",axe,objectif|null,title,summary,audiences:[],deadline}.
- objectifs : axes=[{id:"A1",name,objectives:[{id:"A1.O1",name,means:[{id:"A1.O1.M1",text,nodes:[],dispositifs:[]}]}]}].
- drupal_structure : content_types[] (TABLEAU DE STRINGS, pas d'objets), paragraphs[]⊂{accordion,tabs,cards-row,tiles-row,auto-list,summary,button,highlight,callout,image-text,quote,table,video,download-block,download-links,cards-download,code}, taxonomies[{key,label,multi,options}] où options est aussi un TABLEAU DE STRINGS (labels Drupal — pas d'objets {key,label}).
- dispositifs.meta.categories[] : TABLEAU DE STRINGS (catégories d'affichage, pas d'objets).
- enums conseillés mais non bloquants : types∈{hub,editorial,service,simulator,map,external,marketplace,kit,form,private} ; deadline∈{juin,septembre,decembre,y2027} ; audiences∈{particuliers,coproprietes,collectivites,pros,industriels,agriculteurs,partenaires,agents,outremer}. Tu peux dévier si le projet le justifie (vocab projet-scoped).
- Références croisées : tree.dispositifs[*]→dispositifs[*].id ; tree.mesures[*]→mesures[*].id ; roadmap.items[*].nodes[*]→tree.id ; mesures[*].axe→meta.axes[*].id ; means[*].nodes[*]→tree.id.
- Catalogues vides acceptés : { dispositifs:{meta:{categories:[]},dispositifs:[]}, mesures:{meta:{axes:[],objectifs:{}},mesures:[]}, objectifs:{meta:{},axes:[]} }.

Sortie : UN SEUL objet JSON {…}, rien autour, pas de markdown, pas de commentaires.`;

export interface AjvValidationError {
  readonly path: string;
  readonly message: string;
}

export interface GenerateResult {
  readonly bundle: unknown;
  readonly valid: boolean;
  readonly errors: readonly AjvValidationError[];
  readonly raw: string;
  readonly extracted: readonly ExtractedDocument[];
  readonly extractedFilenames: readonly string[];
  readonly finishReason: string | null;
  readonly usage: unknown;
  readonly latencyMs: number;
}

export interface GenerateInput {
  readonly buffer: Buffer;
  readonly mimetype: string;
  readonly filename: string;
}

export async function generateBundleFromDocuments(
  cfg: AlbertConfig,
  inputs: readonly GenerateInput[],
  instructions?: string,
): Promise<GenerateResult> {
  if (inputs.length === 0) {
    throw new Error('generateBundleFromDocuments: at least one document required');
  }
  const extracted = await Promise.all(
    inputs.map((i) => extractDocument(i.buffer, i.mimetype, i.filename)),
  );
  const userMessage = buildUserMessage(extracted, inputs, instructions);
  const completion = await chatCompletion(cfg, SYSTEM_PROMPT, userMessage);
  return packResult(completion, extracted, inputs);
}

export interface RefineInput {
  readonly bundle: unknown;
  readonly instructions: string;
}

// Affinage stateless : on rappelle Albert avec le bundle déjà produit + une
// instruction libre. Le system prompt reste le même (format/contraintes),
// le user prompt contient le JSON existant + la consigne de modification.
// Le modèle doit retourner un bundle COMPLET, pas un patch — c'est plus
// robuste que de gérer des deltas côté serveur.
export async function refineBundle(cfg: AlbertConfig, input: RefineInput): Promise<GenerateResult> {
  const bundleJson = JSON.stringify(input.bundle, null, 2);
  const userMessage = [
    '# Bundle actuel\n',
    '```json\n' + bundleJson + '\n```\n',
    '# Modification demandée\n',
    input.instructions.trim() + '\n',
    "---\nRenvoie le bundle JSON COMPLET modifié (pas un patch, pas un diff). Conserve TOUT ce qui n'est pas explicitement modifié par la consigne. Un seul objet JSON, rien autour.",
  ].join('\n');
  const completion = await chatCompletion(cfg, SYSTEM_PROMPT, userMessage);
  return packResult(completion, [], []);
}

function buildUserMessage(
  extracted: readonly ExtractedDocument[],
  inputs: readonly GenerateInput[],
  instructions: string | undefined,
): string {
  const parts: string[] = [];
  if (instructions && instructions.trim()) {
    parts.push(`# Consignes additionnelles\n\n${instructions.trim()}\n`);
  }
  if (extracted.length === 1) {
    const e = extracted[0]!;
    parts.push(
      `# Document source (${e.format.toUpperCase()}, ${e.charCount} caractères${e.truncated ? ', tronqué' : ''})\n\n${e.text}`,
    );
  } else {
    parts.push(`# ${extracted.length} documents source\n`);
    extracted.forEach((e, i) => {
      const name = inputs[i]?.filename ?? `document-${i + 1}`;
      parts.push(
        `## ${i + 1}. ${name} (${e.format.toUpperCase()}, ${e.charCount} caractères${e.truncated ? ', tronqué' : ''})\n\n${e.text}\n`,
      );
    });
  }
  parts.push(
    "\n---\nProduis maintenant le bundle JSON complet du projet, en t'appuyant sur l'ensemble des documents fournis. Un seul objet JSON, rien autour.",
  );
  return parts.join('\n');
}

function packResult(
  completion: { raw: string; finishReason: string | null; usage: unknown; latencyMs: number },
  extracted: readonly ExtractedDocument[],
  inputs: readonly GenerateInput[],
): GenerateResult {
  const bundle = extractJsonObject(completion.raw);
  const validate = getBundleValidator();
  const isValid = bundle != null && validate(bundle);
  const errors: readonly AjvValidationError[] = !isValid ? mapAjvErrors(validate.errors ?? []) : [];
  return {
    bundle,
    valid: !!isValid,
    errors,
    raw: completion.raw,
    extracted,
    extractedFilenames: inputs.map((i) => i.filename),
    finishReason: completion.finishReason,
    usage: completion.usage,
    latencyMs: completion.latencyMs,
  };
}

function mapAjvErrors(errors: readonly ErrorObject[]): readonly AjvValidationError[] {
  // Cap à 50 erreurs pour éviter une réponse géante quand le bundle est très
  // loin du format (ajv allErrors:true peut produire des centaines de lignes).
  return errors.slice(0, 50).map((e) => ({
    path: e.instancePath || '/',
    message: `${e.message ?? 'invalid'}${e.params ? ` (${JSON.stringify(e.params)})` : ''}`,
  }));
}
