# POC cadrage IA via Albert (DINUM)

> Statut : **expérimental**, désactivé en prod par défaut (flag `CADRAGE_ENABLED=0`).
> But : valider qu'Albert (gpt-oss-120b) tient la sortie JSON requise pour le
> bundle d'import projet, à partir d'un document source (PDF / DOCX / CSV / TXT).

## Pourquoi Albert ?

- API souveraine portée par la DINUM/Etalab — cohérent avec un outil interne
  pour l'admin française.
- OpenAI-compatible → proxy minimal, pas de SDK propriétaire.
- Gratuit pour les agents publics (sous quota), pas de frais opérationnels à
  prévoir pour la phase POC.

Alternative gardée disponible : le workflow [`docs/prompt-cadrage.md`](../prompt-cadrage.md)
(copier-coller dans Claude.ai) — toujours valide si Albert tombe en panne ou
si on veut un modèle plus capable pour un cadrage complexe.

## Config

Dans le `.env` du serveur :

```sh
CADRAGE_ENABLED=1
ALBERT_API_URL=https://albert.api.etalab.gouv.fr
ALBERT_API_KEY=sk-...                # demandée via la console Albert
ALBERT_MODEL=gpt-oss-120b            # ou autre modèle proposé par Albert
ALBERT_TEMPERATURE=0.3
```

Sans `ALBERT_API_KEY` ou `ALBERT_API_URL`, la route répond `500 albert_not_configured`.

## Endpoint

```
POST /api/cadrage/generate
Content-Type: multipart/form-data
Auth : cookie de session (rôle editor ou admin, permission project:import)
```

Champs :

| Nom            | Type    | Obligatoire | Description                                                           |
| -------------- | ------- | ----------- | --------------------------------------------------------------------- |
| `file`         | fichier | oui         | PDF, DOCX, CSV, TSV, TXT ou Markdown. Limite 10 MiB.                  |
| `instructions` | string  | non         | Consignes complémentaires libres (audience cible, contraintes, etc.). |

## Réponse

`200 OK` :

```json
{
  "bundle": { "version": 1, "project": {...}, ... },  // ou null si non parsable
  "valid": true,                                       // true = ajv passe
  "errors": [
    { "path": "/data/objectifs", "message": "must have required property 'axes'" }
  ],
  "raw": "<texte brut renvoyé par Albert>",
  "extracted": {
    "text": "<premiers ~240k caractères du doc source>",
    "format": "pdf",
    "charCount": 18432,
    "truncated": false
  },
  "finishReason": "stop",
  "usage": { "prompt_tokens": ..., "completion_tokens": ..., "total_tokens": ... },
  "latencyMs": 4321
}
```

Codes d'erreur :

| Status | Code                      | Cas                                                 |
| ------ | ------------------------- | --------------------------------------------------- |
| 400    | `file_required`           | Aucun fichier `file` dans le multipart              |
| 401    | `identification_required` | Pas de session                                      |
| 403    | `forbidden`               | Pas la permission `project:import`                  |
| 413    | `file_too_large`          | Fichier > 10 MiB                                    |
| 500    | `albert_not_configured`   | `ALBERT_API_URL` ou `ALBERT_API_KEY` absent         |
| 502    | `albert_unavailable`      | Albert renvoie une erreur HTTP (5xx, timeout, etc.) |

## Exemple curl

```sh
# 1. Récupérer un cookie de session via magic link (dev/local)
SESSION=$(curl -s -c - -X POST http://localhost:3000/api/auth/magic-link \
  -H 'Content-Type: application/json' \
  -d '{"email":"bertrand@matge.com"}')
# (en local avec mailer=console, le token apparaît dans la sortie stdout du serveur,
#  puis : curl -c cookies.txt "http://localhost:3000/api/auth/callback?token=...")

# 2. Lancer la génération
curl -X POST http://localhost:3000/api/cadrage/generate \
  -b cookies.txt \
  -F 'file=@./mon-document.pdf' \
  -F 'instructions=Cible : agents des collectivités. Public principal : maires.' \
  | jq '{valid, errors, latencyMs, project: .bundle.project}'
```

## Workflow attendu (côté UI, future itération)

1. Page « Nouveau projet via IA » dans le picker.
2. Drag-drop d'un document → POST /cadrage/generate.
3. Affichage : aperçu du bundle proposé + liste des erreurs ajv si `valid: false`.
4. Bouton « Importer ce projet » → POST /projects/import avec `bundle` tel quel.
5. Optionnel : édition inline du JSON avant import.

## À valider avec le POC

- [ ] Albert produit-il un JSON `version: 1` parsable en 1ère tentative ?
- [ ] Le bundle valide-t-il ajv contre `docs/bundle-schema.json` ?
- [ ] Latence acceptable (< 30 s pour un doc de 5 pages) ?
- [ ] Quotas Albert tenables pour usage interne (10-20 générations/jour) ?
- [ ] Robustesse sur PDF non texte (scannés OCR) — probablement non, à constater.

Si ces critères passent, on enchaîne avec la page UI. Sinon, on garde le
workflow copier-coller `docs/prompt-cadrage.md` et on documente les limites
d'Albert pour ce cas d'usage.

## Désactiver

Repasser `CADRAGE_ENABLED=0` (ou supprimer la ligne) dans `.env` et redémarrer.
La route disparaît, le code Albert ne s'exécute jamais.
