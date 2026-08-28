# Procédure de digitalisation d'un ouvrage

Ce document décrit **comment ajouter un nouveau livre au corpus RAG**, de bout en bout.

Il existe parce que le procédé appliqué au premier ouvrage (Matthieu 1876) n'avait
jamais été versionné : le fichier texte source est arrivé de l'extérieur du dépôt,
et la manière dont il avait été produit était introuvable. Tout ajout d'ouvrage
doit désormais laisser une trace ici.

---

## 0. Checklist express — intégrer un nouveau livre

La procédure rodée sur Reygaerts t. I et t. II. Chaque étape a une **porte de
contrôle** : ne pas passer à la suivante tant qu'elle n'est pas verte.

```
□ 1. DIAGNOSTIC        py -3 (PyMuPDF) : page_count, producer, car./page
     ✓ porte : couche texte exploitable (>1000 car./page) ? sinon → OCR (§2b)

□ 2. RECONNAISSANCE    feuilleter le PDF : où sont le folio, les titres, les
     notes ? quelle structure (LIVRE/CHAPITRE/§) ? tome de continuation ?
     cahiers de planches ? annexes de fin (TOC, iconographie) ?
     ✓ porte : la table des matières est sous les yeux (photo ou page PDF)

□ 3. CONFIGURATION     déclarer l'ouvrage dans OUVRAGES (00_extract_pdf.py)
     puis :             py -3 scripts/00_extract_pdf.py <id>
     ✓ porte : "Folios reconstruits" proche de 0, "Folios rejetés" expliqués

□ 4. CONTRÔLE STRUCTURE  ouvrir <id>_structure.json
     ✓ porte : nb de livres + chapitres = table des matières, sans trou
       (une lacune = chiffre romain mal océrisé → heading_corrections)

□ 5. REGISTRE          scripts/ouvrages.ts + scripts/04_add_ouvrage.sql
     (publie = FALSE, droits renseignés, titre_court SANS le tome)

□ 6. DÉCOUPAGE         npx tsx scripts/01_clean_and_chunk.ts <id>
     ✓ porte : 0 chunk sans folio, 0 sans chapitre (hors liminaires),
       0 page_debut > page_fin, 0 régression de folio dans le .txt

□ 7. MIGRATION + INGESTION (base de test d'abord)
     psql -f scripts/04_add_ouvrage.sql   puis
     npx tsx scripts/03_ingest.ts <id>
     ✓ porte : l'état du corpus affiché liste TOUS les ouvrages, intacts,
       le nouveau marqué "non publié"

□ 8. SMOKE TEST        npx tsx scripts/99_smoke_test.ts
     ✓ porte : filtre étanche par ouvrage, 0 fuite de contenu masqué,
       citations correctes (tome en romain, pas de doublon)

□ 9. PUBLICATION       UPDATE publie=TRUE (catalogue + chunks) après
     validation humaine sur l'interface
```

Vérification groupée de l'étape 6 (une seule commande) :

```bash
py -3 -c "
import json,re,sys
o=sys.argv[1]
t=open('scripts/data/%s_fulltext.txt'%o,encoding='utf-8').read()
f=[int(m.group(1)) for m in re.finditer(r'^— (\d+) —$',t,re.M)]
c=json.load(open('scripts/data/chunks_%s.json'%o,encoding='utf-8'))
print('chunks     :',len(c))
print('folios     : %d -> %d'%(min(f),max(f)))
print('regressions:',sum(1 for i in range(1,len(f)) if f[i]<f[i-1]))
print('sans folio :',sum(1 for x in c if not x['metadata']['page_debut']))
print('sans chap. :',sum(1 for x in c if not x['metadata']['chapitre']))
print('deb>fin    :',sum(1 for x in c if x['metadata']['page_debut']>x['metadata']['page_fin']))
" <ouvrage_id>
```

Durée constatée : **T2 a pris une fraction du temps du T1** — l'essentiel du
travail restant est la reconnaissance (étape 2) et le contrôle de structure
(étape 4), pas le code.

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

Déclarer d'abord l'ouvrage dans le dictionnaire `OUVRAGES` en tête du script.
Référence complète des options, toutes éprouvées sur les deux tomes de Reygaerts :

```python
"reygaerts-1998-t2": {
    "pdf": "Géographie Historique d'Enghien T2 reconnu.pdf",   # dans ~/Downloads
    "body_size": 12,          # taille de police du corps, en points
    "min_body_chars": 200,    # en deçà : page considérée comme une planche
    "min_body_chars_sans_folio": 1200,   # seuil sévère pour les pages SANS folio
    "skip_pages": [1, 2, 3, 4, 5, 6],    # couvertures, faux-titres
    "stop_at_headings": ["ICONOGRAPHIE", "TABLE DES MATIERES"],  # annexes de fin
    "livre_initial": "III",   # tome de continuation : livre en cours à la p. 1
    "livres": {"PREMIER": ("I", "…"), "DEUXIEME": ("II", "…"), ...},
    "heading_corrections": {"Xin. DE HAINAUT": "XIII. DE HAINAUT", ...},
}
```

| Option | Quand s'en servir |
|---|---|
| `min_body_chars_sans_folio` | Toujours (1200). Les pages de légendes de figures montent à ~600 caractères et passeraient le seuil ordinaire : elles fuiraient dans le corpus **et fabriqueraient de faux folios** qui décalent toutes les citations suivantes. |
| `stop_at_headings` | Marqueurs des annexes de fin (TOC, iconographie). **Ils ne sont honorés que dans les 15 derniers % du volume** (`STOP_MIN_PROGRESSION`) : le même mot peut apparaître en plein corps — « ICONOGRAPHIE » figure au milieu du t. I et l'amputait de 24 %. |
| `livre_initial` | Tome qui reprend un livre commencé dans le volume précédent (« LIVRE TROISIEME (Suite) »). Sans lui, tout le tome serait rattaché au Livre I. |
| `heading_corrections` | Chiffres romains mal océrisés dans les titres (« Xin. » pour « XIII. »). Ciblé sur les titres uniquement — jamais de correction globale. |

Le script s'appuie sur **la typographie**, seul signal fiable :

- **folio** — police plus petite que le corps, dans les 8 % supérieurs de la page ;
- **titre** — gras **et** majuscules à plus de 90 % ;
- **note de bas de page** — police ≤ 8 pt, ou basse de page et commençant par un
  numéro d'appel ;
- **planche** — page dont le corps fait moins de `min_body_chars` caractères.

Sorties dans `scripts/data/` : `<id>_fulltext.txt`, `<id>_notes.json` (les notes,
isolées pour ne pas hacher les phrases), `<id>_structure.json` (à vérifier).

### Les neuf pièges, tous rencontrés sur Reygaerts t. I et t. II

Chacun a corrompu silencieusement le corpus avant d'être attrapé par un contrôle.
C'est la liste à relire avant d'intégrer un livre au profil nouveau.

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
   → `stop_at_headings`.
6. **Un marqueur d'arrêt peut apparaître en plein corps de texte.** « ICONOGRAPHIE »
   figure au milieu du t. I : l'arrêt y amputait 24 % du livre, sans erreur ni
   avertissement. → un marqueur n'est honoré qu'au-delà de 85 % du volume ; comparer
   systématiquement le nombre de chunks avant/après tout changement de configuration.
7. **Des sous-sections numérotées en chiffres romains se font passer pour des
   chapitres.** « I. ENGHIEN ET L'ABBAYE… » à l'intérieur du chapitre VII aurait
   rebasculé tout le reste du tome sur « chapitre I ». → règle de monotonie : un
   numéro de chapitre ne peut que croître ; sinon la ligne est reclassée en section.
   Le compteur repart à zéro à chaque nouveau livre.
8. **Un tome de continuation n'annonce pas son livre.** Le t. II ouvre sur
   « LIVRE TROISIEME (Suite) » puis enchaîne au chapitre II : sans `livre_initial`,
   ses 863 chunks auraient été rattachés au Livre I. → toujours vérifier la première
   page de texte d'un volume multiple.
9. **Les folios peuvent mentir.** Deux sources de faux folios rencontrées : les
   pages de légendes qui fuient dans le corpus (piège du seuil, voir
   `min_body_chars_sans_folio`) et les fac-similés de documents anciens dont l'OCR
   lit un nombre dans la zone d'en-tête. → un folio ne régresse jamais ; la
   comparaison se fait contre le dernier folio **réellement lu**, pas contre une
   valeur reconstruite (sinon rejet en cascade de folios valides — constaté :
   140 rejets à tort avant correction).

**Contrôle obligatoire avant de continuer :** ouvrir `<id>_structure.json` et
vérifier que le nombre de livres et de chapitres correspond à la table des
matières de l'ouvrage.

---

## 4. Étape 2 — Déclaration dans le registre

Ajouter l'ouvrage dans `scripts/ouvrages.ts` (identité bibliographique, titres des
livres, corrections OCR propres) **et** dans `scripts/04_add_ouvrage.sql` (catalogue
`enghien_ouvrages`, avec `publie = FALSE` et la mention des droits).

Le champ `titre_court` est ce que le visiteur lira dans chaque citation :
`Reygaerts 1998`. Le garder bref et sans ambiguïté.

⚠️ **Ne jamais y mettre le tome.** Il est porté par le champ `tome` et ajouté
séparément par `formatLocation()`, en chiffres romains. Le mettre aux deux
endroits produit des citations du type « Reygaerts 1998, t. I, t. 1, Livre III ».

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

**Lancer d'abord le smoke test** — lecture seule, sans navigateur :

```bash
npx tsx scripts/99_smoke_test.ts
```

Il vérifie sur la base réelle : l'étanchéité du filtre par ouvrage (parcourt
automatiquement tout le catalogue publié — un nouvel ouvrage est couvert sans
modifier le test), l'absence de fuite des ouvrages non publiés, le rendu des
citations, et le catalogue transmis au modèle (c'est lui qui a révélé que deux
tomes au même `titre_court` devenaient indiscernables pour le LLM).

Puis valider à la main sur l'interface de développement — en particulier, pour
un corpus multi-auteurs, poser une question où les auteurs divergent et vérifier
que la réponse attribue nommément chaque position. Enfin publier :

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
- Reygaerts 1998 (t. I et II) — sous droits, reproduction autorisée par l'ayant droit.
- Volumes à venir (Cahiers de Petit-Enghien I à IV, Jadis à Petit-Enghien) —
  autorisation confirmée par le propriétaire du projet (août 2026).

Les fichiers texte et les PDF sources ne sont **jamais** versionnés
(`scripts/data/*.txt` et `chunks*.json` sont dans `.gitignore`). Le dépôt étant
public, un ouvrage sous droits n'y apparaît que sous forme de métadonnées.
