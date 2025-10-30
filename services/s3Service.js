import 'dotenv/config'; // Charger .env immédiatement
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Configuration du client S3
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'eu-north-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME || 'morice-uploads';

/**
 * Upload un fichier vers S3
 * @param {Buffer} fileBuffer - Contenu du fichier
 * @param {string} fileName - Nom du fichier
 * @param {string} contentType - Type MIME du fichier
 * @param {string} folder - Dossier S3 (ex: 'uploads', 'results')
 * @returns {Promise<string>} Clé S3 du fichier
 */
export async function uploadToS3(fileBuffer, fileName, contentType, folder = 'uploads') {
  const key = `${folder}/${Date.now()}_${fileName}`;
  
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: fileBuffer,
    ContentType: contentType,
    ServerSideEncryption: 'AES256',
    Metadata: {
      uploadedAt: new Date().toISOString(),
    },
  });

  await s3Client.send(command);
  
  console.log(`✓ Fichier uploadé vers S3: ${key}`);
  return key;
}

/**
 * Génère une URL signée pour télécharger un fichier depuis S3
 * @param {string} key - Clé S3 du fichier
 * @param {number} expiresIn - Durée de validité en secondes (défaut: 1 heure)
 * @returns {Promise<string>} URL signée
 */
export async function getSignedDownloadUrl(key, expiresIn = 3600) {
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  const signedUrl = await getSignedUrl(s3Client, command, { expiresIn });
  return signedUrl;
}

/**
 * Supprime un fichier de S3
 * @param {string} key - Clé S3 du fichier
 * @returns {Promise<void>}
 */
export async function deleteFromS3(key) {
  const command = new DeleteObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  await s3Client.send(command);
  console.log(`✓ Fichier supprimé de S3: ${key}`);
}

/**
 * Upload un fichier de manière temporaire pour traitement
 * Stocke dans le dossier 'temp' et supprime après analyse
 * @param {Buffer} fileBuffer - Contenu du fichier
 * @param {string} fileName - Nom du fichier
 * @param {string} contentType - Type MIME
 * @returns {Promise<string>} Clé S3 temporaire
 */
export async function uploadTemporaryFile(fileBuffer, fileName, contentType) {
  return uploadToS3(fileBuffer, fileName, contentType, 'temp');
}

/**
 * Upload un résultat d'analyse (conservation permanente)
 * @param {Buffer} fileBuffer - Contenu du fichier
 * @param {string} fileName - Nom du fichier
 * @param {string} contentType - Type MIME
 * @param {string} analysisId - ID de l'analyse associée
 * @returns {Promise<string>} Clé S3
 */
export async function uploadAnalysisResult(fileBuffer, fileName, contentType, analysisId) {
  return uploadToS3(fileBuffer, fileName, contentType, `results/${analysisId}`);
}

export default {
  uploadToS3,
  getSignedDownloadUrl,
  deleteFromS3,
  uploadTemporaryFile,
  uploadAnalysisResult,
};

