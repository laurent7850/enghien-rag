export interface ChunkMetadata {
  livre: string;          // "I", "II", "III", "IV"
  livre_titre: string;    // "Histoire et généalogie"
  chapitre: string;       // "II", "III", etc.
  section?: string;       // "§ 1. — Bailli"
  page_debut: number;
  page_fin: number;
  chunk_index: number;
}

export interface Chunk {
  content: string;
  metadata: ChunkMetadata;
}

export interface SearchResult {
  id: number;
  content: string;
  metadata: ChunkMetadata;
  similarity: number;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  sources?: SearchResult[];  // Sources attachées aux réponses assistant
}

export interface ConversationState {
  messages: ChatMessage[];
  isLoading: boolean;
  filter?: {
    livre?: string;
  };
}

export interface ChatRequest {
  message: string;
  conversation_id?: string;
  filter?: {
    livre?: string;
    chapitre?: string;
  };
}

export interface SuggestionsResponse {
  suggestions: string[];
}
