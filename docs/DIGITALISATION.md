# Procédure de digitalisation d'un ouvrage

Ce document décrit **comment ajouter un nouveau livre au corpus RAG**, de bout en bout.

Il existe parce que le procédé appliqué au premier ouvrage (Matthieu 1876) n'avait
jamais été versionné : le fichier texte source est arrivé de l'extérieur du dépôt,
et la manière dont il avait été produit était introuvable. Tout ajout d'ouvrage
doit désormais laisser une trace ici.

---

## 1. Le contrat de sortie

Tout le pipeline repose sur un **fichier texte brut normalisé**. Quelle que soit
la façon dont il a été obtenu (couche texte du PDF, OCR local, OCR distant), il
doit respecter exactement ce format — c'est ce que `01_clean_and_chunk.ts` sait lire :

```
— 24 —

CHAPITRE III. LENTHOUT-HERISSEM, BERCEAU DE LA VILLE D'ENGHIEN

Celui qui veut découvrir où et quand est né Enghien ne doit pas se ruer sur la
Grand-Place […]

§ 1. — LA REALITE DE L'EXISTENCE DE CE HAMEAU

a) Un nom
Dans cette région très fertile […]
```

| Marqueur | Règle |
|---|---|
| `— 24 —` | Folio **imprimé**, seul sur sa ligne. Jamais l'index de page PDF. |
| `LIVRE I` | Partie de premier niveau, en chiffres romains. |
| `CHAPITRE III` | Chapitre, en chiffres romains. |
| `§ 1. — TITRE` | Section. |
| Ligne vide double | Séparateur de paragraphes. |

Encodage UTF-8, un seul fichier par tome, déposé dans `scripts/data/`.

> **Pourquoi le folio imprimé et pas la page PDF ?** Parce que les citations
> affichées au visiteur doivent renvoyer au livre physique. Sur Reygaerts T1,
> l'écart entre index PDF et folio imprimé va de +6 à +84 selon l'endroit, à
> cause des planches insérées : un décalage constant est donc faux.

---

## 2. Étape 0 — Diagnostic du PDF

**À faire systématiquement en premier, avant d'envisager le moindre OCR payant.**

```bash
py -3 -c "import fitz; d=fitz.open('mon.pdf'); print(d.page_count, d.metadata); print(sum(len(p.get_text()) for p in d))"
```

Trois cas :

### a) Couche texte présente et propre → aucun OCR

C'est le cas de la *Géographie historique* de Reygaerts (producteur :
`ABBYY FineReader 15`, ~2 300 caractères par page). L'extraction directe suffit.
**Vérifier le champ `producer` des métadonnées** : un nom d'OCR professionnel
(ABBYY, Tesseract, Acrobat) signale une reconnaissance déjà faite.

Seuils indicatifs d'une couche exploitable : plus de 1 000 caractères par page en
moyenne, moins de 10 % de pages quasi vides.

### b) Pas de couche texte → OCR via OpenRouter

Le projet passe déjà par OpenRouter pour les embeddings et le LLM ; l'OCR emprunte
la même clé `OPENROUTER_API_KEY`. Deux moteurs via le plugin `file-parser` :

```ts
plugins: [{ id: 'file-parser', pdf: { engine: 'mistral-ocr' } }]
```

| Moteur | Usage | Coût |
|---|---|---|
| `cloudflare-ai` | PDF → markdown | gratuit — **à tester en premier** |
| `mistral-ocr` | documents scannés, PDF avec images | facturé au millier de pages |
| `native` | modèles à entrée fichier native | facturé en tokens d'entrée |

La réponse contient des **file annotations** (`{ type: 'file', file: { hash, content } }`)
à conserver et à renvoyer dans les requêtes suivantes : elles évitent de repayer
le parsing du même PDF.

Toujours procéder sur **un échantillon de 10 pages** et comparer les sorties avant
de lancer un ouvrage entier.

### c) OCR en échec sur typographie ancienne → modèle vision

Repli pour les impressions du XIXᵉ que les OCR génériques massacrent. Rendre les
pages en images avec PyMuPDF, puis les soumettre à un modèle vision bon marché
(`google/gemini-3.7-flash` et consorts). Avantage décisif : le format de sortie
est imposé dans le prompt (marqueurs de page, structure), plutôt que post-traité.

---

## 3. Étape 1 — Extraction (`00_extract_pdf.py`)

```bash
py -3 scripts/00_extract_pdf.py <ouvrage_id>
```

Déclarer d'abord l'ouvrage dans le dictionnaire `OUVRAGES` en tête du script :

```python
"reygaerts-1998-t1": {
    "pdf": "Géographie Historique d'Enghien T1 reconnu.pdf",
    "body_size": 12,          # taille de police du corps, en points
    "min_body_chars": 200,    # en deçà : page considérée comme une planche
    "skip_pages": [1, 2, 3, 4, 5, 6],
    "stop_at_toc": True,
    "livres": {"PREMIER": ("I", "Géographie historique des temps anciens"), ...},
    "heading_corrections": {"Xin. DE HAINAUT": "XIII. DE HAINAUT", ...},
}
```

Le script s'appuie sur **la typographie**, seul signal fiable :

- **folio** — police plus petite que le corps, dans les 8 % supérieurs de la page ;
- **titre** — gras **et** majuscules à plus de 90 % ;
- **note de bas de page** — police ≤ 8 pt, ou basse de page et commençant par un
  numéro d'appel ;
- **planche** — page dont le corps fait moins de `min_body_chars` caractères.

Sorties dans `scripts/data/` : `<id>_fulltext.txt`, `<id>_notes.json` (les notes,
isolées pour ne pas hacher les phrases), `<id>_structure.json` (à vérifier).

### Les cinq pièges, tous rencontrés sur Reygaerts T1

1. **L'ordre des blocs PDF n'est pas l'ordre de lecture.** PyMuPDF restitue
   souvent les notes de bas de page *avant* la suite du corps. Sans tri par
   coordonnée verticale, les notes s'insèrent au milieu des phrases. → `read_lines()`
   trie sur `(y, x)`.
2. **Le gras ne suffit pas à repérer un titre.** Reygaerts met aussi des
   paragraphes entiers en gras pour l'emphase. → exiger gras **et** majuscules.
3. **Un chiffre romain mal océrisé fait perdre un chapitre entier.** « Xin. » pour
   « XIII. » a coûté 16 pages d'indexation. → `heading_corrections`, ciblé sur les
   seuls titres. Toujours recompter les chapitres obtenus contre la table des matières.
4. **Les corrections OCR ne sont pas transposables d'un ouvrage à l'autre.** La règle
   « `k` isolé → `à` », utile sur une fonte de 1876, corromprait un texte de 1998.
   → elles vivent dans `scripts/ouvrages.ts`, par ouvrage, jamais en global.
5. **La table des matières finale duplique la structure** et pollue la recherche.
   → `stop_at_toc`.

**Contrôle obligatoire avant de continuer :** ouvrir `<id>_structure.json` et
vérifier que le nombre de livres et de chapitres correspond à la table des
matières de l'ouvrage.

---

## 4. Étape 2 — Déclaration dans le registre

Ajouter l'ouvrage dans `scripts/ouvrages.ts` (identité bibliographique, titres des
livres, corrections OCR propres) **et** dans `scripts/04_add_ouvrage.sql` (catalogue
`enghien_ouvrages`, avec `publie = FALSE` et la mention des droits).

Le champ `titre_court` est ce que le visiteur lira dans chaque citation :
`Reygaerts 1998, t. I`. Le garder bref et sans ambiguïté.

---

## 5. Étape 3 — Découpage

```bash
npx tsx scripts/01_clean_and_chunk.ts <ouvrage_id>
```

Produit `scripts/data/chunks_<ouvrage_id>.json`. Cibles : 1 500–2 500 caractères par
chunk, 300 de recouvrement, coupure préférentielle sur paragraphe, remise à zéro du
recouvrement au changement de livre.

**Vérifier qu'aucun chunk n'a `page_debut: 0`.** Le folio est suivi comme un état
persistant : un chunk plus court qu'une page ne contient aucun marqueur et serait
sinon cité sans page.

---

## 6. Étape 4 — Migration puis ingestion

```bash
psql "$DATABASE_URL" -f scripts/04_add_ouvrage.sql   # additif et idempotent
npx tsx scripts/03_ingest.ts <ouvrage_id>
```

L'ingestion :

- **ne purge que l'ouvrage concerné** (`DELETE ... WHERE metadata->>'ouvrage' = $1`).
  L'ancien `TRUNCATE` global vidait toute la table : réingérer un livre effaçait
  tous les autres et laissait le site sans source ;
- **refuse un fichier de chunks contenant un autre ouvrage** que celui demandé ;
- **reprend le statut `publie` du catalogue**, jamais du fichier : un ouvrage déjà
  en ligne le reste, un nouvel ouvrage reste masqué ;
- affiche en fin de course l'état de **tous** les ouvrages, pour confirmer d'un
  coup d'œil qu'aucun autre n'a bougé.

Coût : embeddings `openai/text-embedding-3-small` via OpenRouter, ~830 chunks pour
un tome de 550 pages.

---

## 7. Étape 5 — Validation puis publication

L'ouvrage est en base mais invisible : `searchDocuments()` filtre sur
`metadata->>'publie' = 'true'`, et `/api/enghien/ouvrages` ne liste que les
ouvrages publiés.

Valider sur le déploiement de développement, puis publier :

```sql
BEGIN;
UPDATE enghien_ouvrages   SET publie = TRUE WHERE id = '<ouvrage_id>';
UPDATE enghien_documents  SET metadata = metadata || '{"publie": true}'::jsonb
  WHERE metadata->>'ouvrage' = '<ouvrage_id>';
COMMIT;
```

La dépublication est la même requête avec `false` : c'est le moyen de retirer un
ouvrage en urgence sans rien supprimer.

---

## 8. Discipline de branches

| Branche | Rôle |
|---|---|
| `master` | **Production.** Un push y déclenche le workflow GitHub Actions, qui reconstruit l'image Docker `latest` servie aux visiteurs. |
| `develop` | Travail d'intégration d'un nouvel ouvrage. Aucun déclenchement CI. |

Tout ajout d'ouvrage se fait sur `develop`, se valide, puis se fusionne dans
`master` par pull request.

⚠️ **La branche ne protège que le code, pas les données.** La base est partagée :
une ingestion lancée depuis `develop` écrit dans la table que lit la production.
C'est le drapeau `publie` qui protège le visiteur, pas la branche.

---

## 9. Droits d'auteur

Le corpus mêle des œuvres du domaine public et des œuvres sous droits exploitées
avec autorisation. Le champ `droits` de `enghien_ouvrages` doit être renseigné
pour chaque ouvrage.

- Matthieu 1876 — domaine public.
- Reygaerts 1998 — sous droits, reproduction autorisée par l'ayant droit.

Les fichiers texte et les PDF sources ne sont **jamais** versionnés
(`scripts/data/*.txt` et `chunks*.json` sont dans `.gitignore`). Le dépôt étant
public, un ouvrage sous droits n'y apparaît que sous forme de métadonnées.
