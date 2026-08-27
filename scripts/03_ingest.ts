import * as fs from 'fs';
import * as path from 'path';
import { Pool } from 'pg';
import OpenAI from 'openai';
import * as dotenv from 'dotenv';
import { getOuvrage } from './ouvrages';

// Charger les variables d'environnement
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

interface ChunkMetadata {
  ouvrage: string;
  ouvrage_titre: string;
  ouvrage_court: string;
  ouvrage_auteur: string;
  ouvrage_annee: number;
  tome?: number;
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

// Configuration
const BATCH_SIZE = 20; // Nombre de chunks par batch d'embedding
const RATE_LIMIT_DELAY = 500; // Délai entre les batches (ms)
const MAX_RETRIES = 3;
const RETRY_DELAY = 5000; // Délai avant retry (ms)

// Initialisation des clients
const databaseUrl = process.env.DATABASE_URL;
const openrouterApiKey = process.env.OPENROUTER_API_KEY;

if (!databaseUrl || !openrouterApiKey) {
  console.error('❌ Variables d\'environnement manquantes!');
  console.error('   Vérifiez que .env.local contient:');
  console.error('   - DATABASE_URL');
  console.error('   - OPENROUTER_API_KEY');
  process.exit(1);
}

const pool = new Pool({ connectionString: databaseUrl });

// OpenRouter (compatible API OpenAI)
const openrouter = new OpenAI({
  apiKey: openrouterApiKey,
  baseURL: 'https://openrouter.ai/api/v1',
  defaultHeaders: {
    'HTTP-Referer': 'http://localhost:3000',
    'X-Title': 'Enghien RAG Ingestion',
  },
});

// Fonction pour attendre
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Barre de progression simple
function progressBar(current: number, total: number, width = 30): string {
  const percent = current / total;
  const filled = Math.round(width * percent);
  const empty = width - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  return `[${bar}] ${(percent * 100).toFixed(1)}% (${current}/${total})`;
}

// Générer les embeddings avec retry via OpenRouter
async function generateEmbeddings(texts: string[], retries = 0): Promise<number[][]> {
  try {
    const response = await openrouter.embeddings.create({
      model: 'openai/text-embedding-3-small',
      input: texts,
    });

    return response.data.map(d => d.embedding);
  } catch (error: unknown) {
    if (retries < MAX_RETRIES) {
      const err = error as { status?: number; message?: string };
      console.warn(`\n⚠️  Erreur API OpenRouter, retry ${retries + 1}/${MAX_RETRIES}...`);
      if (err.status === 429) {
        // Rate limit - attendre plus longtemps
        await sleep(RETRY_DELAY * (retries + 2));
      } else {
        await sleep(RETRY_DELAY);
      }
      return generateEmbeddings(texts, retries + 1);
    }
    throw error;
  }
}

// Insérer un batch dans PostgreSQL
async function insertBatch(
  chunks: Chunk[],
  embeddings: number[][],
  publie: boolean
): Promise<void> {
  const client = await pool.connect();
  try {
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const embedding = embeddings[i];
      const embeddingStr = `[${embedding.join(',')}]`;

      // Le statut de publication est porté par chaque chunk : la recherche
      // filtre dessus sans jointure.
      const metadata = { ...chunk.metadata, publie };

      await client.query(
        `INSERT INTO enghien_documents (content, embedding, metadata)
         VALUES ($1, $2::vector, $3)`,
        [chunk.content, embeddingStr, JSON.stringify(metadata)]
      );
    }
  } finally {
    client.release();
  }
}

/**
 * Statut de publication déclaré dans le catalogue.
 *
 * Il fait autorité sur le fichier de chunks : réingérer un ouvrage déjà en
 * ligne doit le laisser en ligne, et un ouvrage nouveau reste masqué tant
 * qu'il n'a pas été validé.
 */
async function estPublie(ouvrageId: string): Promise<boolean> {
  const result = await pool.query(
    'SELECT publie FROM enghien_ouvrages WHERE id = $1',
    [ouvrageId]
  );
  if (result.rowCount === 0) {
    throw new Error(
      `Ouvrage "${ouvrageId}" absent de enghien_ouvrages. ` +
        'Jouez d\'abord scripts/04_add_ouvrage.sql.'
    );
  }
  return result.rows[0].publie === true;
}

// Purge SELECTIVE : ne retire que les chunks de l'ouvrage réingéré.
//
// L'ancien TRUNCATE vidait toute la table : réingérer un livre effaçait tous
// les autres, et laissait le site en production sans aucune source le temps de
// la réingestion.
async function clearOuvrage(ouvrageId: string): Promise<number> {
  const result = await pool.query(
    `DELETE FROM enghien_documents WHERE metadata->>'ouvrage' = $1`,
    [ouvrageId]
  );
  return result.rowCount ?? 0;
}

async function main() {
  const ouvrageId = process.argv[2] || 'matthieu-1876';
  const ouvrage = getOuvrage(ouvrageId);
  const chunksPath = path.join(__dirname, 'data', `chunks_${ouvrage.id}.json`);

  console.log(`📖 ${ouvrage.titre} — Ingestion RAG`);
  console.log(`   ${ouvrage.auteur} (${ouvrage.annee})${ouvrage.tome ? `, tome ${ouvrage.tome}` : ''}`);
  console.log('='.repeat(50));

  // Vérifier que le fichier chunks existe
  if (!fs.existsSync(chunksPath)) {
    console.error(`❌ Fichier non trouvé: ${chunksPath}`);
    console.error(`   Exécutez d'abord: npx tsx scripts/01_clean_and_chunk.ts ${ouvrage.id}`);
    process.exit(1);
  }

  // Charger les chunks
  console.log('\n📂 Chargement des chunks...');
  const chunks: Chunk[] = JSON.parse(fs.readFileSync(chunksPath, 'utf-8'));
  console.log(`   ${chunks.length} chunks chargés`);

  // Garde-fou : un fichier de chunks ne doit contenir que l'ouvrage demandé,
  // sous peine de purger un ouvrage et d'en réinsérer un autre à sa place.
  const intrus = chunks.filter((c) => c.metadata.ouvrage !== ouvrage.id);
  if (intrus.length > 0) {
    console.error(`❌ ${intrus.length} chunks n'appartiennent pas à "${ouvrage.id}".`);
    console.error(`   Premier intrus: ${intrus[0].metadata.ouvrage}`);
    process.exit(1);
  }

  // Purge sélective du seul ouvrage réingéré
  const publie = await estPublie(ouvrage.id);
  console.log(`   Statut de publication: ${publie ? 'PUBLIÉ (visible des visiteurs)' : 'non publié (masqué)'}`);

  console.log(`\n🗑️  Purge des chunks existants de "${ouvrage.id}"...`);
  const supprimes = await clearOuvrage(ouvrage.id);
  console.log(`   ${supprimes} chunks supprimés (les autres ouvrages sont intacts)`);

  // Traitement par batches
  console.log(`\n🚀 Ingestion en cours (batches de ${BATCH_SIZE})...`);
  const totalBatches = Math.ceil(chunks.length / BATCH_SIZE);
  let processedChunks = 0;

  const startTime = Date.now();

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const texts = batch.map(c => c.content);

    // Afficher la progression
    process.stdout.write(`\r   ${progressBar(processedChunks, chunks.length)} Batch ${batchNum}/${totalBatches}`);

    try {
      // Générer les embeddings
      const embeddings = await generateEmbeddings(texts);

      // Insérer dans PostgreSQL
      await insertBatch(batch, embeddings, publie);

      processedChunks += batch.length;

      // Rate limiting
      if (i + BATCH_SIZE < chunks.length) {
        await sleep(RATE_LIMIT_DELAY);
      }
    } catch (error) {
      console.error(`\n❌ Erreur au batch ${batchNum}:`, error);
      console.error(`   Chunks ${i} à ${i + batch.length - 1}`);
      throw error;
    }
  }

  const elapsed = (Date.now() - startTime) / 1000;

  console.log(`\r   ${progressBar(chunks.length, chunks.length)}`);
  console.log(`\n✅ Ingestion terminée!`);
  console.log(`   - ${chunks.length} chunks insérés`);
  console.log(`   - Temps: ${elapsed.toFixed(1)} secondes`);
  console.log(`   - Vitesse: ${(chunks.length / elapsed).toFixed(1)} chunks/s`);

  // Vérification finale : état du corpus complet, ouvrage par ouvrage, pour
  // confirmer d'un coup d'œil qu'aucun autre livre n'a été touché.
  console.log('\n🔍 État du corpus...');
  const parOuvrage = await pool.query(`
    SELECT
      metadata->>'ouvrage' AS ouvrage,
      metadata->>'publie'  AS publie,
      COUNT(*)             AS chunks
    FROM enghien_documents
    GROUP BY 1, 2
    ORDER BY 1
  `);
  for (const row of parOuvrage.rows) {
    const statut = row.publie === 'true' ? 'publié' : 'non publié';
    console.log(`   ${row.ouvrage ?? '(sans ouvrage)'} : ${row.chunks} chunks — ${statut}`);
  }

  // Test de recherche rapide
  console.log('\n🧪 Test de recherche...');
  const testQuery = 'seigneurs d\'Enghien';
  const testEmbedding = (await generateEmbeddings([testQuery]))[0];
  const embeddingStr = `[${testEmbedding.join(',')}]`;

  const testResults = await pool.query(`
    SELECT
      id,
      metadata,
      1 - (embedding <=> $1::vector) AS similarity
    FROM enghien_documents
    WHERE 1 - (embedding <=> $1::vector) > 0.3
    ORDER BY embedding <=> $1::vector
    LIMIT 3
  `, [embeddingStr]);

  console.log(`   Requête: "${testQuery}"`);
  console.log(`   ${testResults.rows.length} résultats trouvés`);
  if (testResults.rows.length > 0) {
    const best = testResults.rows[0];
    console.log(`   Meilleure similarité: ${(best.similarity * 100).toFixed(1)}%`);
    console.log(`   Livre ${best.metadata.livre}, Chapitre ${best.metadata.chapitre}`);
  }

  console.log('\n🎉 Tout est prêt!');

  await pool.end();
}

main().catch(async error => {
  console.error('\n💥 Erreur fatale:', error);
  await pool.end();
  process.exit(1);
});
