import { Pool } from 'pg';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Charger les variables d'environnement
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('❌ DATABASE_URL manquante!');
  process.exit(1);
}

const pool = new Pool({ connectionString: databaseUrl });

async function main() {
  console.log('🔌 Connexion à PostgreSQL...');

  const client = await pool.connect();

  try {
    // Activer l'extension pgvector
    console.log('📦 Activation de l\'extension pgvector...');
    await client.query('CREATE EXTENSION IF NOT EXISTS vector');

    // Supprimer les tables existantes
    console.log('🗑️  Suppression des tables existantes...');
    await client.query('DROP TABLE IF EXISTS enghien_documents CASCADE');
    await client.query('DROP TABLE IF EXISTS enghien_conversations CASCADE');

    // Créer la table principale
    console.log('📊 Création de la table enghien_documents...');
    await client.query(`
      CREATE TABLE enghien_documents (
        id BIGSERIAL PRIMARY KEY,
        content TEXT NOT NULL,
        embedding VECTOR(1536),
        metadata JSONB NOT NULL DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Index pour filtrage par métadonnées
    console.log('🔍 Création des index...');
    await client.query(`
      CREATE INDEX enghien_documents_metadata_idx
        ON enghien_documents
        USING GIN (metadata)
    `);

    await client.query(`
      CREATE INDEX enghien_documents_livre_idx
        ON enghien_documents
        ((metadata->>'livre'))
    `);

    // Table des conversations
    console.log('💬 Création de la table enghien_conversations...');
    await client.query(`
      CREATE TABLE enghien_conversations (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        messages JSONB NOT NULL DEFAULT '[]',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    console.log('✅ Base de données initialisée avec succès!');

  } finally {
    client.release();
  }

  await pool.end();
}

main().catch(async error => {
  console.error('❌ Erreur:', error);
  await pool.end();
  process.exit(1);
});
