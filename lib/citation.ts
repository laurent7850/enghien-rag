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
const ROMAINS = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

/** Les tomes se citent en chiffres romains, par convention bibliographique. */
function tomeEnRomain(tome: number): string {
  return ROMAINS[tome] ?? String(tome);
}

/**
 * Désignation de l'ouvrage seul, tome compris.
 *
 * Deux tomes d'un même ouvrage partagent leur `ouvrage_court` : sans le tome,
 * ils sont indiscernables et le modèle cite l'un pour l'autre.
 */
export function ouvrageLabel(meta: ChunkMetadata): string {
  return meta.tome
    ? `${meta.ouvrage_court}, t. ${tomeEnRomain(meta.tome)}`
    : meta.ouvrage_court;
}

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
    // Le tome est ajouté ici, jamais dans « ouvrage_court » : le porter aux
    // deux endroits le faisait apparaître en double dans les citations.
    meta.tome ? `t. ${tomeEnRomain(meta.tome)}` : null,
    meta.livre ? `Livre ${meta.livre}` : null,
    meta.chapitre ? (court ? `Chap. ${meta.chapitre}` : `Chapitre ${meta.chapitre}`) : null,
    court ? null : meta.section || null,
    pages,
  ]
    .filter(Boolean)
    .join(', ');
}
