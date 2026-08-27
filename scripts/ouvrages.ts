/**
 * Registre des ouvrages du corpus.
 *
 * Chaque ouvrage ajouté au RAG y déclare son identité bibliographique, sa
 * structure interne et ses corrections OCR propres. Les scripts 01 (chunking)
 * et 03 (ingestion) lisent ce registre : ajouter un livre ne demande donc
 * aucune modification du pipeline lui-même.
 */

export interface OcrFix {
  pattern: RegExp;
  replacement: string;
  raison: string;
}

export interface OuvrageConfig {
  /** Identifiant stable, utilisé comme clé de filtrage et de purge sélective. */
  id: string;
  titre: string;
  /**
   * Libellé compact affiché dans les citations. NE DOIT PAS contenir le tome :
   * il est ajouté séparément par formatLocation(), sous peine de doublon.
   */
  titre_court: string;
  auteur: string;
  annee: number;
  tome?: number;
  /** Fichier texte produit par 00_extract_pdf.py, dans scripts/data/. */
  source_file: string;
  /** Titre de chaque partie de premier niveau, indexé par chiffre romain. */
  livre_titres: Record<string, string>;
  /**
   * Corrections OCR appliquées au corps du texte. Volontairement propres à
   * chaque ouvrage : une règle utile sur une typographie de 1876 peut
   * corrompre un texte imprimé en 1998.
   */
  ocr_fixes: OcrFix[];
}

export const OUVRAGES: Record<string, OuvrageConfig> = {
  'matthieu-1876': {
    id: 'matthieu-1876',
    titre: "Histoire de la ville d'Enghien",
    titre_court: 'Matthieu 1876',
    auteur: 'Ernest Matthieu',
    annee: 1876,
    source_file: 'histoire_enghien_matthieu_fulltext.txt',
    livre_titres: {
      I: 'Histoire et généalogie',
      II: 'Organisation administrative',
      III: 'Culte et Bienfaisance',
      IV: 'Institutions scientifiques',
    },
    ocr_fixes: [
      {
        pattern: /\bk\b/g,
        replacement: 'à',
        raison: "« k » isolé : confusion OCR fréquente avec « à » sur cette fonte de 1876",
      },
    ],
  },

  'reygaerts-1998-t1': {
    id: 'reygaerts-1998-t1',
    titre: "La région d'Enghien — Une géographie historique, une histoire urbaine",
    titre_court: 'Reygaerts 1998',
    auteur: 'Jacques Reygaerts',
    annee: 1998,
    tome: 1,
    source_file: 'reygaerts-1998-t1_fulltext.txt',
    livre_titres: {
      I: 'Géographie historique des temps anciens',
      II: 'Géographie physique et histoire urbaine',
      III: "Géographie humaine et histoire d'Enghien",
    },
    // Texte de 1998 dans une océrisation ABBYY propre : aucune correction
    // globale nécessaire. Les rares fautes de titres sont traitées en amont,
    // dans 00_extract_pdf.py, où le contexte typographique permet de cibler.
    ocr_fixes: [],
  },
};

export function getOuvrage(id: string): OuvrageConfig {
  const ouvrage = OUVRAGES[id];
  if (!ouvrage) {
    const connus = Object.keys(OUVRAGES).join(', ');
    throw new Error(`Ouvrage inconnu : "${id}". Ouvrages déclarés : ${connus}`);
  }
  return ouvrage;
}
