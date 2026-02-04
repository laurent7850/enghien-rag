'use client';

import ReactMarkdown from 'react-markdown';
import { SourcesPanel } from './SourcesPanel';
import { ChunkMetadata } from '@/lib/types';

interface SourceItem {
  id: number;
  metadata: ChunkMetadata;
  similarity: number;
  preview: string;
}

interface MessageBubbleProps {
  role: 'user' | 'assistant';
  content: string;
  sources?: SourceItem[];
  isStreaming?: boolean;
}

export function MessageBubble({ role, content, sources, isStreaming }: MessageBubbleProps) {
  const isUser = role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div
        className={`
          max-w-[85%] md:max-w-[75%] px-4 py-3 rounded-2xl
          ${isUser
            ? 'bg-amber-100 text-stone-800 rounded-br-md'
            : 'bg-white border border-stone-200 text-stone-700 rounded-bl-md shadow-sm'
          }
        `}
      >
        {isUser ? (
          <p className="text-sm leading-relaxed">{content}</p>
        ) : (
          <div className="prose prose-sm prose-stone max-w-none">
            <ReactMarkdown
              components={{
                p: ({ children }) => (
                  <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>
                ),
                ul: ({ children }) => (
                  <ul className="list-disc pl-4 mb-2 space-y-1">{children}</ul>
                ),
                ol: ({ children }) => (
                  <ol className="list-decimal pl-4 mb-2 space-y-1">{children}</ol>
                ),
                li: ({ children }) => (
                  <li className="text-sm">{children}</li>
                ),
                strong: ({ children }) => (
                  <strong className="font-semibold text-stone-800">{children}</strong>
                ),
                em: ({ children }) => (
                  <em className="italic">{children}</em>
                ),
                h3: ({ children }) => (
                  <h3 className="font-semibold text-stone-800 mt-3 mb-1">{children}</h3>
                ),
              }}
            >
              {content}
            </ReactMarkdown>
            {isStreaming && (
              <span className="inline-block w-2 h-4 bg-amber-500 animate-pulse ml-0.5" />
            )}
          </div>
        )}
        {!isUser && sources && sources.length > 0 && !isStreaming && (
          <SourcesPanel sources={sources} />
        )}
      </div>
    </div>
  );
}
