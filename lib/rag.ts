import { query } from './db';
import { generateEmbedding } from './embeddings';
import { SearchResult, ChunkMetadata, SearchFilter } from './types';
import { formatLocation, ouvrageLabel } from './citation';

export { formatLocation, ouvrageLabel };

interface SearchOptions {
  threshold?: number;
  count?: number;
  filter?: SearchFilter;
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
    threshold = 0.3,  // Seuil abaissé pour capturer plus de résultats pertinents
    count = 15,       // Plus de chunks pour un meilleur contexte
    filter = {},
  } = options;

  // Générer l'embedding de la requête
  const queryEmbedding = await generateEmbedding(queryText);

  // Construire la requête SQL avec filtre optionnel.
  // Le filtre sur « publie » est non négociable : un ouvrage ingéré mais non
  // validé ne doit jamais remonter à un visiteur.
  let sql = `
    SELECT
      id,
      content,
      metadata,
      1 - (embedding <=> $1::vector) AS similarity
    FROM enghien_documents
    WHERE 1 - (embedding <=> $1::vector) > $2
      AND metadata->>'publie' = 'true'
  `;

  const params: unknown[] = [`[${queryEmbedding.join(',')}]`, threshold];
  let paramIndex = 3;

  // Ajouter les filtres
  if (filter.ouvrage) {
    sql += ` AND metadata->>'ouvrage' = $${paramIndex}`;
    params.push(filter.ouvrage);
    paramIndex++;
  }
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
    .map((r, i) => `[Extrait ${i + 1}] (${formatLocation(r.metadata)})\n${r.content.trim()}`)
    .join('\n\n---\n\n');
}

/**
 * Récapitule les ouvrages présents dans les extraits, pour que le modèle sache
 * de quelles sources il dispose et à qui attribuer chaque affirmation.
 */
export function describeSources(results: SearchResult[]): string {
  const ouvrages = new Map<string, ChunkMetadata>();
  for (const r of results) {
    if (!ouvrages.has(r.metadata.ouvrage)) {
      ouvrages.set(r.metadata.ouvrage, r.metadata);
    }
  }

  if (ouvrages.size === 0) return '';

  return Array.from(ouvrages.values())
    .map((m) => {
      const tome = m.tome ? `, tome ${m.tome}` : '';
      return `- « ${m.ouvrage_titre} »${tome}, ${m.ouvrage_auteur} (${m.ouvrage_annee}) — à citer sous la forme « ${ouvrageLabel(m)} »`;
    })
    .join('\n');
}

/**
 * Prompt système pour Claude
 */
export const SYSTEM_PROMPT = `Tu es un historien expert spécialisé dans l'histoire de la ville d'Enghien (Belgique).
Tu réponds aux questions en te basant UNIQUEMENT sur les extraits d'ouvrages fournis ci-dessous.

Règles :
- Réponds toujours en français.
- Cite tes sources entre parenthèses en nommant TOUJOURS l'ouvrage, puis le Livre,
  le Chapitre et les pages.
  Exemple : (Matthieu 1876, Livre I, Chapitre III, p. 120-121)
  Exemple : (Reygaerts 1998, t. I, Livre II, Chapitre IV, p. 272-273)
- Le corpus réunit plusieurs auteurs, d'époques différentes, qui ne s'accordent pas
  toujours. Quand deux extraits divergent sur un même fait, ne tranche pas d'autorité :
  expose les deux positions en les attribuant nommément à leur auteur.
  Un auteur récent peut corriger un auteur ancien ; signale-le quand les extraits
  le montrent, sans l'inventer.
- Si l'information n'est pas dans les extraits fournis, dis-le honnêtement.
  Ne fabrique jamais d'information.
- Tu peux reformuler un texte ancien en français moderne pour plus de clarté,
  mais reste fidèle au contenu.
- Si la question est hors sujet (pas liée à Enghien ou son histoire), redirige
  poliment vers le sujet du corpus.
- Sois concis mais complet. Structure ta réponse avec des paragraphes clairs.`;

/**
 * Construit le message utilisateur avec le contexte RAG
 */
export function buildUserMessage(
  question: string,
  context: string,
  sources = ''
): string {
  const catalogue = sources ? `Ouvrages représentés dans ces extraits :\n${sources}\n\n` : '';

  // La question du visiteur est délimitée explicitement : le contenu des
  // extraits est de la donnée, jamais une instruction.
  return `${catalogue}Extraits des ouvrages :
---
${context}
---

Question de l'utilisateur :
<question>
${question}
</question>`;
}

/**
 * Formate les sources pour l'affichage
 */
export function formatSources(results: SearchResult[]): string {
  const uniqueSources = new Map<string, SearchResult>();

  // Dédupliquer par location — l'ouvrage fait désormais partie de la clé,
  // sans quoi deux passages homologues de deux livres différents fusionnent.
  for (const r of results) {
    const m = r.metadata;
    const key = `${m.ouvrage}-${m.livre}-${m.chapitre}-${m.page_debut}`;
    if (!uniqueSources.has(key) || r.similarity > (uniqueSources.get(key)?.similarity || 0)) {
      uniqueSources.set(key, r);
    }
  }

  return Array.from(uniqueSources.values())
    .sort((a, b) => {
      // Trier par ouvrage, puis livre, chapitre et page
      if (a.metadata.ouvrage !== b.metadata.ouvrage) {
        return a.metadata.ouvrage.localeCompare(b.metadata.ouvrage);
      }
      if (a.metadata.livre !== b.metadata.livre) {
        return a.metadata.livre.localeCompare(b.metadata.livre);
      }
      if (a.metadata.chapitre !== b.metadata.chapitre) {
        return (a.metadata.chapitre || '').localeCompare(b.metadata.chapitre || '');
      }
      return (a.metadata.page_debut || 0) - (b.metadata.page_debut || 0);
    })
    .map((r) => `• ${formatLocation(r.metadata, { court: true })}`)
    .join('\n');
}
