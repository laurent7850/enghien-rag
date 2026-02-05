'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { MessageBubble } from './MessageBubble';
import { ChatInput } from './ChatInput';
import { SuggestionChips } from './SuggestionChips';
import { BookFilterSelect } from './BookFilterSelect';
import { LoadingIndicator } from './LoadingIndicator';
import { ChunkMetadata } from '@/lib/types';

interface SourceItem {
  id: number;
  metadata: ChunkMetadata;
  similarity: number;
  preview: string;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  sources?: SourceItem[];
}

export function ChatContainer() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [streamingSources, setStreamingSources] = useState<SourceItem[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [bookFilter, setBookFilter] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Charger les suggestions initiales
  useEffect(() => {
    fetch('/api/enghien/suggestions')
      .then((res) => res.json())
      .then((data) => setSuggestions(data.suggestions || []))
      .catch(console.error);
  }, []);

  // Scroll auto vers le bas
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  const sendMessage = useCallback(async (content: string) => {
    const userMessage: Message = { role: 'user', content };
    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);
    setStreamingContent('');
    setStreamingSources([]);

    try {
      const response = await fetch('/api/enghien/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: content,
          filter: bookFilter ? { livre: bookFilter } : undefined,
        }),
      });

      if (!response.ok) {
        throw new Error('Erreur de communication avec le serveur');
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('Pas de stream disponible');

      const decoder = new TextDecoder();
      let fullContent = '';
      let sources: SourceItem[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));

              if (data.type === 'sources') {
                sources = data.sources;
                setStreamingSources(sources);
              } else if (data.type === 'text') {
                fullContent += data.text;
                setStreamingContent(fullContent);
              } else if (data.type === 'error') {
                throw new Error(data.message);
              }
            } catch {
              // Ignorer les erreurs de parsing JSON
            }
          }
        }
      }

      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: fullContent, sources },
      ]);
      setStreamingContent('');
      setStreamingSources([]);

      fetch('/api/enghien/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
        .then((res) => res.json())
        .then((data) => setSuggestions(data.suggestions || []))
        .catch(console.error);
    } catch (error) {
      console.error('Erreur:', error);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: "Désolé, une erreur s'est produite. Veuillez réessayer.",
        },
      ]);
      setStreamingContent('');
    } finally {
      setIsLoading(false);
    }
  }, [bookFilter]);

  const handleSuggestionClick = (suggestion: string) => {
    sendMessage(suggestion);
  };

  const handleNewConversation = () => {
    setMessages([]);
    setStreamingContent('');
    setStreamingSources([]);
    fetch('/api/enghien/suggestions')
      .then((res) => res.json())
      .then((data) => setSuggestions(data.suggestions || []))
      .catch(console.error);
  };

  return (
    <div className="flex flex-col h-full bg-[#F5F0E6]">
      {/* Header avec style CRAE */}
      <header className="bg-[#722F37] text-white shadow-lg">
        <div className="max-w-4xl mx-auto px-3 sm:px-4 py-3 sm:py-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
              {/* Logo emblème */}
              <div className="w-10 h-10 sm:w-14 sm:h-14 flex-shrink-0 flex items-center justify-center bg-[#5A252C] rounded-full border-2 border-[#C9A961] shadow-inner">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 sm:h-8 sm:w-8 text-[#C9A961]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
              <div className="min-w-0">
                <h1 className="text-base sm:text-xl font-bold tracking-wide truncate" style={{ fontFamily: 'Georgia, serif' }}>
                  Histoire d&apos;Enghien
                </h1>
                <p className="text-xs sm:text-sm text-[#DBC48A] italic truncate">
                  Ernest Matthieu (1876)
                </p>
              </div>
            </div>
            {messages.length > 0 && (
              <button
                onClick={handleNewConversation}
                disabled={isLoading}
                className="flex-shrink-0 flex items-center gap-1 sm:gap-2 px-2 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm bg-[#5A252C] hover:bg-[#4A1F24] text-[#DBC48A] hover:text-white rounded-lg transition-all duration-200 border border-[#C9A961]/30 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Nouvelle conversation"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
                <span className="hidden sm:inline">Accueil</span>
              </button>
            )}
          </div>
        </div>
        {/* Ligne décorative dorée */}
        <div className="h-1 bg-gradient-to-r from-transparent via-[#C9A961] to-transparent" />
      </header>

      {/* Zone de messages */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto py-4 sm:py-6">
          {messages.length === 0 && !isLoading ? (
            <div className="px-3 sm:px-4 py-6 sm:py-12 text-center">
              {/* Emblème central */}
              <div className="relative w-20 h-20 sm:w-28 sm:h-28 mx-auto mb-4 sm:mb-6">
                <div className="absolute inset-0 bg-[#722F37] rounded-full border-3 sm:border-4 border-[#C9A961] shadow-xl" />
                <div className="absolute inset-1.5 sm:inset-2 bg-[#5A252C] rounded-full flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 sm:h-14 sm:w-14 text-[#C9A961]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                </div>
              </div>

              <h2 className="text-xl sm:text-2xl font-bold text-[#722F37] mb-2 sm:mb-3" style={{ fontFamily: 'Georgia, serif' }}>
                Bienvenue
              </h2>
              <p className="text-sm sm:text-base text-[#5A524C] mb-2 max-w-lg mx-auto leading-relaxed px-2">
                Explorez l&apos;histoire de la ville d&apos;Enghien à travers les écrits
                d&apos;Ernest Matthieu.
              </p>
              <p className="text-xs sm:text-sm text-[#7A5C4A] mb-6 sm:mb-8 italic">
                &laquo; Histoire de la ville d&apos;Enghien &raquo; — 1876
              </p>

              {/* Séparateur décoratif */}
              <div className="flex items-center justify-center gap-3 sm:gap-4 mb-6 sm:mb-8">
                <div className="w-12 sm:w-16 h-px bg-[#C9A961]" />
                <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-[#722F37] rotate-45" />
                <div className="w-12 sm:w-16 h-px bg-[#C9A961]" />
              </div>

              <p className="text-xs sm:text-sm text-[#5C4033] mb-3 sm:mb-4 font-medium">
                Posez une question ou choisissez un sujet :
              </p>
              <SuggestionChips
                suggestions={suggestions}
                onSelect={handleSuggestionClick}
                disabled={isLoading}
              />
            </div>
          ) : (
            <div className="px-2 sm:px-4">
              {messages.map((msg, idx) => (
                <MessageBubble
                  key={idx}
                  role={msg.role}
                  content={msg.content}
                  sources={msg.sources}
                />
              ))}

              {streamingContent && (
                <MessageBubble
                  role="assistant"
                  content={streamingContent}
                  sources={streamingSources}
                  isStreaming
                />
              )}

              {isLoading && !streamingContent && <LoadingIndicator />}

              {!isLoading && messages.length > 0 && suggestions.length > 0 && (
                <div className="mt-4 sm:mt-6 pt-3 sm:pt-4 border-t border-[#C9A961]/30">
                  <p className="text-xs text-[#7A5C4A] mb-2 sm:mb-3 px-1 font-medium uppercase tracking-wide">
                    Continuer l&apos;exploration :
                  </p>
                  <SuggestionChips
                    suggestions={suggestions}
                    onSelect={handleSuggestionClick}
                    disabled={isLoading}
                  />
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
      </div>

      {/* Footer avec input */}
      <div className="bg-white border-t-2 border-[#722F37]/20 shadow-inner">
        <div className="max-w-4xl mx-auto">
          <div className="px-2 sm:px-4 py-2 flex items-center justify-between border-b border-[#EDE5D4]">
            <span className="text-xs text-[#7A5C4A] italic hidden md:block">
              Cercle Royal Archéologique d&apos;Enghien
            </span>
            <BookFilterSelect
              value={bookFilter}
              onChange={setBookFilter}
              disabled={isLoading}
            />
          </div>
          <ChatInput onSend={sendMessage} disabled={isLoading} />
        </div>
      </div>
    </div>
  );
}
