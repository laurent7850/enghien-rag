# Où en est le travail — reprise

Dernière session : digitalisation de **Reygaerts 1998, t. I** et passage du corpus
en multi-ouvrages.

## Emplacement

Le dépôt de travail est ici : `C:\tmp\enghien-rag`, branche **`develop`**,
2 commits en avance sur `master`. Chemin court volontaire : Windows dépasse la
limite `MAX_PATH` lors du build Next depuis un dossier profond.

⚠️ **Rien n'a été poussé sur GitHub, rien n'a touché la production.**

## État de la production — inchangé

- Base `enghien_rag` : 745 chunks du Matthieu, jamais modifiée.
- Branche `master` : intacte. Le workflow GitHub Actions se déclenche sur
  `push: [master, main]` et reconstruit l'image `latest` — ne pas y pousser sans
  intention de déployer.

## Environnement de test — en place

- Base **`enghien_dev`** sur le même conteneur `enghien-postgres` du VPS,
  isolée de `enghien_rag`.
- Rôle dédié **`enghien_dev_user`**, droits limités à cette seule base.
  Mot de passe dans `.env.local` (gitignoré).
- Contenu : 745 chunks Matthieu (copiés en lecture seule depuis la production)
  + 830 chunks Reygaerts, les deux publiés pour les besoins du test.

### Relancer le test

Le tunnel SSH ne survit pas à la fermeture de session. Le rouvrir :

```bash
ssh -i ~/.ssh/vps767464_ed25519 -N -L 55432:127.0.0.1:5433 root@193.203.191.251
```

`enghien-postgres` est publié sur le port **5433** du VPS, pas 5432 — le 5432
appartient à un autre projet.

Puis, dans un second terminal :

```bash
cd /c/tmp/enghien-rag && npm run dev
```

Interface sur http://localhost:3000/enghien

Contrôle non interactif, sans navigateur :

```bash
cd /c/tmp/enghien-rag && npx tsx scripts/99_smoke_test.ts
```

## Ce qui reste à décider

1. **Pousser `develop` sur GitHub ?** Le dépôt `laurent7850/enghien-rag` est public.
   Le commit ne contient que du code et de la documentation — le texte de
   Reygaerts est gitignoré.
2. **Mise en production**, dans cet ordre strict :
   1. `04_add_ouvrage.sql` sur `enghien_rag` (additif, idempotent) ;
   2. déploiement du nouveau code sur `master` — la production filtre alors sur
      `publie` ;
   3. ingestion de Reygaerts en `publie: false` ;
   4. validation, puis publication par `UPDATE`.

   **L'ordre n'est pas négociable** : ingérer avant que la production ne filtre
   sur `publie` rendrait Reygaerts visible des visiteurs immédiatement.
3. **Dossier local `Ville-enghien`** : toujours vide, à remplacer par un clone.
4. **Réingérer le Matthieu** : 265 de ses 745 chunks (35,6 %) sont cités sans
   page en production. Le correctif de pagination les récupérerait, mais sa
   structure de 1876 demande sa propre configuration dans `00_extract_pdf.py`.
5. **Les 6 volumes restants** : Géographie T2, Cahiers de Petit-Enghien I à IV,
   Jadis à Petit-Enghien. Statut des droits à préciser pour chacun.

## Nettoyage éventuel

Pour supprimer entièrement l'environnement de test :

```sql
DROP DATABASE enghien_dev;
DROP ROLE enghien_dev_user;
```

## Procédure complète

Voir [docs/DIGITALISATION.md](docs/DIGITALISATION.md).
