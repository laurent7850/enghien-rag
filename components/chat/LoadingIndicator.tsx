'use client';

export function LoadingIndicator() {
  return (
    <div className="flex items-center gap-2 px-2 sm:px-4 py-3">
      <div className="flex gap-1">
        <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-[#722F37] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
        <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-[#722F37] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
        <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-[#722F37] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
      <span className="text-xs sm:text-sm text-[#5C4033] ml-1 sm:ml-2 italic" style={{ fontFamily: 'Georgia, serif' }}>
        Consultation des archives...
      </span>
    </div>
  );
}
