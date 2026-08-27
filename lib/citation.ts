import { ChunkMetadata } from './types';

/**
 * Référence bibliographique d'un extrait, du plus général au plus précis.
 *
 * Module volontairement sans aucune dépendance : il est utilisé côté serveur
 * (construction du prompt) comme côté client (panneau des sources). Le placer
 * dans lib/rag.ts entraînerait le driver PostgreSQL dans le bundle navigateur.
 *
 * Implémentation unique, donc aucun risque de divergence entre ce que le
 * modèle cite et ce que le visiteur voit affiché.
 */
export function formatLocation(
  meta: ChunkMetadata,
  options: { court?: boolean } = {}
): string {
  const { court = false } = options;

  const pages = meta.page_debut
    ? meta.page_debut === meta.page_fin
      ? `p. ${meta.page_debut}`
      : `p. ${meta.page_debut}-${meta.page_fin}`
    : null;

  return [
    meta.ouvrage_court,
    meta.tome ? `t. ${meta.tome}` : null,
    meta.livre ? `Livre ${meta.livre}` : null,
    meta.chapitre ? (court ? `Chap. ${meta.chapitre}` : `Chapitre ${meta.chapitre}`) : null,
    court ? null : meta.section || null,
    pages,
  ]
    .filter(Boolean)
    .join(', ');
}
