import OpenAI from 'openai';

let openrouterInstance: OpenAI | null = null;

function getOpenRouter(): OpenAI {
  if (openrouterInstance) {
    return openrouterInstance;
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not set');
  }

  // OpenRouter est compatible avec l'API OpenAI
  openrouterInstance = new OpenAI({
    apiKey,
    baseURL: 'https://openrouter.ai/api/v1',
    defaultHeaders: {
      'HTTP-Referer': process.env.SITE_URL || 'http://localhost:3000',
      'X-Title': 'Enghien RAG Chat',
    },
  });

  return openrouterInstance;
}

/**
 * Génère un embedding pour un texte donné
 * Utilise OpenRouter avec le modèle text-embedding-3-small
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const client = getOpenRouter();
  const response = await client.embeddings.create({
    model: 'openai/text-embedding-3-small',
    input: text,
  });

  return response.data[0].embedding;
}

/**
 * Génère des embeddings pour plusieurs textes en batch
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const client = getOpenRouter();
  const response = await client.embeddings.create({
    model: 'openai/text-embedding-3-small',
    input: texts,
  });

  return response.data.map(d => d.embedding);
}
