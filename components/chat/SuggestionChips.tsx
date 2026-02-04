'use client';

interface SuggestionChipsProps {
  suggestions: string[];
  onSelect: (suggestion: string) => void;
  disabled?: boolean;
}

export function SuggestionChips({ suggestions, onSelect, disabled }: SuggestionChipsProps) {
  if (suggestions.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 px-4 py-3">
      {suggestions.map((suggestion, index) => (
        <button
          key={index}
          onClick={() => onSelect(suggestion)}
          disabled={disabled}
          className="
            px-3 py-2 text-sm
            bg-stone-100 hover:bg-amber-100
            text-stone-700 hover:text-amber-800
            rounded-lg border border-stone-200 hover:border-amber-300
            transition-colors duration-200
            disabled:opacity-50 disabled:cursor-not-allowed
            text-left
          "
        >
          {suggestion}
        </button>
      ))}
    </div>
  );
}
