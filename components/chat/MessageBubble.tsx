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
            ? 'bg-[#722F37] text-white rounded-br-md shadow-md'
            : 'bg-white border border-[#C9A961]/40 text-[#2D2926] rounded-bl-md shadow-sm'
          }
        `}
      >
        {isUser ? (
          <p className="text-sm leading-relaxed">{content}</p>
        ) : (
          <div className="prose prose-sm max-w-none">
            <ReactMarkdown
              components={{
                p: ({ children }) => (
                  <p className="mb-2 last:mb-0 leading-relaxed text-[#2D2926]">{children}</p>
                ),
                ul: ({ children }) => (
                  <ul className="list-disc pl-4 mb-2 space-y-1 text-[#2D2926]">{children}</ul>
                ),
                ol: ({ children }) => (
                  <ol className="list-decimal pl-4 mb-2 space-y-1 text-[#2D2926]">{children}</ol>
                ),
                li: ({ children }) => (
                  <li className="text-sm">{children}</li>
                ),
                strong: ({ children }) => (
                  <strong className="font-semibold text-[#722F37]">{children}</strong>
                ),
                em: ({ children }) => (
                  <em className="italic text-[#5C4033]">{children}</em>
                ),
                h3: ({ children }) => (
                  <h3 className="font-semibold text-[#722F37] mt-3 mb-1" style={{ fontFamily: 'Georgia, serif' }}>{children}</h3>
                ),
                blockquote: ({ children }) => (
                  <blockquote className="border-l-3 border-[#C9A961] pl-3 italic text-[#5C4033] my-2">{children}</blockquote>
                ),
              }}
            >
              {content}
            </ReactMarkdown>
            {isStreaming && (
              <span className="inline-block w-2 h-4 bg-[#722F37] animate-pulse ml-0.5" />
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
