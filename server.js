import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import Anthropic from '@anthropic-ai/sdk';

// Import des routes
import courtRoutes from './routes/court.js';
import analysisRoutes from './routes/analysis.js';
import pleadingRoutes from './routes/pleading.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Configuration de Multer pour l'upload de fichiers
const upload = multer({ 
  dest: 'uploads/',
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB max
});

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Initialisation du client Anthropic
export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Vérification de la clé API
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('⚠️  ERREUR: ANTHROPIC_API_KEY n\'est pas définie dans .env');
  console.error('ℹ️  Obtenez votre clé sur: https://console.anthropic.com/');
  process.exit(1);
}

// Route de santé
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'MORICE Backend API est opérationnel',
    claude: 'connected',
    timestamp: new Date().toISOString()
  });
});

// Routes API
app.use('/api/court', courtRoutes);
app.use('/api/analysis', analysisRoutes);
app.use('/api/pleading', pleadingRoutes);

// Gestionnaire d'erreurs global
app.use((err, req, res, next) => {
  console.error('Erreur serveur:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Erreur interne du serveur',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Initialisation de MongoDB
let mongoInitialized = false;

async function initializeMongoDB() {
  if (process.env.MONGODB_URI) {
    try {
      const { connectToDatabase, createIndexes } = await import('./services/dbService.js');
      await connectToDatabase();
      await createIndexes();
      mongoInitialized = true;
      console.log('✅ MongoDB: Connecté et indexé');
    } catch (error) {
      console.warn('⚠️  MongoDB: Non disponible, continuant sans base de données');
      console.warn(`   Détails: ${error.message}`);
    }
  } else {
    console.log('ℹ️  MongoDB: Non configuré (MONGODB_URI manquant)');
  }
}

// Démarrage du serveur
app.listen(PORT, async () => {
  console.log(`🚀 Serveur MORICE démarré sur le port ${PORT}`);
  console.log(`🌍 URL: http://localhost:${PORT}`);
  console.log(`🤖 Claude IA: Connecté`);
  console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
  
  // Initialiser MongoDB si configuré
  await initializeMongoDB();
  
  // Vérifier S3 si configuré
  if (process.env.AWS_S3_BUCKET_NAME) {
    console.log('☁️  AWS S3: Configuré');
  } else {
    console.log('ℹ️  AWS S3: Non configuré (stockage local uniquement)');
  }
});

