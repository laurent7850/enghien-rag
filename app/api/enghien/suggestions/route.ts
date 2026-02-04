import { NextResponse } from 'next/server';

// Suggestions statiques pour guider l'utilisateur
const INITIAL_SUGGESTIONS = [
  "Qui étaient les seigneurs d'Enghien au Moyen Âge ?",
  "Comment était organisée l'administration de la ville ?",
  "Quelles étaient les principales foires et marchés d'Enghien ?",
  "Parle-moi de l'église paroissiale d'Enghien",
  "Quels corps de métiers existaient à Enghien ?",
  "Quelle est l'origine du nom Enghien ?",
  "Comment fonctionnait la justice à Enghien ?",
  "Quelles institutions de bienfaisance existaient ?",
];

// Suggestions de suivi après une réponse (groupées par thème)
const FOLLOW_UP_SUGGESTIONS: Record<string, string[]> = {
  seigneurs: [
    "Quels étaient les liens entre les seigneurs d'Enghien et la maison d'Arenberg ?",
    "Comment se transmettait le titre de seigneur d'Enghien ?",
    "Quels châteaux possédaient les seigneurs ?",
  ],
  administration: [
    "Quel était le rôle du bailli d'Enghien ?",
    "Comment étaient élus les échevins ?",
    "Quels étaient les pouvoirs du mayeur ?",
  ],
  commerce: [
    "Quand se tenaient les foires annuelles ?",
    "Quels produits étaient vendus aux marchés ?",
    "La ville avait-elle des privilèges commerciaux ?",
  ],
  religion: [
    "Quand l'église paroissiale a-t-elle été construite ?",
    "Y avait-il des couvents à Enghien ?",
    "Parle-moi des confréries religieuses",
  ],
  metiers: [
    "Comment fonctionnaient les corporations de métiers ?",
    "Quels métiers étaient les plus importants ?",
    "Y avait-il des manufactures à Enghien ?",
  ],
};

export async function GET() {
  // Retourner un sous-ensemble aléatoire des suggestions
  const shuffled = [...INITIAL_SUGGESTIONS].sort(() => Math.random() - 0.5);
  const suggestions = shuffled.slice(0, 5);

  return NextResponse.json({ suggestions });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { lastTopic } = body;

    // Si un topic est fourni, retourner des suggestions de suivi
    if (lastTopic && FOLLOW_UP_SUGGESTIONS[lastTopic]) {
      const shuffled = [...FOLLOW_UP_SUGGESTIONS[lastTopic]].sort(() => Math.random() - 0.5);
      return NextResponse.json({ suggestions: shuffled.slice(0, 3) });
    }

    // Sinon, retourner des suggestions générales aléatoires
    const allSuggestions = Object.values(FOLLOW_UP_SUGGESTIONS).flat();
    const shuffled = allSuggestions.sort(() => Math.random() - 0.5);
    return NextResponse.json({ suggestions: shuffled.slice(0, 3) });
  } catch {
    return NextResponse.json({ suggestions: INITIAL_SUGGESTIONS.slice(0, 3) });
  }
}
