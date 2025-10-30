import express from 'express';
import { anthropic } from '../server.js';

const router = express.Router();

// Système de contexte pour maintenir l'historique des conversations
const courtSessions = new Map();

/**
 * Génère une réponse Claude pour le tribunal virtuel
 * POST /api/court/respond
 */
router.post('/respond', async (req, res) => {
  try {
    const { caseId, transcript, caseDescription, currentSpeaker, parties } = req.body;

    if (!transcript || !Array.isArray(transcript)) {
      return res.status(400).json({ error: 'Transcript invalide' });
    }

    // Construire le contexte de la conversation
    const conversationHistory = transcript
      .filter(msg => msg.speaker !== 'morice')
      .map(msg => {
        const role = msg.speaker === 'claimant' ? 'Demandeur' : 'Défenseur';
        const name = parties[msg.speaker]?.name || role;
        return `${name} (${role}): ${msg.content}`;
      })
      .join('\n\n');

    // Prompt système pour MORICE
    const systemPrompt = `Tu es MORICE, un arbitre virtuel impartial et professionnel basé sur l'intelligence artificielle, spécialisé dans le droit civil et commercial canadien.

Ton rôle:
- Mener une audience contradictoire équitable entre un Demandeur et un Défenseur
- Poser des questions pertinentes et ciblées pour clarifier les faits
- Rester neutre et impartial en tout temps
- Utiliser un langage juridique professionnel mais accessible
- Alterner équitablement entre les deux parties
- Ne pas prendre position avant la fin de l'audience

Contexte du dossier: ${caseDescription || 'Litige civil'}

Instructions:
- Pose UNE question claire et précise au prochain intervenant
- Adapte tes questions en fonction des réponses précédentes
- Si l'audience semble complète, indique que tu vas rendre ton jugement
- Utilise le vouvoiement et un ton respectueux`;

    // Appel à l'API Claude
    const message = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 1024,
      temperature: 0.7,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Historique de l'audience:\n\n${conversationHistory}\n\nEn tant qu'arbitre MORICE, quelle est ta prochaine question ou intervention?`
        }
      ]
    });

    const claudeResponse = message.content[0].text;

    // Déterminer le prochain tour (simple alternance)
    const nextTurn = currentSpeaker === 'claimant' ? 'defendant' : 'claimant';

    res.json({
      response: claudeResponse,
      nextTurn: nextTurn,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Erreur Claude (court):', error);
    res.status(500).json({ 
      error: 'Erreur lors de la génération de la réponse',
      details: error.message 
    });
  }
});

/**
 * Génère un jugement final basé sur l'audience complète
 * POST /api/court/judgment
 */
router.post('/judgment', async (req, res) => {
  try {
    const { caseId, transcript, caseDescription, parties } = req.body;

    if (!transcript || !Array.isArray(transcript)) {
      return res.status(400).json({ error: 'Transcript invalide' });
    }

    // Construire le résumé complet de l'audience
    const fullTranscript = transcript
      .map(msg => {
        if (msg.speaker === 'morice') return `MORICE: ${msg.content}`;
        const role = msg.speaker === 'claimant' ? 'Demandeur' : 'Défenseur';
        const name = parties[msg.speaker]?.name || role;
        return `${name} (${role}): ${msg.content}`;
      })
      .join('\n\n');

    const systemPrompt = `Tu es MORICE, un arbitre virtuel spécialisé dans le droit civil et commercial canadien.

Ton rôle est de rédiger un JUGEMENT COMPLET ET STRUCTURÉ après avoir entendu les deux parties.

Le jugement doit contenir:

1. RÉSUMÉ DES FAITS
   - Synthèse objective des événements présentés par les deux parties

2. POSITIONS DES PARTIES
   - Position du Demandeur (arguments et demandes)
   - Position du Défenseur (arguments et défenses)

3. ANALYSE JURIDIQUE
   - Base juridique applicable (droit canadien pertinent)
   - Analyse des arguments de chaque partie
   - Forces et faiblesses identifiées

4. DÉCISION ET RECOMMANDATIONS
   A) Solution Recommandée (Arrangement à l'amiable)
      - Description détaillée d'un compromis équitable
      - Modalités pratiques suggérées
      - Avantages pour les deux parties
   
   B) Alternative Judiciaire
      - Évaluation de l'issue probable devant un tribunal
      - Risques et coûts pour chaque partie
      - Délais estimés

5. AVERTISSEMENT
   "Ce jugement est fourni à titre informatif et n'a aucune force exécutoire. Il ne remplace pas l'avis d'un avocat ou d'un tribunal compétent."

Ton ton doit être:
- Professionnel et impartial
- Clair et structuré
- Basé sur les faits présentés
- Conforme au droit canadien`;

    const message = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 4096,
      temperature: 0.5,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Contexte du dossier: ${caseDescription || 'Litige civil'}\n\nTranscript complet de l'audience:\n\n${fullTranscript}\n\nRédige maintenant le jugement complet en suivant la structure demandée.`
        }
      ]
    });

    const judgment = message.content[0].text;

    res.json({
      judgment: judgment,
      generatedAt: new Date().toISOString(),
      caseId: caseId
    });

  } catch (error) {
    console.error('Erreur Claude (judgment):', error);
    res.status(500).json({ 
      error: 'Erreur lors de la génération du jugement',
      details: error.message 
    });
  }
});

export default router;

