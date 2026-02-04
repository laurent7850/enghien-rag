'use client';

import { useState } from 'react';
import { ChunkMetadata } from '@/lib/types';

interface SourceItem {
  id: number;
  metadata: ChunkMetadata;
  similarity: number;
  preview: string;
}

interface SourcesPanelProps {
  sources: SourceItem[];
}

export function SourcesPanel({ sources }: SourcesPanelProps) {
  const [expandedId, setExpandedId] = useState<number | null>(null);

  if (sources.length === 0) return null;

  // Dédupliquer et trier par pertinence
  const uniqueSources = sources.reduce((acc, source) => {
    const key = `${source.metadata.livre}-${source.metadata.chapitre}-${source.metadata.page_debut}`;
    if (!acc.has(key)) {
      acc.set(key, source);
    }
    return acc;
  }, new Map<string, SourceItem>());

  const sortedSources = Array.from(uniqueSources.values()).sort(
    (a, b) => b.similarity - a.similarity
  );

  return (
    <div className="mt-3 pt-3 border-t border-stone-200">
      <p className="text-xs font-medium text-stone-500 mb-2 flex items-center gap-1">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
        Sources ({sortedSources.length})
      </p>
      <div className="space-y-1">
        {sortedSources.map((source) => {
          const meta = source.metadata;
          const isExpanded = expandedId === source.id;

          const location = [
            `Livre ${meta.livre}`,
            meta.chapitre ? `Chap. ${meta.chapitre}` : null,
            meta.page_debut
              ? meta.page_debut === meta.page_fin
                ? `p. ${meta.page_debut}`
                : `p. ${meta.page_debut}-${meta.page_fin}`
              : null,
          ]
            .filter(Boolean)
            .join(', ');

          return (
            <div key={source.id} className="text-xs">
              <button
                onClick={() => setExpandedId(isExpanded ? null : source.id)}
                className="
                  w-full text-left px-2 py-1.5
                  bg-stone-50 hover:bg-amber-50
                  rounded border border-stone-200 hover:border-amber-200
                  transition-colors duration-150
                  flex items-center justify-between gap-2
                "
              >
                <span className="text-stone-700">{location}</span>
                <span className="text-stone-400 text-[10px]">
                  {(source.similarity * 100).toFixed(0)}%
                </span>
              </button>
              {isExpanded && (
                <div className="mt-1 p-2 bg-amber-50 rounded border border-amber-100 text-stone-600 text-xs leading-relaxed">
                  {meta.section && (
                    <p className="font-medium text-amber-700 mb-1">{meta.section}</p>
                  )}
                  <p className="italic">&quot;{source.preview}&quot;</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
