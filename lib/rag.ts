import { query } from './db';
import { generateEmbedding } from './embeddings';
import { SearchResult, ChunkMetadata } from './types';

interface SearchOptions {
  threshold?: number;
  count?: number;
  filter?: {
    livre?: string;
    chapitre?: string;
  };
}

interface DocumentRow {
  id: number;
  content: string;
  metadata: ChunkMetadata;
  similarity: number;
}

/**
 * Recherche sémantique dans les documents d'Enghien
 */
export async function searchDocuments(
  queryText: string,
  options: SearchOptions = {}
): Promise<SearchResult[]> {
  const {
    threshold = 0.4,
    count = 8,
    filter = {},
  } = options;

  // Générer l'embedding de la requête
  const queryEmbedding = await generateEmbedding(queryText);

  // Construire la requête SQL avec filtre optionnel
  let sql = `
    SELECT
      id,
      content,
      metadata,
      1 - (embedding <=> $1::vector) AS similarity
    FROM enghien_documents
    WHERE 1 - (embedding <=> $1::vector) > $2
  `;

  const params: unknown[] = [`[${queryEmbedding.join(',')}]`, threshold];
  let paramIndex = 3;

  // Ajouter les filtres
  if (filter.livre) {
    sql += ` AND metadata->>'livre' = $${paramIndex}`;
    params.push(filter.livre);
    paramIndex++;
  }
  if (filter.chapitre) {
    sql += ` AND metadata->>'chapitre' = $${paramIndex}`;
    params.push(filter.chapitre);
    paramIndex++;
  }

  sql += ` ORDER BY embedding <=> $1::vector LIMIT $${paramIndex}`;
  params.push(count);

  const rows = await query<DocumentRow>(sql, params);

  return rows.map((doc) => ({
    id: doc.id,
    content: doc.content,
    metadata: doc.metadata,
    similarity: doc.similarity,
  }));
}

/**
 * Construit le prompt avec les chunks comme contexte
 */
export function buildContextPrompt(results: SearchResult[]): string {
  if (results.length === 0) {
    return 'Aucun passage pertinent n\'a été trouvé dans le livre.';
  }

  return results
    .map((r, i) => {
      const meta = r.metadata;
      const location = [
        `Livre ${meta.livre}`,
        meta.chapitre ? `Chapitre ${meta.chapitre}` : null,
        meta.section || null,
        meta.page_debut
          ? meta.page_debut === meta.page_fin
            ? `p. ${meta.page_debut}`
            : `p. ${meta.page_debut}-${meta.page_fin}`
          : null,
      ]
        .filter(Boolean)
        .join(', ');

      return `[Extrait ${i + 1}] (${location})\n${r.content.trim()}`;
    })
    .join('\n\n---\n\n');
}

/**
 * Prompt système pour Claude
 */
export const SYSTEM_PROMPT = `Tu es un historien expert spécialisé dans l'histoire de la ville d'Enghien (Belgique).
Tu réponds aux questions en te basant UNIQUEMENT sur les extraits du livre
"Histoire de la ville d'Enghien" par Ernest Matthieu (1876) fournis ci-dessous.

Règles :
- Réponds toujours en français.
- Cite tes sources en indiquant le Livre, Chapitre et pages entre parenthèses.
  Exemple : (Livre I, Chapitre III, p. 120-121)
- Si l'information n'est pas dans les extraits fournis, dis-le honnêtement.
  Ne fabrique jamais d'information.
- Tu peux reformuler le texte du XIXe siècle en français moderne pour plus de clarté,
  mais reste fidèle au contenu.
- Si la question est hors sujet (pas liée à Enghien ou son histoire), redirige
  poliment vers le sujet du livre.
- Sois concis mais complet. Structure ta réponse avec des paragraphes clairs.`;

/**
 * Construit le message utilisateur avec le contexte RAG
 */
export function buildUserMessage(question: string, context: string): string {
  return `Extraits du livre :
---
${context}
---

Question de l'utilisateur : ${question}`;
}

/**
 * Formate les sources pour l'affichage
 */
export function formatSources(results: SearchResult[]): string {
  const uniqueSources = new Map<string, SearchResult>();

  // Dédupliquer par location
  for (const r of results) {
    const key = `${r.metadata.livre}-${r.metadata.chapitre}-${r.metadata.page_debut}`;
    if (!uniqueSources.has(key) || r.similarity > (uniqueSources.get(key)?.similarity || 0)) {
      uniqueSources.set(key, r);
    }
  }

  return Array.from(uniqueSources.values())
    .sort((a, b) => {
      // Trier par livre puis chapitre puis page
      if (a.metadata.livre !== b.metadata.livre) {
        return a.metadata.livre.localeCompare(b.metadata.livre);
      }
      if (a.metadata.chapitre !== b.metadata.chapitre) {
        return (a.metadata.chapitre || '').localeCompare(b.metadata.chapitre || '');
      }
      return (a.metadata.page_debut || 0) - (b.metadata.page_debut || 0);
    })
    .map((r) => {
      const meta = r.metadata;
      const parts = [`Livre ${meta.livre}`];
      if (meta.chapitre) parts.push(`Chap. ${meta.chapitre}`);
      if (meta.page_debut) {
        parts.push(
          meta.page_debut === meta.page_fin
            ? `p. ${meta.page_debut}`
            : `p. ${meta.page_debut}-${meta.page_fin}`
        );
      }
      return `• ${parts.join(', ')}`;
    })
    .join('\n');
}
