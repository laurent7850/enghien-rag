# Déploiement en production — corpus 8 ouvrages

> **✅ Exécuté le 28/08/2026.** Les 8 ouvrages sont en ligne. Ce runbook reste la
> référence pour les déploiements futurs, avec deux corrections apprises en
> l'exécutant : (1) l'ordre réel est migration → bascule du conteneur → copie
> des chunks → publication — l'ANCIEN code ne filtrait pas sur `publie`, copier
> avant la bascule aurait rendu les ouvrages visibles sans validation ;
> (2) un conteneur sur plusieurs réseaux Docker doit porter le label
> `traefik.docker.network=root_default`, sans quoi Traefik choisit parfois le
> réseau de postgres et le site tombe en 504.

Runbook exact, dans l'ordre. **L'ordre est impératif** : le nouveau code filtre
sur `publie` ; le mettre en ligne avant la migration renverrait zéro résultat.
Toutes les commandes s'exécutent depuis un terminal local (elles passent par SSH).

L'état attendu avant de commencer : `master` fusionné et poussé, image Docker
construite par le CI (voir tag plus bas), base `enghien_dev` contenant les
8 ouvrages validés.

## 1. Migration de la base de production (additive, idempotente)

Tague les 745 chunks existants du Matthieu (`ouvrage`, `publie: true`), crée
les index et le catalogue `enghien_ouvrages`. Sans effet sur le site actuel.

```bash
ssh -i ~/.ssh/vps767464_ed25519 root@193.203.191.251 "docker exec -i enghien-postgres psql -U enghien -d enghien_rag -q" < scripts/04_add_ouvrage.sql
```

Contrôle : la requête finale du script doit afficher `matthieu-1876 | true | 745`.

## 2. Copie des 7 nouveaux ouvrages depuis la base de test

Les embeddings sont déjà calculés dans `enghien_dev` : on copie les vecteurs
tels quels (aucun coût API), en forçant `publie: false` — invisibles des
visiteurs tant que l'étape 5 n'est pas jouée.

```bash
ssh -i ~/.ssh/vps767464_ed25519 root@193.203.191.251 "docker exec enghien-postgres psql -U enghien -d enghien_dev -c \"COPY (SELECT content, embedding, metadata || '{\\\"publie\\\": false}'::jsonb FROM enghien_documents WHERE metadata->>'ouvrage' <> 'matthieu-1876') TO STDOUT\" | docker exec -i enghien-postgres psql -U enghien -d enghien_rag -c \"COPY enghien_documents (content, embedding, metadata) FROM STDIN\""
```

Contrôle :

```bash
ssh -i ~/.ssh/vps767464_ed25519 root@193.203.191.251 "docker exec enghien-postgres psql -U enghien -d enghien_rag -c \"SELECT metadata->>'ouvrage' o, metadata->>'publie' p, count(*) FROM enghien_documents GROUP BY 1,2 ORDER BY 1\""
```

Attendu : 8 ouvrages, seuls les chunks `matthieu-1876` en `publie=true`,
total 3 024 chunks.

## 3. Bascule du conteneur web sur la nouvelle image

Le tag du build CI validé pour ce déploiement est **`ce82a9b`**.

```bash
ssh -i ~/.ssh/vps767464_ed25519 root@193.203.191.251 "sed -i -E 's|(image: ghcr.io/laurent7850/enghien-rag:).*|\1<TAG>|' /root/enghien/docker-compose.yml && cd /root/enghien && docker compose pull web && docker compose up -d web && sleep 8 && docker logs enghien-web --tail 5"
```

Contrôle immédiat — le site doit répondre et le Matthieu fonctionner à
l'identique (le filtre n'affiche que lui à ce stade) :

```bash
curl -s https://enghien.srv767464.hstgr.cloud/api/enghien/ouvrages
curl -s -X POST https://enghien.srv767464.hstgr.cloud/api/enghien/chat -H 'Content-Type: application/json' -d '{"message":"Qui etaient les seigneurs d Enghien ?"}' | head -c 400
```

Attendu : `ouvrages` liste uniquement Matthieu ; le chat répond avec des
sources Matthieu. **Retour arrière si problème** : remettre l'ancien tag
(`362ec3c`) dans le compose et `docker compose up -d web`.

## 4. Validation humaine

Sur https://enghien.srv767464.hstgr.cloud/enghien : le comportement doit être
identique à avant (Matthieu seul). C'est le filet de sécurité avant de rendre
les 7 nouveaux ouvrages visibles.

## 5. Publication des 7 nouveaux ouvrages

```bash
ssh -i ~/.ssh/vps767464_ed25519 root@193.203.191.251 "docker exec enghien-postgres psql -U enghien -d enghien_rag -c \"BEGIN; UPDATE enghien_ouvrages SET publie = TRUE; UPDATE enghien_documents SET metadata = metadata || '{\\\"publie\\\": true}'::jsonb; COMMIT;\""
```

Contrôle final :

```bash
curl -s https://enghien.srv767464.hstgr.cloud/api/enghien/ouvrages
curl -s -X POST https://enghien.srv767464.hstgr.cloud/api/enghien/chat -H 'Content-Type: application/json' -d '{"message":"Que sait-on de la ferme de Warelles ?"}' | head -c 600
```

Attendu : 8 ouvrages dans le catalogue ; la réponse Warelles cite Godet 1967
et/ou les Cahiers.

## Dépublication d'urgence (sans rien supprimer)

```bash
ssh -i ~/.ssh/vps767464_ed25519 root@193.203.191.251 "docker exec enghien-postgres psql -U enghien -d enghien_rag -c \"BEGIN; UPDATE enghien_ouvrages SET publie = FALSE WHERE id = '<ouvrage_id>'; UPDATE enghien_documents SET metadata = metadata || '{\\\"publie\\\": false}'::jsonb WHERE metadata->>'ouvrage' = '<ouvrage_id>'; COMMIT;\""
```

## Après coup (recommandé, non bloquant)

- Vérifier/révoquer les deux anciennes clés OpenRouter exposées dans
  l'historique public depuis février (`sk-or-v1-8764f2e6…`, `sk-or-v1-529715fb…`)
  sur https://openrouter.ai/keys.
- Réingérer le Matthieu depuis son PDF pour corriger les 265 chunks (35,6 %)
  cités sans page — demande sa propre configuration d'extraction.
- Nettoyage éventuel de l'environnement de test : voir REPRISE.md.
