import { NextRequest } from 'next/server';
import OpenAI from 'openai';
import {
  searchDocuments,
  buildContextPrompt,
  buildUserMessage,
  SYSTEM_PROMPT,
} from '@/lib/rag';
import { ChatRequest, SearchResult } from '@/lib/types';

// Client OpenRouter (compatible API OpenAI)
function getOpenRouter(): OpenAI {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not set');
  }

  return new OpenAI({
    apiKey,
    baseURL: 'https://openrouter.ai/api/v1',
    defaultHeaders: {
      'HTTP-Referer': process.env.SITE_URL || 'http://localhost:3000',
      'X-Title': 'Enghien RAG Chat',
    },
  });
}

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body: ChatRequest = await request.json();
    const { message, filter } = body;

    if (!message || typeof message !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Message requis' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 1. Recherche RAG
    const searchResults = await searchDocuments(message, {
      threshold: 0.35,
      count: 8,
      filter,
    });

    // 2. Construire le contexte
    const context = buildContextPrompt(searchResults);
    const userMessage = buildUserMessage(message, context);

    // 3. Préparer les métadonnées des sources pour le client
    const sourcesMetadata = searchResults.map((r: SearchResult) => ({
      id: r.id,
      metadata: r.metadata,
      similarity: r.similarity,
      preview: r.content.slice(0, 200) + (r.content.length > 200 ? '...' : ''),
    }));

    // 4. Créer un stream avec Claude via OpenRouter
    const encoder = new TextEncoder();
    const openrouter = getOpenRouter();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Envoyer les sources d'abord
          const sourcesEvent = `data: ${JSON.stringify({ type: 'sources', sources: sourcesMetadata })}\n\n`;
          controller.enqueue(encoder.encode(sourcesEvent));

          // Stream via OpenRouter (Claude)
          const chatStream = await openrouter.chat.completions.create({
            model: 'anthropic/claude-sonnet-4',
            max_tokens: 2048,
            stream: true,
            messages: [
              {
                role: 'system',
                content: SYSTEM_PROMPT,
              },
              {
                role: 'user',
                content: userMessage,
              },
            ],
          });

          for await (const chunk of chatStream) {
            const delta = chunk.choices[0]?.delta?.content;
            if (delta) {
              const textEvent = `data: ${JSON.stringify({ type: 'text', text: delta })}\n\n`;
              controller.enqueue(encoder.encode(textEvent));
            }
          }

          // Signal de fin
          const doneEvent = `data: ${JSON.stringify({ type: 'done' })}\n\n`;
          controller.enqueue(encoder.encode(doneEvent));
          controller.close();
        } catch (error) {
          console.error('Erreur streaming OpenRouter:', error);
          const errorEvent = `data: ${JSON.stringify({ type: 'error', message: 'Erreur lors de la génération de la réponse' })}\n\n`;
          controller.enqueue(encoder.encode(errorEvent));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Erreur API chat:', error);
    return new Response(
      JSON.stringify({ error: 'Erreur serveur' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
