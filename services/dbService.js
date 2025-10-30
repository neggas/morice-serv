import 'dotenv/config'; // Charger .env immédiatement
import { MongoClient, ObjectId } from 'mongodb';

let client;
let db;

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'morice';

/**
 * Connexion à MongoDB
 */
export async function connectToDatabase() {
  if (!client) {
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db(DB_NAME);
    console.log('✓ Connecté à MongoDB');
  }
  return db;
}

/**
 * Ferme la connexion MongoDB
 */
export async function closeConnection() {
  if (client) {
    await client.close();
    client = null;
    db = null;
    console.log('✓ Connexion MongoDB fermée');
  }
}

/**
 * Collection des analyses
 */
export async function getAnalysisCollection() {
  const database = await connectToDatabase();
  return database.collection('analyses');
}

/**
 * Collection des fichiers
 */
export async function getFilesCollection() {
  const database = await connectToDatabase();
  return database.collection('files');
}

/**
 * Collection des utilisateurs (pour stocker les analyses par user)
 */
export async function getUsersCollection() {
  const database = await connectToDatabase();
  return database.collection('users');
}

/**
 * Sauvegarde une analyse complète
 * @param {Object} analysisData - Données de l'analyse
 * @returns {Promise<string>} ID de l'analyse sauvegardée
 */
export async function saveAnalysis(analysisData) {
  const collection = await getAnalysisCollection();
  
  const document = {
    ...analysisData,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  
  const result = await collection.insertOne(document);
  console.log(`✓ Analyse sauvegardée: ${result.insertedId}`);
  
  return result.insertedId.toString();
}

/**
 * Récupère une analyse par ID
 * @param {string} analysisId - ID de l'analyse
 * @returns {Promise<Object|null>}
 */
export async function getAnalysisById(analysisId) {
  const collection = await getAnalysisCollection();
  
  try {
    const analysis = await collection.findOne({ _id: new ObjectId(analysisId) });
    return analysis;
  } catch (error) {
    console.error('Erreur getAnalysisById:', error);
    return null;
  }
}

/**
 * Récupère toutes les analyses d'un utilisateur
 * @param {string} userId - ID de l'utilisateur
 * @param {number} limit - Nombre max de résultats
 * @returns {Promise<Array>}
 */
export async function getUserAnalyses(userId, limit = 50) {
  const collection = await getAnalysisCollection();
  
  const analyses = await collection
    .find({ userId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();
  
  return analyses;
}

/**
 * Supprime une analyse
 * @param {string} analysisId - ID de l'analyse
 * @returns {Promise<boolean>}
 */
export async function deleteAnalysis(analysisId) {
  const collection = await getAnalysisCollection();
  
  const result = await collection.deleteOne({ _id: new ObjectId(analysisId) });
  console.log(`✓ Analyse supprimée: ${analysisId}`);
  
  return result.deletedCount > 0;
}

/**
 * Crée un index pour améliorer les performances
 */
export async function createIndexes() {
  const analysisCollection = await getAnalysisCollection();
  
  // Index sur userId pour les requêtes par utilisateur
  await analysisCollection.createIndex({ userId: 1 });
  
  // Index sur createdAt pour le tri
  await analysisCollection.createIndex({ createdAt: -1 });
  
  console.log('✓ Indexes MongoDB créés');
}

/**
 * Sauvegarde les métadonnées d'un fichier uploadé
 * @param {Object} fileMetadata - Métadonnées du fichier
 * @returns {Promise<string>} ID du fichier
 */
export async function saveFileMetadata(fileMetadata) {
  const collection = await getFilesCollection();
  
  const document = {
    ...fileMetadata,
    uploadedAt: new Date(),
  };
  
  const result = await collection.insertOne(document);
  console.log(`✓ Métadonnées fichier sauvegardées: ${result.insertedId}`);
  
  return result.insertedId.toString();
}

export default {
  connectToDatabase,
  closeConnection,
  saveAnalysis,
  getAnalysisById,
  getUserAnalyses,
  deleteAnalysis,
  createIndexes,
  saveFileMetadata,
};

