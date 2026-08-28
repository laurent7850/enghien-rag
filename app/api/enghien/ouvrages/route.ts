import { query } from '@/lib/db';
import { Ouvrage } from '@/lib/types';

export const runtime = 'nodejs';
// Volontairement dynamique : la base n'est pas joignable au moment du build
// Docker, et mettre en cache une réponse d'erreur masquerait le catalogue
// pendant toute la durée du cache. La requête ne porte que sur quelques lignes.
export const dynamic = 'force-dynamic';

interface OuvrageRow {
  id: string;
  titre: string;
  titre_court: string;
  auteur: string;
  annee: number;
  tome: number | null;
  livres: Record<string, string>;
  droits: string | null;
}

/**
 * Catalogue des ouvrages consultables.
 *
 * Ne renvoie que les ouvrages publiés : un livre ingéré mais non validé reste
 * invisible, y compris dans le filtre.
 */
export async function GET() {
  try {
    const rows = await query<OuvrageRow>(
      `SELECT id, titre, titre_court, auteur, annee, tome, livres, droits
       FROM enghien_ouvrages
       WHERE publie = TRUE
       ORDER BY ordre, annee`
    );

    const ouvrages: Ouvrage[] = rows.map((row) => ({
      id: row.id,
      titre: row.titre,
      titre_court: row.titre_court,
      auteur: row.auteur,
      annee: row.annee,
      ...(row.tome !== null ? { tome: row.tome } : {}),
      livres: row.livres ?? {},
      ...(row.droits ? { droits: row.droits } : {}),
    }));

    return Response.json({ ouvrages });
  } catch (error) {
    console.error('Erreur API ouvrages:', error);
    return Response.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
