-- =============================================================================
-- Migration Supabase pour l'application RAG "Histoire de la ville d'Enghien"
-- =============================================================================

-- Activer l'extension pgvector si pas déjà fait
CREATE EXTENSION IF NOT EXISTS vector;

-- =============================================================================
-- Table principale des chunks vectorisés
-- =============================================================================
DROP TABLE IF EXISTS enghien_documents CASCADE;

CREATE TABLE enghien_documents (
  id BIGSERIAL PRIMARY KEY,
  content TEXT NOT NULL,
  embedding VECTOR(1536),  -- OpenAI text-embedding-3-small = 1536 dimensions
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Commentaires pour documentation
COMMENT ON TABLE enghien_documents IS 'Chunks vectorisés du livre "Histoire de la ville d''Enghien" (1876)';
COMMENT ON COLUMN enghien_documents.content IS 'Contenu textuel du chunk (500-800 tokens environ)';
COMMENT ON COLUMN enghien_documents.embedding IS 'Vecteur d''embedding OpenAI (1536 dimensions)';
COMMENT ON COLUMN enghien_documents.metadata IS 'Métadonnées: livre, chapitre, section, pages';

-- =============================================================================
-- Index pour recherche vectorielle (IVFFlat)
-- =============================================================================
-- Note: IVFFlat est plus rapide que HNSW pour les petits datasets (<100k vecteurs)
-- lists = sqrt(n) est une bonne heuristique, ici ~100 pour ~10000 chunks attendus
CREATE INDEX enghien_documents_embedding_idx
  ON enghien_documents
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- =============================================================================
-- Index pour filtrage par métadonnées
-- =============================================================================
CREATE INDEX enghien_documents_metadata_idx
  ON enghien_documents
  USING GIN (metadata);

-- Index spécifique pour filtre par livre (usage fréquent)
CREATE INDEX enghien_documents_livre_idx
  ON enghien_documents
  ((metadata->>'livre'));

-- =============================================================================
-- Fonction de recherche sémantique
-- =============================================================================
CREATE OR REPLACE FUNCTION match_enghien_documents(
  query_embedding VECTOR(1536),
  match_threshold FLOAT DEFAULT 0.5,
  match_count INT DEFAULT 8,
  filter JSONB DEFAULT '{}'
)
RETURNS TABLE (
  id BIGINT,
  content TEXT,
  metadata JSONB,
  similarity FLOAT
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ed.id,
    ed.content,
    ed.metadata,
    1 - (ed.embedding <=> query_embedding) AS similarity
  FROM enghien_documents ed
  WHERE
    -- Seuil de similarité
    1 - (ed.embedding <=> query_embedding) > match_threshold
    -- Filtre optionnel par métadonnées (si filter n'est pas vide)
    AND (
      filter = '{}'::jsonb
      OR ed.metadata @> filter
    )
  ORDER BY ed.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

COMMENT ON FUNCTION match_enghien_documents IS
  'Recherche sémantique dans les documents d''Enghien.
   Paramètres:
   - query_embedding: vecteur de la requête (1536 dim)
   - match_threshold: seuil de similarité minimum (0-1)
   - match_count: nombre max de résultats
   - filter: filtre JSONB sur metadata (ex: {"livre": "I"})';

-- =============================================================================
-- Table historique des conversations (optionnel)
-- =============================================================================
DROP TABLE IF EXISTS enghien_conversations CASCADE;

CREATE TABLE enghien_conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  messages JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE enghien_conversations IS 'Historique des conversations pour le chat RAG';

-- Trigger pour mettre à jour updated_at automatiquement
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_enghien_conversations_updated_at
  BEFORE UPDATE ON enghien_conversations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- Politiques RLS (Row Level Security) - optionnel selon votre config Supabase
-- =============================================================================
-- Note: Activez ces politiques uniquement si vous utilisez l'anon key côté client
-- Pour un usage serveur uniquement (service key), RLS peut rester désactivé

-- ALTER TABLE enghien_documents ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Allow public read access" ON enghien_documents FOR SELECT USING (true);

-- ALTER TABLE enghien_conversations ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Allow public read/write access" ON enghien_conversations FOR ALL USING (true);

-- =============================================================================
-- Vérification
-- =============================================================================
DO $$
BEGIN
  RAISE NOTICE '✅ Migration terminée avec succès!';
  RAISE NOTICE '   - Table enghien_documents créée';
  RAISE NOTICE '   - Index vectoriel IVFFlat créé';
  RAISE NOTICE '   - Fonction match_enghien_documents créée';
  RAISE NOTICE '   - Table enghien_conversations créée';
END $$;
