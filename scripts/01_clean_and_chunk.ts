import * as fs from 'fs';
import * as path from 'path';
import { getOuvrage, OuvrageConfig } from './ouvrages';

interface ChunkMetadata {
  // Identité de l'ouvrage : indispensable dès que le corpus en compte plusieurs,
  // sans quoi une citation ne peut plus être rattachée à sa source.
  ouvrage: string;
  ouvrage_titre: string;
  ouvrage_court: string;
  ouvrage_auteur: string;
  ouvrage_annee: number;
  tome?: number;
  // Localisation interne à l'ouvrage
  livre: string;
  livre_titre: string;
  chapitre: string;
  section?: string;
  page_debut: number;
  page_fin: number;
  chunk_index: number;
}

interface Chunk {
  content: string;
  metadata: ChunkMetadata;
}

// Regex patterns
const PAGE_MARKER_REGEX = /^—\s*(\d+)\s*—\s*$/gm;
const LIVRE_REGEX = /^LIVRE\s+([IVX]+)/;
const CHAPITRE_REGEX = /^CHAPITRE\s+([IVX]+)/;
const SECTION_REGEX = /^§\s*(\d+(?:er)?)\.\s*[—-]?\s*(.+)$/;

// Target chunk size in characters (approximately 500-800 tokens)
const MIN_CHUNK_SIZE = 1500;
const MAX_CHUNK_SIZE = 2500;
const OVERLAP_SIZE = 300;

function cleanText(text: string, ouvrage: OuvrageConfig): string {
  // Normaliser les fins de ligne
  let cleaned = text.replace(/\r\n/g, '\n');

  // Supprimer les marqueurs de page mais garder trace des numéros
  cleaned = cleaned.replace(PAGE_MARKER_REGEX, '[[PAGE:$1]]');

  // Normaliser les espaces multiples (mais pas les sauts de ligne)
  cleaned = cleaned.replace(/[ \t]+/g, ' ');

  // Corrections OCR propres à l'ouvrage (voir scripts/ouvrages.ts)
  for (const fix of ouvrage.ocr_fixes) {
    cleaned = cleaned.replace(fix.pattern, fix.replacement);
  }
  cleaned = cleaned.replace(/(\w)'(\w)/g, '$1\'$2'); // Normaliser les apostrophes

  // Supprimer les lignes vides multiples
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  return cleaned.trim();
}

function extractPageNumbers(text: string): { text: string; pages: number[] } {
  const pages: number[] = [];
  const pageMatches = text.matchAll(/\[\[PAGE:(\d+)\]\]/g);

  for (const match of pageMatches) {
    pages.push(parseInt(match[1], 10));
  }

  // Retirer les marqueurs du texte final
  const cleanedText = text.replace(/\[\[PAGE:\d+\]\]\n?/g, '');

  return { text: cleanedText, pages };
}

function detectStructure(line: string): { type: 'livre' | 'chapitre' | 'section' | null; value: string; titre?: string } {
  const livreMatch = line.match(LIVRE_REGEX);
  if (livreMatch) {
    return { type: 'livre', value: livreMatch[1] };
  }

  const chapitreMatch = line.match(CHAPITRE_REGEX);
  if (chapitreMatch) {
    return { type: 'chapitre', value: chapitreMatch[1] };
  }

  const sectionMatch = line.match(SECTION_REGEX);
  if (sectionMatch) {
    return { type: 'section', value: sectionMatch[1], titre: sectionMatch[2].trim() };
  }

  return { type: null, value: '' };
}

function splitIntoParagraphs(text: string): string[] {
  // Séparer par double saut de ligne (paragraphes)
  return text.split(/\n\n+/).filter(p => p.trim().length > 0);
}

function createChunks(text: string, ouvrage: OuvrageConfig): Chunk[] {
  const chunks: Chunk[] = [];
  const lines = text.split('\n');

  // Vide tant qu'aucun marqueur LIVRE n'est rencontre : les recueils sans
  // partie de premier niveau (Cahiers) ne doivent pas etre etiquetes
  // "Livre I" par defaut — formatLocation() omet un livre vide.
  let currentLivre = '';
  let currentChapitre = '';
  let currentSection: string | undefined;
  let currentContent = '';
  let currentPages: number[] = [];
  let chunkIndex = 0;
  let lastChunkEnd = '';

  // La page courante est un état persistant d'un chunk à l'autre : un chunk
  // plus court qu'une page ne contient aucun marqueur, et resterait sinon sans
  // folio — donc cité sans page dans l'interface.
  let currentPage = 0;
  let chunkStartPage = 0;

  function saveChunk() {
    if (currentContent.trim().length < 100) return; // Ignorer les chunks trop petits

    const { text: cleanContent, pages } = extractPageNumbers(currentContent);
    const allPages = [...currentPages, ...pages];

    // Début : la page en cours quand le chunk a commencé ; fin : la dernière
    // page atteinte. On retombe sur les marqueurs internes si l'état est vide
    // (tout premier chunk du fichier).
    const pageDebut = chunkStartPage || (allPages.length > 0 ? Math.min(...allPages) : 0);
    const pageFin = currentPage || (allPages.length > 0 ? Math.max(...allPages) : 0);

    // Ajouter l'overlap du chunk précédent
    const contentWithOverlap = lastChunkEnd + cleanContent.trim();

    chunks.push({
      content: contentWithOverlap,
      metadata: {
        ouvrage: ouvrage.id,
        ouvrage_titre: ouvrage.titre,
        ouvrage_court: ouvrage.titre_court,
        ouvrage_auteur: ouvrage.auteur,
        ouvrage_annee: ouvrage.annee,
        ...(ouvrage.tome !== undefined ? { tome: ouvrage.tome } : {}),
        livre: currentLivre,
        livre_titre: ouvrage.livre_titres[currentLivre] || '',
        chapitre: currentChapitre,
        section: currentSection,
        page_debut: pageDebut,
        page_fin: pageFin,
        chunk_index: chunkIndex
      }
    });

    // Garder la fin pour l'overlap
    lastChunkEnd = cleanContent.trim().slice(-OVERLAP_SIZE) + '\n\n';

    chunkIndex++;
    currentContent = '';
    currentPages = [];
    chunkStartPage = currentPage;
  }

  for (const line of lines) {
    // Détecter les marqueurs de page
    const pageMatch = line.match(/\[\[PAGE:(\d+)\]\]/);
    if (pageMatch) {
      currentPage = parseInt(pageMatch[1], 10);
      currentPages.push(currentPage);
      if (!chunkStartPage) chunkStartPage = currentPage;
      continue;
    }

    // Détecter la structure
    const structure = detectStructure(line);

    if (structure.type === 'livre') {
      // Nouveau livre = forcer un nouveau chunk
      saveChunk();
      currentLivre = structure.value;
      currentChapitre = '';
      currentSection = undefined;
      lastChunkEnd = ''; // Reset overlap au changement de livre
    } else if (structure.type === 'chapitre') {
      // Nouveau chapitre = forcer un nouveau chunk
      saveChunk();
      currentChapitre = structure.value;
      currentSection = undefined;
    } else if (structure.type === 'section') {
      // Nouvelle section = potentiellement nouveau chunk si le chunk actuel est assez grand
      if (currentContent.length > MIN_CHUNK_SIZE) {
        saveChunk();
      }
      currentSection = `§ ${structure.value}. — ${structure.titre}`;
    }

    // Ajouter la ligne au contenu courant
    currentContent += line + '\n';

    // Vérifier si on doit créer un nouveau chunk
    if (currentContent.length > MAX_CHUNK_SIZE) {
      // Essayer de couper à un paragraphe
      const paragraphs = splitIntoParagraphs(currentContent);
      if (paragraphs.length > 1) {
        // Garder le dernier paragraphe pour le prochain chunk
        const lastParagraph = paragraphs.pop()!;
        currentContent = paragraphs.join('\n\n');
        saveChunk();
        currentContent = lastParagraph + '\n';
      } else {
        // Pas de paragraphe, forcer la coupe
        saveChunk();
      }
    }
  }

  // Sauvegarder le dernier chunk
  saveChunk();

  return chunks;
}

async function main() {
  const ouvrageId = process.argv[2] || 'matthieu-1876';
  const ouvrage = getOuvrage(ouvrageId);

  const inputPath = path.join(__dirname, 'data', ouvrage.source_file);
  const outputPath = path.join(__dirname, 'data', `chunks_${ouvrage.id}.json`);

  console.log(`📖 ${ouvrage.titre}`);
  console.log(`   ${ouvrage.auteur} (${ouvrage.annee})${ouvrage.tome ? `, tome ${ouvrage.tome}` : ''}\n`);
  console.log('📖 Lecture du fichier source...');

  if (!fs.existsSync(inputPath)) {
    console.error(`❌ Fichier non trouvé: ${inputPath}`);
    console.log(`Veuillez placer le fichier "${ouvrage.source_file}" dans le dossier scripts/data/`);
    process.exit(1);
  }

  const rawText = fs.readFileSync(inputPath, 'utf-8');
  console.log(`   Taille: ${(rawText.length / 1024 / 1024).toFixed(2)} MB`);
  console.log(`   Lignes: ${rawText.split('\n').length}`);

  console.log('\n🧹 Nettoyage du texte...');
  const cleanedText = cleanText(rawText, ouvrage);
  console.log(`   Taille après nettoyage: ${(cleanedText.length / 1024 / 1024).toFixed(2)} MB`);
  console.log(`   Corrections OCR appliquées: ${ouvrage.ocr_fixes.length}`);

  console.log('\n✂️  Découpage en chunks...');
  const chunks = createChunks(cleanedText, ouvrage);
  console.log(`   Nombre de chunks: ${chunks.length}`);

  // Statistiques
  const chunkSizes = chunks.map(c => c.content.length);
  const avgSize = chunkSizes.reduce((a, b) => a + b, 0) / chunks.length;
  const minSize = Math.min(...chunkSizes);
  const maxSize = Math.max(...chunkSizes);

  console.log(`   Taille moyenne: ${avgSize.toFixed(0)} caractères`);
  console.log(`   Taille min: ${minSize} caractères`);
  console.log(`   Taille max: ${maxSize} caractères`);

  // Distribution par livre
  const parLivre = chunks.reduce((acc, c) => {
    acc[c.metadata.livre] = (acc[c.metadata.livre] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  console.log('\n📊 Distribution par livre:');
  for (const [livre, count] of Object.entries(parLivre)) {
    console.log(`   Livre ${livre}: ${count} chunks`);
  }

  console.log('\n💾 Sauvegarde...');
  fs.writeFileSync(outputPath, JSON.stringify(chunks, null, 2), 'utf-8');
  console.log(`   Fichier créé: ${outputPath}`);

  // Afficher un exemple
  console.log('\n📝 Exemple de chunk (premier):');
  console.log('---');
  console.log(JSON.stringify(chunks[0], null, 2).slice(0, 500) + '...');
  console.log('---');

  console.log('\n✅ Terminé!');
}

main().catch(console.error);
