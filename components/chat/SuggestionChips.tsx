'use client';

interface SuggestionChipsProps {
  suggestions: string[];
  onSelect: (suggestion: string) => void;
  disabled?: boolean;
}

export function SuggestionChips({ suggestions, onSelect, disabled }: SuggestionChipsProps) {
  if (suggestions.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 justify-center">
      {suggestions.map((suggestion, index) => (
        <button
          key={index}
          onClick={() => onSelect(suggestion)}
          disabled={disabled}
          className="
            px-4 py-2.5 text-sm
            bg-white hover:bg-[#722F37]
            text-[#5C4033] hover:text-white
            rounded-lg border border-[#C9A961] hover:border-[#722F37]
            transition-all duration-200
            disabled:opacity-50 disabled:cursor-not-allowed
            text-left shadow-sm hover:shadow-md
          "
          style={{ fontFamily: 'Georgia, serif' }}
        >
          {suggestion}
        </button>
      ))}
    </div>
  );
}
