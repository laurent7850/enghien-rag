'use client';

interface BookFilterSelectProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

const LIVRE_OPTIONS = [
  { value: '', label: 'Tout le livre', shortLabel: 'Tout' },
  { value: 'I', label: 'Livre I — Histoire et généalogie', shortLabel: 'Livre I' },
  { value: 'II', label: 'Livre II — Organisation administrative', shortLabel: 'Livre II' },
  { value: 'III', label: 'Livre III — Culte et Bienfaisance', shortLabel: 'Livre III' },
  { value: 'IV', label: 'Livre IV — Institutions scientifiques', shortLabel: 'Livre IV' },
];

export function BookFilterSelect({ value, onChange, disabled }: BookFilterSelectProps) {
  return (
    <div className="flex items-center gap-1 sm:gap-2 w-full sm:w-auto justify-end">
      <label htmlFor="book-filter" className="text-xs sm:text-sm text-[#5C4033] font-medium whitespace-nowrap">
        Filtrer :
      </label>
      <select
        id="book-filter"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="
          px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm
          bg-white border border-[#C9A961]/50
          rounded-lg
          text-[#2D2926]
          focus:outline-none focus:ring-2 focus:ring-[#722F37] focus:border-[#722F37]
          disabled:opacity-50 disabled:cursor-not-allowed
          cursor-pointer
          max-w-[180px] sm:max-w-none
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
