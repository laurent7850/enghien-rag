import * as fs from 'fs';
import * as path from 'path';
import { Pool } from 'pg';
import OpenAI from 'openai';
import * as dotenv from 'dotenv';

// Charger les variables d'environnement
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

interface ChunkMetadata {
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
  embeddings: number[][]
): Promise<void> {
  const client = await pool.connect();
  try {
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const embedding = embeddings[i];
      const embeddingStr = `[${embedding.join(',')}]`;

      await client.query(
        `INSERT INTO enghien_documents (content, embedding, metadata)
         VALUES ($1, $2::vector, $3)`,
        [chunk.content, embeddingStr, JSON.stringify(chunk.metadata)]
      );
    }
  } finally {
    client.release();
  }
}

// Vider la table existante
async function clearTable(): Promise<void> {
  await pool.query('TRUNCATE TABLE enghien_documents RESTART IDENTITY');
}

async function main() {
  const chunksPath = path.join(__dirname, 'data', 'chunks.json');

  console.log('📖 Histoire de la ville d\'Enghien - Ingestion RAG');
  console.log('='.repeat(50));

  // Vérifier que le fichier chunks existe
  if (!fs.existsSync(chunksPath)) {
    console.error(`❌ Fichier chunks.json non trouvé!`);
    console.error('   Exécutez d\'abord: npx tsx scripts/01_clean_and_chunk.ts');
    process.exit(1);
  }

  // Charger les chunks
  console.log('\n📂 Chargement des chunks...');
  const chunks: Chunk[] = JSON.parse(fs.readFileSync(chunksPath, 'utf-8'));
  console.log(`   ${chunks.length} chunks chargés`);

  // Vider la table existante
  console.log('\n🗑️  Vidage de la table existante...');
  await clearTable();
  console.log('   Table vidée');

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
      await insertBatch(batch, embeddings);

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

  // Vérification finale
  console.log('\n🔍 Vérification...');
  const countResult = await pool.query('SELECT COUNT(*) FROM enghien_documents');
  console.log(`   ${countResult.rows[0].count} documents dans la base`);

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
