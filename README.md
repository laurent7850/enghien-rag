# Histoire d'Enghien — Chat RAG

Application de chat RAG (Retrieval-Augmented Generation) permettant d'interroger le livre "Histoire de la ville d'Enghien" d'Ernest Matthieu (1876).

## Stack technique

- **Framework** : Next.js 15 (App Router, TypeScript)
- **Base de données** : Supabase (PostgreSQL + pgvector)
- **Embeddings** : OpenAI text-embedding-3-small
- **LLM** : Anthropic Claude claude-sonnet-4-20250514
- **Styling** : Tailwind CSS
- **Déploiement** : VPS Hostinger (Node.js + PM2)

## Structure du projet

```
enghien-rag/
├── app/
│   ├── api/enghien/
│   │   ├── chat/route.ts       # API RAG + LLM streaming
│   │   └── suggestions/route.ts
│   ├── enghien/page.tsx        # Page chat principale
│   └── layout.tsx
├── components/chat/            # Composants React
├── lib/
│   ├── supabase.ts            # Client Supabase
│   ├── embeddings.ts          # OpenAI embeddings
│   ├── rag.ts                 # Logique RAG
│   └── types.ts               # Types TypeScript
├── scripts/
│   ├── 01_clean_and_chunk.ts  # Nettoyage + chunking du texte
│   ├── 02_create_table.sql    # Migration Supabase
│   ├── 03_ingest.ts           # Embedding + insertion
│   └── data/                  # Fichier texte source
├── ecosystem.config.js        # Config PM2
└── deploy.sh                  # Script de déploiement
```

## Installation

### 1. Prérequis

- Node.js 18+
- npm
- Compte Supabase
- Clés API OpenAI et Anthropic

### 2. Configuration

```bash
# Cloner le projet
git clone <repo>
cd enghien-rag

# Installer les dépendances
npm install

# Configurer les variables d'environnement
cp .env.local.example .env.local
# Éditer .env.local avec vos clés API
```

### 3. Préparation des données

```bash
# Placer le fichier texte source
# scripts/data/histoire_enghien_matthieu_fulltext.txt

# Nettoyer et découper en chunks
npx tsx scripts/01_clean_and_chunk.ts

# Créer la table Supabase (via SQL Editor dans le dashboard)
# Copier-coller le contenu de scripts/02_create_table.sql

# Ingérer les données (embeddings + insertion)
npx tsx scripts/03_ingest.ts
```

### 4. Développement local

```bash
npm run dev
# Ouvrir http://localhost:3000
```

## Déploiement VPS Hostinger

### 1. Configuration du VPS

```bash
# Installer Node.js 18+ et PM2
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
sudo npm install -g pm2
```

### 2. Configuration Nginx (reverse proxy)

```nginx
server {
    listen 80;
    server_name votre-domaine.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;

        # Pour le streaming SSE
        proxy_buffering off;
        proxy_read_timeout 300s;
    }
}
```

### 3. Déploiement

```bash
# Cloner le projet sur le VPS
git clone <repo>
cd enghien-rag

# Configurer les variables d'environnement
cp .env.local.example .env.local
nano .env.local  # Ajouter vos clés API

# Déployer
chmod +x deploy.sh
./deploy.sh
```

### 4. Gestion PM2

```bash
# Voir les logs
pm2 logs enghien-rag

# Redémarrer
pm2 restart enghien-rag

# Arrêter
pm2 stop enghien-rag

# Status
pm2 status
```

## Variables d'environnement

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | URL de votre projet Supabase |
| `SUPABASE_SERVICE_KEY` | Clé de service Supabase (pas l'anon key) |
| `OPENAI_API_KEY` | Clé API OpenAI pour les embeddings |
| `ANTHROPIC_API_KEY` | Clé API Anthropic pour Claude |

## API Endpoints

### POST /api/enghien/chat

Envoie une question et reçoit une réponse en streaming.

**Request:**
```json
{
  "message": "Qui étaient les seigneurs d'Enghien ?",
  "filter": { "livre": "I" }  // optionnel
}
```

**Response:** Server-Sent Events (SSE)
- `{ "type": "sources", "sources": [...] }` - Sources trouvées
- `{ "type": "text", "text": "..." }` - Texte de la réponse (streaming)
- `{ "type": "done" }` - Fin du streaming

### GET /api/enghien/suggestions

Retourne des suggestions de questions.

## Licence

Ce projet est fourni à des fins éducatives et de recherche historique.
Le texte source "Histoire de la ville d'Enghien" (1876) est dans le domaine public.
