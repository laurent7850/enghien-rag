# Où en est le travail — reprise

Dernières sessions : passage du corpus en multi-ouvrages, digitalisation de
**Reygaerts 1998 (t. I-II)**, des **Cahiers de Petit-Enghien (t. I-IV)** et de
**Jadis à Petit-Enghien (Godet 1967, OCR vision)**. Le corpus source prévu est
complet : 8 ouvrages.

## Emplacement

Le dépôt de travail est ici : `C:\tmp\enghien-rag`, branche **`develop`**,
2 commits en avance sur `master`. Chemin court volontaire : Windows dépasse la
limite `MAX_PATH` lors du build Next depuis un dossier profond.

✅ **Déployé en production le 28/08/2026** : les 8 ouvrages sont en ligne sur
https://enghien.srv767464.hstgr.cloud/enghien (3 024 chunks tous publiés).
Dépublication d'urgence : voir docs/DEPLOIEMENT.md.

Image en production : **`a2b642c`** (01/09/2026 — favicon au sceau du Cercle
Royal Archéologique d'Enghien, `app/favicon.ico` + `app/icon.png`).

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
- Contenu (8 ouvrages, tous publiés pour le test) : Matthieu 745 chunks
  (copie lecture seule depuis la production), Reygaerts t. I 830 + t. II 863,
  Cahiers de Petit-Enghien 115+153+67+96, Godet 1967 155.
  Smoke test au vert sur les huit : filtre étanche, aucune fuite de contenu
  masqué, citations correctes.

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
4. ~~Réingérer le Matthieu~~ : fait (28/08/2026). Réextrait depuis le PDF
   Internet Archive : 797 chunks, 0 sans page (contre 265/745 avant), pages des
   3 séries de pagination respectées, structure 4 livres / 20 chapitres complète.
5. ~~Dernier volume~~ : fait — le corpus source prévu est complet.

## Nettoyage éventuel

Pour supprimer entièrement l'environnement de test :

```sql
DROP DATABASE enghien_dev;
DROP ROLE enghien_dev_user;
```

## Procédure complète

Voir [docs/DIGITALISATION.md](docs/DIGITALISATION.md).
