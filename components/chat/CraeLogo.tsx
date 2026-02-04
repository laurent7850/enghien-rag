'use client';

import craeLogo from '@/public/crae-logo.png';

interface CraeLogoProps {
  size?: number;
  className?: string;
}

export function CraeLogo({ size = 48, className = '' }: CraeLogoProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={craeLogo.src}
      alt="Cercle Royal Archéologique d'Enghien"
      width={size}
      height={size}
      className={`object-contain ${className}`}
    />
  );
}
