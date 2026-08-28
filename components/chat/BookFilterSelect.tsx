'use client';

import { useEffect, useState } from 'react';
import { Ouvrage, SearchFilter } from '@/lib/types';

interface BookFilterSelectProps {
  value: SearchFilter;
  onChange: (value: SearchFilter) => void;
  disabled?: boolean;
}

const SELECT_CLASSES = `
  px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm
  bg-white border border-[#C9A961]/50
  rounded-lg
  text-[#2D2926]
  focus:outline-none focus:ring-2 focus:ring-[#722F37] focus:border-[#722F37]
  disabled:opacity-50 disabled:cursor-not-allowed
  cursor-pointer
  max-w-[180px] sm:max-w-none
`;

function libelle(ouvrage: Ouvrage): string {
  const tome = ouvrage.tome ? `, t. ${ouvrage.tome}` : '';
  return `${ouvrage.auteur.split(' ').pop()} ${ouvrage.annee}${tome}`;
}

export function BookFilterSelect({ value, onChange, disabled }: BookFilterSelectProps) {
  const [ouvrages, setOuvrages] = useState<Ouvrage[]>([]);

  useEffect(() => {
    let annule = false;
    fetch('/api/enghien/ouvrages')
      .then((r) => (r.ok ? r.json() : { ouvrages: [] }))
      .then((data) => {
        if (!annule) setOuvrages(data.ouvrages ?? []);
      })
      .catch(() => {
        // Le filtre est un confort : en cas d'échec, la recherche porte sur
        // tout le corpus et le chat reste utilisable.
        if (!annule) setOuvrages([]);
      });
    return () => {
      annule = true;
    };
  }, []);

  const ouvrageActif = ouvrages.find((o) => o.id === value.ouvrage);
  const livres = ouvrageActif ? Object.entries(ouvrageActif.livres) : [];

  return (
    <div className="flex items-center gap-1 sm:gap-2 w-full sm:w-auto justify-end flex-wrap">
      <label
        htmlFor="ouvrage-filter"
        className="text-xs sm:text-sm text-[#5C4033] font-medium whitespace-nowrap"
      >
        Filtrer :
      </label>

      <select
        id="ouvrage-filter"
        value={value.ouvrage ?? ''}
        // Changer d'ouvrage invalide le livre sélectionné : les numéros de
        // livre n'ont pas le même sens d'un ouvrage à l'autre.
        onChange={(e) => onChange({ ouvrage: e.target.value || undefined })}
        disabled={disabled}
        className={SELECT_CLASSES}
        style={{ fontFamily: 'Georgia, serif' }}
      >
        <option value="">Tous les ouvrages</option>
        {ouvrages.map((ouvrage) => (
          <option key={ouvrage.id} value={ouvrage.id}>
            {libelle(ouvrage)}
          </option>
        ))}
      </select>

      {livres.length > 0 && (
        <select
          id="livre-filter"
          aria-label="Filtrer par livre"
          value={value.livre ?? ''}
          onChange={(e) => onChange({ ...value, livre: e.target.value || undefined })}
          disabled={disabled}
          className={SELECT_CLASSES}
          style={{ fontFamily: 'Georgia, serif' }}
        >
          <option value="">Tout l&apos;ouvrage</option>
          {livres.map(([numero, titre]) => (
            <option key={numero} value={numero}>
              {`Livre ${numero} — ${titre}`}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
