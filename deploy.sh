#!/bin/bash
# Script de déploiement pour VPS Hostinger
# Usage: ./deploy.sh

set -e

echo "🚀 Déploiement de l'application Enghien RAG"
echo "============================================"

# 1. Installer les dépendances
echo ""
echo "📦 Installation des dépendances..."
npm ci --production=false

# 2. Build de l'application
echo ""
echo "🔨 Build de l'application..."
npm run build

# 3. Copier les fichiers statiques dans le dossier standalone
echo ""
echo "📁 Copie des fichiers statiques..."
cp -r public .next/standalone/
cp -r .next/static .next/standalone/.next/

# 4. Redémarrer avec PM2
echo ""
echo "🔄 Redémarrage avec PM2..."
if pm2 list | grep -q "enghien-rag"; then
  pm2 reload ecosystem.config.js --env production
else
  pm2 start ecosystem.config.js --env production
fi

pm2 save

echo ""
echo "✅ Déploiement terminé!"
echo ""
echo "📊 Status:"
pm2 status enghien-rag
