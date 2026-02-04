'use client';

// Logo hébergé sur wiki.deprelledelanieppe.be
const CRAE_LOGO_URL = 'https://wiki.deprelledelanieppe.be/images/9/99/CRAE.PNG';

interface CraeLogoProps {
  size?: number;
  className?: string;
}

export function CraeLogo({ size = 48, className = '' }: CraeLogoProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={CRAE_LOGO_URL}
      alt="Cercle Royal Archéologique d'Enghien"
      width={size}
      height={size}
      className={`object-contain ${className}`}
    />
  );
}
