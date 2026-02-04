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
    // Ajouter le message utilisateur
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

      // Finaliser le message
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: fullContent, sources },
      ]);
      setStreamingContent('');
      setStreamingSources([]);

      // Charger de nouvelles suggestions
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

  return (
    <div className="flex flex-col h-full bg-[#faf8f5]">
      {/* Header */}
      <header className="px-4 py-4 bg-white border-b border-stone-200 shadow-sm">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
              <span className="text-xl">🏰</span>
            </div>
            <div>
              <h1 className="text-lg font-semibold text-stone-800">
                Histoire d&apos;Enghien
              </h1>
              <p className="text-xs text-stone-500">
                Interrogez le livre d&apos;Ernest Matthieu (1876)
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto py-4">
          {messages.length === 0 && !isLoading ? (
            <div className="px-4 py-8 text-center">
              <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">📚</span>
              </div>
              <h2 className="text-xl font-semibold text-stone-700 mb-2">
                Bienvenue !
              </h2>
              <p className="text-stone-500 text-sm mb-6 max-w-md mx-auto">
                Posez-moi des questions sur l&apos;histoire de la ville d&apos;Enghien.
                Je m&apos;appuie sur le livre d&apos;Ernest Matthieu publié en 1876.
              </p>
              <SuggestionChips
                suggestions={suggestions}
                onSelect={handleSuggestionClick}
                disabled={isLoading}
              />
            </div>
          ) : (
            <div className="px-4">
              {messages.map((msg, idx) => (
                <MessageBubble
                  key={idx}
                  role={msg.role}
                  content={msg.content}
                  sources={msg.sources}
                />
              ))}

              {/* Message en cours de streaming */}
              {streamingContent && (
                <MessageBubble
                  role="assistant"
                  content={streamingContent}
                  sources={streamingSources}
                  isStreaming
                />
              )}

              {/* Loading */}
              {isLoading && !streamingContent && <LoadingIndicator />}

              {/* Suggestions après réponse */}
              {!isLoading && messages.length > 0 && suggestions.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs text-stone-500 mb-2 px-1">
                    Questions suggérées :
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

      {/* Footer */}
      <div className="border-t border-stone-200 bg-white">
        <div className="max-w-3xl mx-auto">
          <div className="px-4 py-2 flex justify-end">
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
