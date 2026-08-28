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

  'reygaerts-1998-t2': {
    id: 'reygaerts-1998-t2',
    titre: "La région d'Enghien — Une géographie historique, une histoire urbaine",
    titre_court: 'Reygaerts 1998',
    auteur: 'Jacques Reygaerts',
    annee: 1998,
    tome: 2,
    source_file: 'reygaerts-1998-t2_fulltext.txt',
    // Le tome 2 ne contient que la suite du Livre III ; les deux autres sont
    // déclarés pour que le libellé reste correct si un renvoi y mène.
    livre_titres: {
      I: 'Géographie historique des temps anciens',
      II: 'Géographie physique et histoire urbaine',
      III: "Géographie humaine et histoire d'Enghien",
    },
    ocr_fixes: [],
  },

  'cahiers-pe-t1': {
    id: 'cahiers-pe-t1',
    titre: 'Les Cahiers de Petit-Enghien',
    titre_court: 'Cahiers de Petit-Enghien',
    auteur: 'Union des groupements patriotiques de Petit-Enghien',
    annee: 1996,
    tome: 1,
    source_file: 'cahiers-pe-t1_fulltext.txt',
    // Album de mémoire villageoise : articles à titres libres, pas de
    // structure LIVRE/CHAPITRE.
    livre_titres: {},
    ocr_fixes: [],
  },

  'cahiers-pe-t2': {
    id: 'cahiers-pe-t2',
    titre: 'Les Cahiers de Petit-Enghien',
    titre_court: 'Cahiers de Petit-Enghien',
    auteur: 'Union des groupements patriotiques de Petit-Enghien',
    // Aucune date dans le volume : estimation entre le t. 1 (1996) et le
    // t. 3 (2001).
    annee: 1998,
    tome: 2,
    source_file: 'cahiers-pe-t2_fulltext.txt',
    livre_titres: {},
    ocr_fixes: [],
  },

  'cahiers-pe-t3': {
    id: 'cahiers-pe-t3',
    titre: 'Les Cahiers de Petit-Enghien',
    titre_court: 'Cahiers de Petit-Enghien',
    auteur: 'Union des groupements patriotiques de Petit-Enghien',
    annee: 2001,
    tome: 3,
    source_file: 'cahiers-pe-t3_fulltext.txt',
    livre_titres: {},
    ocr_fixes: [],
  },

  'cahiers-pe-t4': {
    id: 'cahiers-pe-t4',
    titre: 'Les Cahiers de Petit-Enghien',
    titre_court: 'Cahiers de Petit-Enghien',
    auteur: 'Union des groupements patriotiques de Petit-Enghien',
    annee: 2007,
    tome: 4,
    source_file: 'cahiers-pe-t4_fulltext.txt',
    livre_titres: {},
    ocr_fixes: [],
  },

  'godet-1967': {
    id: 'godet-1967',
    titre: 'Jadis à Petit-Enghien, ou prospection dans le passé de ce village',
    titre_court: 'Godet 1967',
    auteur: 'Jean Godet',
    annee: 1967,
    source_file: 'godet-1967_fulltext.txt',
    // Livre a chapitres sans partie de premier niveau : sections seules.
    livre_titres: {},
    // Texte issu de l'OCR vision (00b_ocr_vision.py) : propre, aucune
    // correction globale necessaire.
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
