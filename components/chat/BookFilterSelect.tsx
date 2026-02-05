'use client';

interface BookFilterSelectProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

const LIVRE_OPTIONS = [
  { value: '', label: 'Tout le livre' },
  { value: 'I', label: 'Livre I — Histoire et généalogie' },
  { value: 'II', label: 'Livre II — Organisation administrative' },
  { value: 'III', label: 'Livre III — Culte et Bienfaisance' },
  { value: 'IV', label: 'Livre IV — Institutions scientifiques' },
];

export function BookFilterSelect({ value, onChange, disabled }: BookFilterSelectProps) {
  return (
    <div className="flex items-center gap-2">
      <label htmlFor="book-filter" className="text-sm text-[#5C4033] font-medium">
        Filtrer :
      </label>
      <select
        id="book-filter"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="
          px-3 py-1.5 text-sm
          bg-white border border-[#C9A961]/50
          rounded-lg
          text-[#2D2926]
          focus:outline-none focus:ring-2 focus:ring-[#722F37] focus:border-[#722F37]
          disabled:opacity-50 disabled:cursor-not-allowed
          cursor-pointer
        "
        style={{ fontFamily: 'Georgia, serif' }}
      >
        {LIVRE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
