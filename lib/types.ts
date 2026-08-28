export interface ChunkMetadata {
  ouvrage: string;         // "matthieu-1876", "reygaerts-1998-t1"
  ouvrage_titre: string;   // "Histoire de la ville d'Enghien"
  ouvrage_court: string;   // "Matthieu 1876" — utilisé dans les citations
  ouvrage_auteur: string;  // "Ernest Matthieu"
  ouvrage_annee: number;   // 1876
  tome?: number;           // 1, 2… pour les ouvrages en plusieurs volumes
  publie?: boolean;        // false = ingéré mais masqué des visiteurs
  livre: string;           // "I", "II", "III", "IV"
  livre_titre: string;     // "Histoire et généalogie"
  chapitre: string;        // "II", "III", etc.
  section?: string;        // "§ 1. — Bailli"
  page_debut: number;
  page_fin: number;
  chunk_index: number;
}

/** Entrée du catalogue, telle que servie par /api/enghien/ouvrages. */
export interface Ouvrage {
  id: string;
  titre: string;
  titre_court: string;
  auteur: string;
  annee: number;
  tome?: number;
  livres: Record<string, string>;
  droits?: string;
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
  filter?: SearchFilter;
}

export interface SearchFilter {
  ouvrage?: string;
  livre?: string;
  chapitre?: string;
}

export interface ChatRequest {
  message: string;
  conversation_id?: string;
  filter?: SearchFilter;
}

export interface SuggestionsResponse {
  suggestions: string[];
}
