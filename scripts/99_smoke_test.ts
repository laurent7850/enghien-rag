/**
 * Test de bout en bout de la recherche multi-ouvrages.
 *
 * Vérifie sur la base réelle que le filtrage par ouvrage, le drapeau de
 * publication et le format des citations se comportent comme attendu.
 * N'écrit rien : peut être lancé sans risque sur n'importe quel environnement.
 *
 * Usage : npx tsx scripts/99_smoke_test.ts
 */

import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

import { searchDocuments, describeSources } from '../lib/rag';
import { formatLocation } from '../lib/citation';
import { closePool, query } from '../lib/db';

const QUESTIONS = [
  "Qui étaient les seigneurs d'Enghien ?",
  "Où se trouvait la motte seigneuriale ?",
  "Comment la ville d'Enghien est-elle née ?",
];

async function main() {
  for (const question of QUESTIONS) {
    console.log('\n' + '='.repeat(70));
    console.log(`❓ ${question}`);
    console.log('='.repeat(70));

    const results = await searchDocuments(question, { count: 6 });
    const parOuvrage = new Map<string, number>();
    for (const r of results) {
      parOuvrage.set(r.metadata.ouvrage, (parOuvrage.get(r.metadata.ouvrage) ?? 0) + 1);
    }

    console.log(`\n${results.length} extraits — répartition :`);
    for (const [ouvrage, n] of parOuvrage) {
      console.log(`   ${ouvrage} : ${n}`);
    }

    console.log('\nCitations telles qu\'elles seront affichées :');
    for (const r of results) {
      const pct = (r.similarity * 100).toFixed(1);
      console.log(`   [${pct}%] ${formatLocation(r.metadata, { court: true })}`);
    }
  }

  // Contrôle du filtre par ouvrage — sur tout le catalogue, pour qu'un ouvrage
  // ajouté plus tard soit couvert sans modifier ce test.
  console.log('\n' + '='.repeat(70));
  console.log('🔎 Contrôle du filtre par ouvrage');
  console.log('='.repeat(70));
  const catalogue = await query<{ id: string }>(
    'SELECT id FROM enghien_ouvrages WHERE publie = TRUE ORDER BY ordre'
  );
  for (const { id: ouvrage } of catalogue) {
    const r = await searchDocuments("l'enceinte de la ville", { count: 5, filter: { ouvrage } });
    const fuites = r.filter((x) => x.metadata.ouvrage !== ouvrage);
    console.log(`   filtre=${ouvrage} → ${r.length} extraits, ${fuites.length} hors-filtre`);
  }

  // Contrôle du drapeau de publication
  console.log('\n' + '='.repeat(70));
  console.log('🔒 Contrôle du drapeau de publication');
  console.log('='.repeat(70));
  const tous = await searchDocuments('Enghien', { count: 30, threshold: 0.1 });
  const nonPublies = tous.filter((r) => r.metadata.publie !== true);
  console.log(`   ${tous.length} extraits remontés, ${nonPublies.length} non publiés`);
  console.log(`   ${nonPublies.length === 0 ? '✅ aucun contenu masqué ne fuite' : '❌ FUITE'}`);

  // Aperçu du catalogue transmis au modèle
  console.log('\n' + '='.repeat(70));
  console.log('📚 Catalogue transmis au modèle');
  console.log('='.repeat(70));
  console.log(describeSources(tous));

  await closePool();
}

main().catch(async (e) => {
  console.error('💥', e);
  await closePool();
  process.exit(1);
});
