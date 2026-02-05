'use client';

import { useState, useRef, useEffect } from 'react';

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function ChatInput({ onSend, disabled, placeholder = "Posez votre question sur l'histoire d'Enghien..." }: ChatInputProps) {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`;
    }
  }, [input]);

  const handleSubmit = () => {
    const trimmed = input.trim();
    if (trimmed && !disabled) {
      onSend(trimmed);
      setInput('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex items-end gap-3 p-4 bg-white">
      <textarea
        ref={textareaRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder={placeholder}
        rows={1}
        className="
          flex-1 px-4 py-3
          bg-[#F5F0E6] border border-[#C9A961]/50
          rounded-xl resize-none
          text-[#2D2926] placeholder:text-[#7A5C4A]
          focus:outline-none focus:ring-2 focus:ring-[#722F37] focus:border-[#722F37]
          disabled:opacity-50 disabled:cursor-not-allowed
          text-sm leading-relaxed
        "
        style={{ fontFamily: 'Georgia, serif' }}
      />
      <button
        onClick={handleSubmit}
        disabled={disabled || !input.trim()}
        className="
          px-5 py-3
          bg-[#722F37] hover:bg-[#5A252C]
          text-white font-medium
          rounded-xl
          transition-all duration-200
          disabled:opacity-50 disabled:cursor-not-allowed
          flex items-center justify-center
          shadow-md hover:shadow-lg
          border border-[#C9A961]/30
        "
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
        </svg>
      </button>
    </div>
  );
}
