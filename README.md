# MORICE Backend API

Backend Node.js pour l'intégration de Claude IA dans la plateforme MORICE.

## Installation

```bash
cd server
npm install
```

## Configuration

Créez un fichier `.env` à la racine du dossier `server/` avec le contenu suivant :

```env
# Configuration du serveur
PORT=5000
NODE_ENV=development

# Clé API Anthropic (Claude)
# Obtenez votre clé sur : https://console.anthropic.com/
ANTHROPIC_API_KEY=sk-ant-votre-cle-api-ici

# URL du frontend (pour CORS)
FRONTEND_URL=http://localhost:3000
```

## Obtenir votre clé API Claude

1. Créez un compte sur [console.anthropic.com](https://console.anthropic.com/)
2. Accédez à la section "API Keys"
3. Générez une nouvelle clé API
4. Copiez-la dans votre fichier `.env`

## Démarrage

### Mode développement (avec hot-reload)
```bash
npm run dev
```

### Mode production
```bash
npm start
```

Le serveur démarre sur `http://localhost:5000`

## Endpoints API

### Santé du serveur
- `GET /api/health` - Vérifie l'état du serveur

### Tribunal Virtuel
- `POST /api/court/respond` - Génère une réponse de l'arbitre
- `POST /api/court/judgment` - Génère le jugement final

### Analyse de Documents
- `POST /api/analysis/document` - Analyse un document (upload)
- `POST /api/analysis/extract` - Extrait des informations spécifiques

### Plaidoyers
- `POST /api/pleading/generate` - Génère un nouveau plaidoyer
- `POST /api/pleading/improve` - Améliore un plaidoyer existant
- `POST /api/pleading/generate-variants` - Génère 3 versions (strict/modéré/sévère)

## Structure

```
server/
├── server.js           # Point d'entrée
├── routes/             # Routes API
│   ├── court.js        # Routes tribunal
│   ├── analysis.js     # Routes analyse
│   └── pleading.js     # Routes plaidoyer
├── uploads/            # Dossier temporaire (créé automatiquement)
└── package.json
```

