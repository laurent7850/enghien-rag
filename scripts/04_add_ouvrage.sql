-- =============================================================================
-- Migration : passage du corpus mono-ouvrage au corpus multi-ouvrages
-- =============================================================================
--
-- Jusqu'ici, « livre » désignait l'une des quatre parties du Matthieu (1876).
-- L'arrivée d'autres ouvrages impose une dimension supérieure : « ouvrage ».
--
-- Cette migration est ADDITIVE et IDEMPOTENTE : elle ne supprime ni ne
-- réécrit aucun contenu, et peut être rejouée sans effet de bord. Les chunks
-- déjà en base sont simplement rattachés à leur ouvrage d'origine.
--
-- A jouer AVANT toute ingestion d'un nouvel ouvrage.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Rattacher l'existant au Matthieu
-- -----------------------------------------------------------------------------
-- Tout chunk sans clé « ouvrage » provient nécessairement de l'ingestion
-- initiale, qui ne portait que sur « Histoire de la ville d'Enghien ».
UPDATE enghien_documents
SET metadata = metadata || jsonb_build_object(
      'ouvrage',        'matthieu-1876',
      'ouvrage_titre',  'Histoire de la ville d''Enghien',
      'ouvrage_court',  'Matthieu 1876',
      'ouvrage_auteur', 'Ernest Matthieu',
      'ouvrage_annee',  1876
    )
WHERE metadata->>'ouvrage' IS NULL;

-- -----------------------------------------------------------------------------
-- 2. Drapeau de publication
-- -----------------------------------------------------------------------------
-- Permet d'ingérer et de valider un ouvrage sans l'exposer immédiatement aux
-- visiteurs. L'existant est publié : le comportement actuel est préservé.
UPDATE enghien_documents
SET metadata = metadata || jsonb_build_object('publie', true)
WHERE metadata->>'publie' IS NULL;

-- -----------------------------------------------------------------------------
-- 3. Index de filtrage
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS enghien_documents_ouvrage_idx
  ON enghien_documents ((metadata->>'ouvrage'));

CREATE INDEX IF NOT EXISTS enghien_documents_publie_idx
  ON enghien_documents ((metadata->>'publie'));

-- Le couple (ouvrage, livre) est le filtre le plus fréquent de l'interface.
CREATE INDEX IF NOT EXISTS enghien_documents_ouvrage_livre_idx
  ON enghien_documents ((metadata->>'ouvrage'), (metadata->>'livre'));

-- -----------------------------------------------------------------------------
-- 4. Table de référence des ouvrages
-- -----------------------------------------------------------------------------
-- Alimente le filtre de l'interface sans avoir à parcourir des milliers de
-- lignes de metadata à chaque affichage.
CREATE TABLE IF NOT EXISTS enghien_ouvrages (
  id           TEXT PRIMARY KEY,
  titre        TEXT NOT NULL,
  titre_court  TEXT NOT NULL,
  auteur       TEXT NOT NULL,
  annee        INT  NOT NULL,
  tome         INT,
  livres       JSONB NOT NULL DEFAULT '{}',
  publie       BOOLEAN NOT NULL DEFAULT FALSE,
  -- Traçabilité des droits : le corpus mêle domaine public et œuvres sous
  -- droits exploitées avec autorisation.
  droits       TEXT,
  ordre        INT NOT NULL DEFAULT 100,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE enghien_ouvrages IS
  'Catalogue des ouvrages du corpus RAG (identité, structure, statut de publication, droits)';

INSERT INTO enghien_ouvrages (id, titre, titre_court, auteur, annee, tome, livres, publie, droits, ordre)
VALUES
  (
    'matthieu-1876',
    'Histoire de la ville d''Enghien',
    'Matthieu 1876',
    'Ernest Matthieu',
    1876,
    NULL,
    '{"I": "Histoire et généalogie", "II": "Organisation administrative", "III": "Culte et Bienfaisance", "IV": "Institutions scientifiques"}'::jsonb,
    TRUE,
    'Domaine public (auteur décédé depuis plus de 70 ans)',
    10
  ),
  (
    'reygaerts-1998-t1',
    'La région d''Enghien — Une géographie historique, une histoire urbaine',
    'Reygaerts 1998',
    'Jacques Reygaerts',
    1998,
    1,
    '{"I": "Géographie historique des temps anciens", "II": "Géographie physique et histoire urbaine", "III": "Géographie humaine et histoire d''Enghien"}'::jsonb,
    FALSE,
    'Sous droits — reproduction autorisée par l''ayant droit',
    20
  ),
  (
    'reygaerts-1998-t2',
    'La région d''Enghien — Une géographie historique, une histoire urbaine',
    'Reygaerts 1998',
    'Jacques Reygaerts',
    1998,
    2,
    '{"III": "Géographie humaine et histoire d''Enghien"}'::jsonb,
    FALSE,
    'Sous droits — reproduction autorisée par l''ayant droit',
    30
  ),
  (
    'cahiers-pe-t1',
    'Les Cahiers de Petit-Enghien',
    'Cahiers de Petit-Enghien',
    'Union des groupements patriotiques de Petit-Enghien',
    1996, 1, '{}'::jsonb, FALSE,
    'Sous droits — reproduction autorisée (confirmée par le propriétaire du projet, août 2026)',
    40
  ),
  (
    'cahiers-pe-t2',
    'Les Cahiers de Petit-Enghien',
    'Cahiers de Petit-Enghien',
    'Union des groupements patriotiques de Petit-Enghien',
    -- Date estimée : aucune mention dans le volume, situé entre t.1 (1996) et t.3 (2001)
    1998, 2, '{}'::jsonb, FALSE,
    'Sous droits — reproduction autorisée (confirmée par le propriétaire du projet, août 2026)',
    41
  ),
  (
    'cahiers-pe-t3',
    'Les Cahiers de Petit-Enghien',
    'Cahiers de Petit-Enghien',
    'Union des groupements patriotiques de Petit-Enghien',
    2001, 3, '{}'::jsonb, FALSE,
    'Sous droits — reproduction autorisée (confirmée par le propriétaire du projet, août 2026)',
    42
  ),
  (
    'cahiers-pe-t4',
    'Les Cahiers de Petit-Enghien',
    'Cahiers de Petit-Enghien',
    'Union des groupements patriotiques de Petit-Enghien',
    2007, 4, '{}'::jsonb, FALSE,
    'Sous droits — reproduction autorisée (confirmée par le propriétaire du projet, août 2026)',
    43
  ),
  (
    'godet-1967',
    'Jadis à Petit-Enghien, ou prospection dans le passé de ce village',
    'Godet 1967',
    'Jean Godet',
    1967, NULL, '{}'::jsonb, FALSE,
    'Sous droits — reproduction autorisée (confirmée par le propriétaire du projet, août 2026)',
    50
  )
ON CONFLICT (id) DO UPDATE
SET titre       = EXCLUDED.titre,
    titre_court = EXCLUDED.titre_court,
    auteur      = EXCLUDED.auteur,
    annee       = EXCLUDED.annee,
    tome        = EXCLUDED.tome,
    livres      = EXCLUDED.livres,
    droits      = EXCLUDED.droits,
    ordre       = EXCLUDED.ordre;
-- Note : « publie » n'est volontairement pas écrasé par ON CONFLICT, pour
-- qu'un rejeu de la migration ne dépublie pas un ouvrage mis en ligne depuis.

COMMIT;

-- -----------------------------------------------------------------------------
-- Vérification
-- -----------------------------------------------------------------------------
SELECT
  metadata->>'ouvrage'  AS ouvrage,
  metadata->>'publie'   AS publie,
  COUNT(*)              AS chunks,
  MIN((metadata->>'page_debut')::int) AS page_min,
  MAX((metadata->>'page_fin')::int)   AS page_max
FROM enghien_documents
GROUP BY 1, 2
ORDER BY 1;
