import express from 'express';
import { anthropic } from '../server.js';

const router = express.Router();

/**
 * Génère un plaidoyer à partir de documents et faits
 * POST /api/pleading/generate
 */
router.post('/generate', async (req, res) => {
  try {
    const { caseDescription, facts, documents, pleadingType, tone } = req.body;

    if (!caseDescription || !facts) {
      return res.status(400).json({ error: 'Description du dossier et faits requis' });
    }

    // Définir le ton selon le type demandé
    const toneInstructions = {
      strict: 'Adopte un ton ferme et rigoureux. Mets l\'accent sur les violations claires du droit et les conséquences légales. Demande des sanctions appropriées.',
      moderate: 'Adopte un ton équilibré et professionnel. Présente les faits objectivement tout en défendant fermement les intérêts de ton client.',
      lenient: 'Adopte un ton conciliant et ouvert au compromis. Mets l\'accent sur la résolution amiable tout en protégeant les droits de ton client.'
    };

    const selectedTone = toneInstructions[tone] || toneInstructions.moderate;

    const systemPrompt = `Tu es un avocat expert en droit civil et commercial canadien, spécialisé dans la rédaction de plaidoyers.

Ton rôle est de rédiger un PLAIDOYER COMPLET ET PROFESSIONNEL basé sur les informations fournies.

Structure requise:

1. EN-TÊTE
   - Titre du plaidoyer
   - Identification des parties

2. CONTEXTE ET FAITS
   - Présentation chronologique des faits pertinents
   - Circonstances importantes

3. FONDEMENTS JURIDIQUES
   - Articles de loi applicables (Code civil du Québec, Lois fédérales, Common Law provinciale selon le cas)
   - Jurisprudence pertinente
   - Principes de droit applicables

4. ARGUMENTS PRINCIPAUX
   - Thèse principale soutenue
   - Arguments juridiques détaillés
   - Réfutation des contre-arguments anticipés

5. PRÉTENTIONS ET CONCLUSIONS
   - Demandes spécifiques au tribunal
   - Réparations ou ordonnances demandées
   - Dépens et autres considérations

Style:
${selectedTone}

Important:
- Utilise un langage juridique professionnel
- Cite des articles de loi pertinents (même si génériques)
- Structure logique et convaincante
- Respect des conventions juridiques canadiennes`;

    // Documents contextuels
    const documentsContext = documents && documents.length > 0 
      ? `\n\nDocuments au dossier:\n${documents.map((d, i) => `${i+1}. ${d.name}: ${d.summary || 'Non résumé'}`).join('\n')}`
      : '';

    const message = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 4096,
      temperature: 0.6,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Description du dossier: ${caseDescription}\n\nFaits du dossier:\n${facts}${documentsContext}\n\nRédige maintenant un plaidoyer complet selon les instructions.`
        }
      ]
    });

    const pleading = message.content[0].text;

    res.json({
      pleading: pleading,
      tone: tone,
      generatedAt: new Date().toISOString(),
      wordCount: pleading.split(/\s+/).length
    });

  } catch (error) {
    console.error('Erreur Claude (pleading):', error);
    res.status(500).json({ 
      error: 'Erreur lors de la génération du plaidoyer',
      details: error.message 
    });
  }
});

/**
 * Améliore un plaidoyer existant
 * POST /api/pleading/improve
 */
router.post('/improve', async (req, res) => {
  try {
    const { existingPleading, improvementFocus } = req.body;

    if (!existingPleading) {
      return res.status(400).json({ error: 'Plaidoyer existant requis' });
    }

    const focusInstructions = {
      arguments: 'Concentre-toi sur le renforcement des arguments juridiques et l\'ajout de références légales pertinentes.',
      structure: 'Concentre-toi sur l\'amélioration de la structure, la clarté et la logique de l\'argumentation.',
      style: 'Concentre-toi sur l\'amélioration du style, de la persuasion et du ton professionnel.',
      all: 'Améliore tous les aspects: arguments, structure, style et conformité juridique.'
    };

    const focus = focusInstructions[improvementFocus] || focusInstructions.all;

    const systemPrompt = `Tu es un avocat senior expert en révision et amélioration de plaidoyers juridiques canadiens.

Ton rôle:
1. Analyser le plaidoyer fourni
2. Identifier les forces et faiblesses
3. Proposer une VERSION AMÉLIORÉE complète

${focus}

Tu dois:
- Conserver les faits et le contexte d'origine
- Renforcer les arguments juridiques
- Améliorer la structure et la clarté
- Ajouter des références légales pertinentes si manquantes
- Corriger les erreurs ou imprécisions
- Rendre le document plus convaincant

Fournis:
1. ANALYSE CRITIQUE (bref)
   - Points forts identifiés
   - Points à améliorer

2. VERSION AMÉLIORÉE (complète)
   - Le plaidoyer réécrit et optimisé`;

    const message = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 4096,
      temperature: 0.5,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Voici le plaidoyer à améliorer:\n\n${existingPleading}\n\nFournis ton analyse et la version améliorée.`
        }
      ]
    });

    const improvement = message.content[0].text;

    res.json({
      improvement: improvement,
      focus: improvementFocus,
      improvedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('Erreur Claude (improve):', error);
    res.status(500).json({ 
      error: 'Erreur lors de l\'amélioration du plaidoyer',
      details: error.message 
    });
  }
});

/**
 * Génère les 3 versions (Stricte, Modérée, Sévère)
 * POST /api/pleading/generate-variants
 */
router.post('/generate-variants', async (req, res) => {
  try {
    const { caseDescription, facts, documents } = req.body;

    if (!caseDescription || !facts) {
      return res.status(400).json({ error: 'Description et faits requis' });
    }

    // Générer les 3 versions en parallèle
    const tones = ['strict', 'moderate', 'lenient'];
    
    const variants = await Promise.all(
      tones.map(async (tone) => {
        const response = await fetch(`${req.protocol}://${req.get('host')}/api/pleading/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ caseDescription, facts, documents, tone })
        });
        const data = await response.json();
        return { tone, ...data };
      })
    );

    res.json({
      variants: variants,
      generatedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('Erreur génération variants:', error);
    res.status(500).json({ 
      error: 'Erreur lors de la génération des variants',
      details: error.message 
    });
  }
});

export default router;

