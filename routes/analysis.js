import express from 'express';
import { anthropic } from '../server.js';
import multer from 'multer';
import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import { uploadTemporaryFile, deleteFromS3 } from '../services/s3Service.js';
import { saveAnalysis, getUserAnalyses, getAnalysisById, deleteAnalysis } from '../services/dbService.js';

const router = express.Router();

// Configuration de Multer avec buffer en mémoire pour S3
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

/**
 * Analyse un document juridique
 * POST /api/analysis/document
 */
router.post('/document', upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    const { fileName, fileType, userId } = req.body;

    if (!file) {
      return res.status(400).json({ error: 'Aucun fichier fourni' });
    }

    // Créer un ID unique pour cette analyse
    const analysisId = uuidv4();
    
    // Uploader le fichier vers S3 (optionnel, pour sauvegarde)
    let s3Key = null;
    if (process.env.AWS_S3_BUCKET_NAME) {
      try {
        s3Key = await uploadTemporaryFile(
          file.buffer,
          file.originalname,
          file.mimetype
        );
      } catch (s3Error) {
        console.warn('Avertissement: Impossible d\'uploader vers S3, continuant sans sauvegarde S3:', s3Error.message);
      }
    }

    // Extraire le texte du PDF depuis le buffer
    let documentText = '';
    
    if (file.mimetype === 'application/pdf') {
      // Import dynamique de pdf-parse
      const pdfParse = (await import('pdf-parse')).default;
      const pdfData = await pdfParse(file.buffer);
      documentText = pdfData.text;
    } else {
      // Pour d'autres types de fichiers, lire depuis le buffer
      documentText = file.buffer.toString('utf8');
    }

    // Supprimer le fichier temporaire de S3 après extraction
    if (s3Key) {
      try {
        await deleteFromS3(s3Key);
      } catch (deleteError) {
        console.warn('Avertissement: Impossible de supprimer de S3:', deleteError.message);
      }
    }

    if (!documentText || documentText.trim().length < 10) {
      return res.status(400).json({ 
        error: 'Le document est vide ou non lisible' 
      });
    }

    // Prompt système pour l'analyse
    const systemPrompt = `Tu es un assistant juridique expert spécialisé dans l'analyse de documents juridiques canadiens, avec une expertise approfondie du droit québécois et canadien.

Ton rôle est d'analyser le document fourni et d'extraire les informations clés de manière structurée, précise et approfondie, en citant les textes de loi pertinents.

Tu dois fournir une analyse complète et détaillée comprenant:

1. TYPE DE DOCUMENT
   - Identifier le type exact (contrat, mise en demeure, jugement, bail, procédure, etc.)
   - Nature juridique et implications

2. PARTIES IMPLIQUÉES
   - Nom complet et rôle de chaque partie
   - Statut juridique (personne physique, morale, etc.)
   - Coordonnées complètes si disponibles
   - Capacité juridique des parties

3. DATES IMPORTANTES
   - Date du document et date de prise d'effet
   - Dates d'échéance et délais légaux applicables
   - Chronologie détaillée des événements
   - Dates de prescription le cas échéant

4. MONTANTS ET VALEURS
   - Toutes les sommes d'argent mentionnées avec leur contexte
   - Calculs détaillés, intérêts, pénalités
   - Modalités complètes de paiement
   - Garanties et cautionnements éventuels

5. CLAUSES ET DISPOSITIONS CLÉS
   - Analyse détaillée de chaque clause principale
   - Obligations spécifiques de chaque partie
   - Conditions suspensives ou résolutoires
   - Clauses de responsabilité et d'exonération
   - Dispositions relatives à la résiliation ou à la résolution

6. ANALYSE JURIDIQUE APPROFONDIE
   
   A. DOMAINE DU DROIT
   - Identifier précisément le ou les domaines concernés
   - Références aux textes applicables
   
   B. FONDEMENTS JURIDIQUES
   - **Code civil du Québec**: Citer les articles pertinents (ex: art. 1375 C.c.Q. - Bonne foi)
   - **Lois particulières**: Identifier et citer les lois spéciales applicables
     * Loi sur la protection du consommateur (L.R.Q., c. P-40.1)
     * Code de procédure civile (RLRQ, c. C-25.01)
     * Loi sur le Tribunal administratif du logement (anciennes Régie du logement)
     * Autres lois sectorielles pertinentes
   - **Jurisprudence**: Mentionner les principes jurisprudentiels applicables
   
   C. POINTS DE DROIT DÉTAILLÉS
   - Analyse approfondie des questions juridiques soulevées
   - Interprétation des clauses selon les règles d'interprétation des contrats (art. 1425-1432 C.c.Q.)
   - Conditions de validité (consentement, capacité, objet, cause - art. 1385-1408 C.c.Q.)
   - Obligations contractuelles ou extracontractuelles
   - Recours et moyens de défense disponibles
   
   D. DROITS ET RECOURS
   - Droits de chaque partie en vertu du document
   - Recours judiciaires disponibles
   - Délais de prescription applicables (art. 2875-2933 C.c.Q.)
   - Procédures à suivre
   
   E. RISQUES ET ENJEUX
   - Risques juridiques identifiés pour chaque partie
   - Conséquences potentielles d'un manquement
   - Faiblesses ou ambiguïtés du document
   - Enjeux financiers et juridiques
   
   F. ÉQUITÉ PROCÉDURALE ET JUSTICE NATURELLE
   
   Analyser le respect des principes fondamentaux d'équité procédurale reconnus en droit canadien:
   
   **Principe 1: Droit d'être entendu (Audi Alteram Partem)**
   - Chaque partie a-t-elle eu l'occasion de présenter sa version des faits?
   - Les parties ont-elles été informées des allégations portées contre elles?
   - Y a-t-il eu possibilité de présenter des arguments et de la preuve?
   - Le document prévoit-il des mécanismes d'audition équitables?
   
   **Principe 2: Impartialité et Absence de Parti Pris (Nemo Judex in Sua Causa)**
   - Le décideur ou arbitre désigné est-il impartial?
   - Y a-t-il des conflits d'intérêts apparents ou réels?
   - Les clauses de résolution de conflits respectent-elles l'impartialité?
   - Toute crainte raisonnable de partialité est-elle écartée?
   
   **Principe 3: Divulgation Complète et Communication**
   - Toute l'information pertinente a-t-elle été divulguée aux parties?
   - Y a-t-il transparence dans les obligations et procédures?
   - Les parties ont-elles accès à tous les documents pertinents?
   - Les délais de communication sont-ils raisonnables?
   
   **Principe 4: Droit à une Décision Motivée**
   - Le document prévoit-il l'obligation de motiver les décisions?
   - Les critères de décision sont-ils clairs et objectifs?
   - Y a-t-il obligation d'expliquer le raisonnement juridique?
   
   **Principe 5: Délai Raisonnable**
   - Les délais prévus respectent-ils la règle du délai raisonnable?
   - Y a-t-il des mécanismes pour éviter les retards indus?
   - Les parties ont-elles un temps suffisant pour se préparer?
   - Conformité avec l'arrêt Jordan (délais criminels) ou principes équivalents en civil?
   
   **Principe 6: Droit de Représentation**
   - Les parties peuvent-elles se faire représenter par un avocat?
   - Y a-t-il des restrictions abusives au droit de représentation?
   - Le document respecte-t-il l'autonomie des parties?
   
   **Principe 7: Droit de Contre-interrogatoire**
   - Dans les procédures contradictoires, le droit de contre-interroger est-il préservé?
   - Les parties peuvent-elles contester la preuve adverse?
   
   **Évaluation Globale:**
   - Le document dans son ensemble respecte-t-il les standards d'équité procédurale établis par la Cour suprême du Canada (Baker c. Canada, [1999] 2 R.C.S. 817)?
   - Y a-t-il des clauses qui pourraient être contestées pour violation de l'équité procédurale?
   - Les recours en cas de violation sont-ils adéquats?
   - Recommandations pour améliorer l'équité procédurale si nécessaire
   
   G. PRINCIPES JURIDIQUES FONDAMENTAUX
   
   Analyser systématiquement le respect des principes fondamentaux du droit civil québécois et canadien:
   
   **Principe 1: Bonne Foi Contractuelle (art. 1375 C.c.Q.)**
   
   "La bonne foi doit gouverner la conduite des parties, tant au moment de la naissance de l'obligation qu'à celui de son exécution ou de son extinction."
   
   - Les clauses respectent-elles l'esprit de la bonne foi?
   - Y a-t-il des clauses permettant un comportement de mauvaise foi?
   - Les obligations sont-elles équilibrées et raisonnables?
   - Y a-t-il abus de droit (art. 7 C.c.Q.)?
   - Les parties ont-elles agi de bonne foi dans les négociations?
   
   **Jurisprudence:** Houle c. Banque Canadienne Nationale, [1990] 3 R.C.S. 122; Banque Nationale c. Soucisse, [1981] 2 R.C.S. 339
   
   **Principe 2: Clauses Abusives (art. 1437 C.c.Q. et L.p.c.)**
   
   Identifier toute clause abusive dans les contrats d'adhésion ou de consommation:
   
   **Critères de clause abusive:**
   - Exonération excessive de responsabilité
   - Déséquilibre significatif entre droits et obligations
   - Résiliation unilatérale sans motif raisonnable
   - Clauses pénales disproportionnées
   - Renonciation forcée à des droits fondamentaux
   - Frais cachés ou modalités obscures
   
   **Clauses présumées abusives:**
   - Exonération pour faute lourde (art. 1474 C.c.Q.)
   - Renonciation totale aux garanties légales
   - Clauses de déchéance abusives
   - Pénalités manifestement excessives
   
   **Conséquence:** Clause abusive = Nulle de plein droit ou réductible par le tribunal
   
   **Principe 3: Ordre Public en Droit du Travail (Loi sur les normes du travail)**
   
   Si le document concerne une relation d'emploi, vérifier la conformité aux normes minimales:
   
   **Normes minimales inaliénables:**
   - Salaire minimum (art. 40 LNT)
   - Durée maximale de travail et heures supplémentaires (art. 52-59.0.1)
   - Jours fériés et congés annuels (art. 60, 66-77)
   - Congés familiaux et parentaux (art. 79.1-81.17)
   - Protection contre le congédiement sans cause juste et suffisante (art. 124)
   - Protection contre le harcèlement psychologique (art. 81.18-81.20)
   
   **Clauses automatiquement nulles:**
   - Renonciation aux normes minimales
   - Pénalités financières excessives imposées au salarié
   - Interdiction totale de concurrence post-emploi sans compensation
   - Surveillance excessive violant la vie privée
   
   **Test de validité:** Toute clause moins favorable que la LNT est réputée non écrite
   
   **Principe 4: Protection de la Vie Privée et des Données Personnelles**
   
   Conformité à la Loi 25 (modernisation des lois sur la protection des renseignements personnels):
   
   **Obligations fondamentales:**
   
   A. **Collecte de renseignements personnels:**
   - Consentement libre, éclairé et spécifique
   - Finalité déterminée, explicite et légitime
   - Proportionnalité (collecte minimale nécessaire)
   - Information claire sur l'utilisation prévue
   
   B. **Droits de la personne concernée:**
   - Droit d'accès aux renseignements (art. 37-40 Loi 25)
   - Droit de rectification et de suppression
   - Droit à la portabilité des données
   - Droit de retirer son consentement
   
   C. **Sécurité et conservation:**
   - Mesures de sécurité appropriées
   - Durée de conservation limitée et justifiée
   - Destruction sécuritaire des données
   
   D. **Surveillance et vie privée au travail:**
   - Justification objective pour toute surveillance
   - Moyens les moins attentatoires possibles
   - Information préalable des personnes surveillées
   - Respect de la dignité (art. 3, 35 C.c.Q.)
   
   **Vérification:** Le document respecte-t-il les art. 3, 35-41 C.c.Q. et la Loi 25?
   
   **Principe 5: Non-Discrimination (Charte québécoise, art. 10-20.1)**
   
   Vérifier l'absence de discrimination directe ou indirecte:
   
   **Motifs de discrimination prohibés (art. 10):**
   - Race, couleur, origine ethnique ou nationale
   - Sexe, grossesse, orientation sexuelle, identité ou expression de genre
   - État civil, âge (sauf exception légitime)
   - Religion, convictions politiques
   - Langue
   - Condition sociale
   - Handicap ou utilisation d'un moyen pour pallier un handicap
   
   **Applications:**
   
   A. **En matière d'emploi (art. 16-20):**
   - Exigences professionnelles justifiées (EPJ)
   - Obligation d'accommodement raisonnable jusqu'à contrainte excessive
   - Interdiction de discrimination dans l'embauche, les conditions de travail, la promotion
   
   B. **En matière contractuelle:**
   - Égalité dans la fourniture de biens et services (art. 12)
   - Absence de clauses basées sur des stéréotypes
   
   **Test:** La clause impose-t-elle des exigences qui ont un effet discriminatoire sur un groupe protégé sans justification objective?
   
   **Principe 6: Protection du Locataire Résidentiel (art. 1851-2000 C.c.Q.)**
   
   Si le document est un bail résidentiel, vérifier la conformité à l'ordre public absolu:
   
   **Clauses automatiquement nulles (art. 1893):**
   - Augmentation de loyer non conforme (art. 1942-1945)
   - Résiliation sans motif sérieux ou sans ordre du TAL
   - Paiement d'avance de loyer > 1 mois
   - Dépôt de garantie (sauf exceptions strictes)
   - Résiliation automatique pour retard de paiement
   - Renonciation au droit au maintien dans les lieux
   - Modification unilatérale des conditions du bail
   
   **Obligations impératives du locateur:**
   - Délivrance du logement en bon état (art. 1854)
   - Entretien et réparations majeures (art. 1864)
   - Garantie de jouissance paisible (art. 1858)
   - Respect de la vie privée du locataire (art. 1857)
   
   **Droits inaliénables du locataire:**
   - Droit au maintien dans les lieux (art. 1936)
   - Droit de contester l'augmentation (art. 1942-1945)
   - Protection contre la reprise et l'éviction (art. 1957-1970)
   - Recours au Tribunal administratif du logement (TAL)
   
   **Important:** Toute clause contrevenant à ces règles est réputée non écrite, même si signée
   
   **Synthèse de Conformité:**
   
   Pour chaque principe:
   - ✅ **CONFORME** si respecté
   - ⚠️ **ATTENTION** si zone grise ou amélioration suggérée
   - ❌ **NON-CONFORME** si violation claire
   
   Identifier les modifications recommandées pour assurer la pleine conformité juridique

7. POINTS D'ATTENTION PRIORITAIRES
   - Éléments nécessitant une vigilance particulière
   - Clauses abusives potentielles (L.P.C., art. 1436-1437 C.c.Q.)
   - Contradictions ou incohérences dans le texte
   - Documents ou démarches complémentaires nécessaires
   - Recommandations préliminaires

8. CONCLUSION JURIDIQUE INFORMATIVE
   
   Cette section doit synthétiser:
   - **Résumé de la situation juridique** à la lumière des textes de loi pertinents
   - **Droits et obligations** des parties selon le cadre législatif applicable
   - **Conformité** du document aux exigences légales en vigueur
   - **Prochaines étapes conseillées** selon le contexte juridique
   - **Mise en garde importante**: Nature informative de l'analyse, nécessité de consulter un avocat membre du Barreau du Québec pour un avis juridique personnalisé
   
   Référence aux textes applicables et rappel que toute décision doit être prise avec l'accompagnement d'un professionnel du droit.

Format ta réponse en utilisant du Markdown avec des titres (##) et sous-titres (###) clairs. Utilise le gras (**texte**) pour les éléments importants et cite précisément les articles de loi pertinents.`;

    // Appel à Claude
    const message = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 4096,
      temperature: 0.2,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Nom du fichier: ${fileName || file.originalname}\n\nContenu du document:\n\n${documentText.substring(0, 100000)}\n\nFournis une analyse juridique complète, approfondie et structurée de ce document. 

IMPORTANT:
- Cite systématiquement les articles de loi pertinents (Code civil du Québec, lois spéciales)
- Développe en détail chaque section de l'analyse juridique
- Fournis une conclusion informative complète basée sur les textes de loi applicables
- Identifie tous les recours et droits des parties
- Mentionne les délais de prescription le cas échéant
- Analyse la conformité du document aux exigences légales

**ANALYSES OBLIGATOIRES:**

1. **ÉQUITÉ PROCÉDURALE (Section F):**
   - Évalue systématiquement le respect des 7 principes d'équité procédurale et de justice naturelle
   - Identifie toute violation des principes audi alteram partem et nemo judex in sua causa
   - Référence la jurisprudence de la Cour suprême (Baker, Nicholson, Cardinal)

2. **PRINCIPES JURIDIQUES FONDAMENTAUX (Section G):**
   - **Bonne foi contractuelle** (art. 1375 C.c.Q.) - Vérifie l'équilibre et l'absence d'abus
   - **Clauses abusives** (art. 1437, L.p.c.) - Identifie tout déséquilibre significatif
   - **Ordre public emploi** - Si contrat de travail: conformité LNT obligatoire
   - **Vie privée et données** - Conformité Loi 25 et art. 35-41 C.c.Q.
   - **Non-discrimination** - Absence de discrimination selon Charte québécoise art. 10
   - **Bail résidentiel** - Si bail: vérification ordre public absolu art. 1851-2000

Pour chaque principe, indique clairement: ✅ CONFORME, ⚠️ ATTENTION, ou ❌ NON-CONFORME

L'analyse doit être exhaustive et permettre une compréhension approfondie de la situation juridique, incluant une évaluation complète de l'équité procédurale ET des principes juridiques fondamentaux.`
        }
      ]
    });

    const analysis = message.content[0].text;

    // Sauvegarder l'analyse dans MongoDB
    let savedAnalysisId = null;
    if (process.env.MONGODB_URI) {
      try {
        savedAnalysisId = await saveAnalysis({
          analysisId,
          userId: userId || 'anonymous',
          fileName: fileName || file.originalname,
          fileSize: file.size,
          fileType: file.mimetype,
          wordCount: documentText.split(/\s+/).length,
          analysis,
          analyzedAt: new Date(),
          status: 'completed',
        });
      } catch (dbError) {
        console.warn('Avertissement: Impossible de sauvegarder dans MongoDB, continuant sans sauvegarde DB:', dbError.message);
      }
    }

    res.json({
      analysis: analysis,
      analysisId: savedAnalysisId,
      fileName: fileName || file.originalname,
      fileSize: file.size,
      analyzedAt: new Date().toISOString(),
      wordCount: documentText.split(/\s+/).length
    });

  } catch (error) {
    console.error('Erreur Claude (analysis):', error);
    
    // Nettoyer le fichier de S3 en cas d'erreur si existant
    if (req.file && req.file.s3Key) {
      try {
        await deleteFromS3(req.file.s3Key);
      } catch (deleteError) {
        console.error('Erreur lors de la suppression de S3:', deleteError);
      }
    }

    res.status(500).json({ 
      error: 'Erreur lors de l\'analyse du document',
      details: error.message 
    });
  }
});

/**
 * Extrait des informations spécifiques d'un texte
 * POST /api/analysis/extract
 */
router.post('/extract', async (req, res) => {
  try {
    const { text, extractionType } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Texte manquant' });
    }

    const prompts = {
      parties: 'Extrais uniquement les noms et coordonnées de toutes les parties mentionnées dans ce document.',
      dates: 'Extrais uniquement toutes les dates importantes mentionnées dans ce document avec leur contexte.',
      amounts: 'Extrais uniquement tous les montants d\'argent mentionnés dans ce document avec leur contexte.',
      clauses: 'Extrais et résume uniquement les clauses principales de ce document.'
    };

    const userPrompt = prompts[extractionType] || 'Analyse ce texte juridique.';

    const message = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 2048,
      temperature: 0.2,
      messages: [
        {
          role: 'user',
          content: `${userPrompt}\n\nTexte:\n${text.substring(0, 50000)}`
        }
      ]
    });

    res.json({
      extraction: message.content[0].text,
      type: extractionType,
      extractedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('Erreur Claude (extract):', error);
    res.status(500).json({ 
      error: 'Erreur lors de l\'extraction',
      details: error.message 
    });
  }
});

/**
 * Analyse plusieurs documents juridiques comme un dossier unique
 * POST /api/analysis/documents/multiple
 */
router.post('/documents/multiple', upload.array('files', 10), async (req, res) => {
  try {
    const files = req.files;

    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'Aucun fichier fourni' });
    }

    if (files.length > 10) {
      return res.status(400).json({ error: 'Maximum 10 fichiers autorisés' });
    }

    console.log(`Analyse d'un dossier de ${files.length} documents...`);

    // Extraire le texte de tous les documents et les combiner
    let combinedText = '';
    const filesList = [];
    let totalWords = 0;
    
    for (const file of files) {
      try {
        // Extraire le texte du document
        let documentText = '';
        
        if (file.mimetype === 'application/pdf') {
          const pdfParse = (await import('pdf-parse')).default;
          const dataBuffer = await fs.readFile(file.path);
          const pdfData = await pdfParse(dataBuffer);
          documentText = pdfData.text;
        } else {
          documentText = await fs.readFile(file.path, 'utf8');
        }

        // Supprimer le fichier après lecture
        await fs.unlink(file.path);

        if (documentText && documentText.trim().length >= 10) {
          // Ajouter ce document au texte combiné avec un séparateur
          combinedText += `\n\n${'='.repeat(80)}\n`;
          combinedText += `DOCUMENT: ${file.originalname}\n`;
          combinedText += `${'='.repeat(80)}\n\n`;
          combinedText += documentText;
          
          filesList.push({
            name: file.originalname,
            size: file.size,
            wordCount: documentText.split(/\s+/).length
          });
          
          totalWords += documentText.split(/\s+/).length;
        } else {
          console.log(`⚠️ Document ignoré (trop court): ${file.originalname}`);
        }
      } catch (fileError) {
        console.error(`Erreur pour ${file.originalname}:`, fileError);
        // Nettoyer le fichier en cas d'erreur
        try {
          await fs.unlink(file.path);
        } catch (unlinkError) {
          console.error('Erreur lors de la suppression:', unlinkError);
        }
      }
    }

    if (!combinedText || combinedText.trim().length < 10) {
      return res.status(400).json({ 
        error: 'Le dossier ne contient aucun texte lisible' 
      });
    }

    // Prompt système pour l'analyse d'un dossier complet
    const systemPrompt = `Tu es un assistant juridique expert spécialisé dans l'analyse de dossiers juridiques canadiens, avec une expertise approfondie du droit québécois et canadien.

Ton rôle est d'analyser l'ENSEMBLE des documents fournis comme un DOSSIER UNIQUE et de produire une analyse globale cohérente qui prend en compte tous les documents et leurs interrelations.

Tu dois fournir une ÉTUDE DE CAS complète et détaillée comprenant:

1. TYPE DE DOCUMENT
   - Identifier le type exact (contrat, mise en demeure, jugement, bail, procédure, etc.)
   - Nature juridique et implications

2. PARTIES IMPLIQUÉES
   - Nom complet et rôle de chaque partie
   - Statut juridique (personne physique, morale, etc.)
   - Coordonnées complètes si disponibles
   - Capacité juridique des parties

3. DATES IMPORTANTES
   - Date du document et date de prise d'effet
   - Dates d'échéance et délais légaux applicables
   - Chronologie détaillée des événements
   - Dates de prescription le cas échéant

4. MONTANTS ET VALEURS
   - Toutes les sommes d'argent mentionnées avec leur contexte
   - Calculs détaillés, intérêts, pénalités
   - Modalités complètes de paiement
   - Garanties et cautionnements éventuels

5. CLAUSES ET DISPOSITIONS CLÉS
   - Analyse détaillée de chaque clause principale
   - Obligations spécifiques de chaque partie
   - Conditions suspensives ou résolutoires
   - Clauses de responsabilité et d'exonération
   - Dispositions relatives à la résiliation ou à la résolution

6. ANALYSE JURIDIQUE APPROFONDIE
   
   A. DOMAINE DU DROIT
   - Identifier précisément le ou les domaines concernés
   - Références aux textes applicables
   
   B. FONDEMENTS JURIDIQUES
   - **Code civil du Québec**: Citer les articles pertinents (ex: art. 1375 C.c.Q. - Bonne foi)
   - **Lois particulières**: Identifier et citer les lois spéciales applicables
     * Loi sur la protection du consommateur (L.R.Q., c. P-40.1)
     * Code de procédure civile (RLRQ, c. C-25.01)
     * Loi sur le Tribunal administratif du logement (anciennes Régie du logement)
     * Autres lois sectorielles pertinentes
   - **Jurisprudence**: Mentionner les principes jurisprudentiels applicables
   
   C. POINTS DE DROIT DÉTAILLÉS
   - Analyse approfondie des questions juridiques soulevées
   - Interprétation des clauses selon les règles d'interprétation des contrats (art. 1425-1432 C.c.Q.)
   - Conditions de validité (consentement, capacité, objet, cause - art. 1385-1408 C.c.Q.)
   - Obligations contractuelles ou extracontractuelles
   - Recours et moyens de défense disponibles
   
   D. DROITS ET RECOURS
   - Droits de chaque partie en vertu du document
   - Recours judiciaires disponibles
   - Délais de prescription applicables (art. 2875-2933 C.c.Q.)
   - Procédures à suivre
   
   E. RISQUES ET ENJEUX
   - Risques juridiques identifiés pour chaque partie
   - Conséquences potentielles d'un manquement
   - Faiblesses ou ambiguïtés du document
   - Enjeux financiers et juridiques
   
   F. ÉQUITÉ PROCÉDURALE ET JUSTICE NATURELLE
   
   Analyser le respect des principes fondamentaux d'équité procédurale reconnus en droit canadien:
   
   **Principe 1: Droit d'être entendu (Audi Alteram Partem)**
   - Chaque partie a-t-elle eu l'occasion de présenter sa version des faits?
   - Les parties ont-elles été informées des allégations portées contre elles?
   - Y a-t-il eu possibilité de présenter des arguments et de la preuve?
   - Le document prévoit-il des mécanismes d'audition équitables?
   
   **Principe 2: Impartialité et Absence de Parti Pris (Nemo Judex in Sua Causa)**
   - Le décideur ou arbitre désigné est-il impartial?
   - Y a-t-il des conflits d'intérêts apparents ou réels?
   - Les clauses de résolution de conflits respectent-elles l'impartialité?
   - Toute crainte raisonnable de partialité est-elle écartée?
   
   **Principe 3: Divulgation Complète et Communication**
   - Toute l'information pertinente a-t-elle été divulguée aux parties?
   - Y a-t-il transparence dans les obligations et procédures?
   - Les parties ont-elles accès à tous les documents pertinents?
   - Les délais de communication sont-ils raisonnables?
   
   **Principe 4: Droit à une Décision Motivée**
   - Le document prévoit-il l'obligation de motiver les décisions?
   - Les critères de décision sont-ils clairs et objectifs?
   - Y a-t-il obligation d'expliquer le raisonnement juridique?
   
   **Principe 5: Délai Raisonnable**
   - Les délais prévus respectent-ils la règle du délai raisonnable?
   - Y a-t-il des mécanismes pour éviter les retards indus?
   - Les parties ont-elles un temps suffisant pour se préparer?
   - Conformité avec l'arrêt Jordan (délais criminels) ou principes équivalents en civil?
   
   **Principe 6: Droit de Représentation**
   - Les parties peuvent-elles se faire représenter par un avocat?
   - Y a-t-il des restrictions abusives au droit de représentation?
   - Le document respecte-t-il l'autonomie des parties?
   
   **Principe 7: Droit de Contre-interrogatoire**
   - Dans les procédures contradictoires, le droit de contre-interroger est-il préservé?
   - Les parties peuvent-elles contester la preuve adverse?
   
   **Évaluation Globale:**
   - Le document dans son ensemble respecte-t-il les standards d'équité procédurale établis par la Cour suprême du Canada (Baker c. Canada, [1999] 2 R.C.S. 817)?
   - Y a-t-il des clauses qui pourraient être contestées pour violation de l'équité procédurale?
   - Les recours en cas de violation sont-ils adéquats?
   - Recommandations pour améliorer l'équité procédurale si nécessaire
   
   G. PRINCIPES JURIDIQUES FONDAMENTAUX
   
   Analyser systématiquement le respect des principes fondamentaux du droit civil québécois et canadien:
   
   **Principe 1: Bonne Foi Contractuelle (art. 1375 C.c.Q.)**
   
   "La bonne foi doit gouverner la conduite des parties, tant au moment de la naissance de l'obligation qu'à celui de son exécution ou de son extinction."
   
   - Les clauses respectent-elles l'esprit de la bonne foi?
   - Y a-t-il des clauses permettant un comportement de mauvaise foi?
   - Les obligations sont-elles équilibrées et raisonnables?
   - Y a-t-il abus de droit (art. 7 C.c.Q.)?
   - Les parties ont-elles agi de bonne foi dans les négociations?
   
   **Jurisprudence:** Houle c. Banque Canadienne Nationale, [1990] 3 R.C.S. 122; Banque Nationale c. Soucisse, [1981] 2 R.C.S. 339
   
   **Principe 2: Clauses Abusives (art. 1437 C.c.Q. et L.p.c.)**
   
   Identifier toute clause abusive dans les contrats d'adhésion ou de consommation:
   
   **Critères de clause abusive:**
   - Exonération excessive de responsabilité
   - Déséquilibre significatif entre droits et obligations
   - Résiliation unilatérale sans motif raisonnable
   - Clauses pénales disproportionnées
   - Renonciation forcée à des droits fondamentaux
   - Frais cachés ou modalités obscures
   
   **Clauses présumées abusives:**
   - Exonération pour faute lourde (art. 1474 C.c.Q.)
   - Renonciation totale aux garanties légales
   - Clauses de déchéance abusives
   - Pénalités manifestement excessives
   
   **Conséquence:** Clause abusive = Nulle de plein droit ou réductible par le tribunal
   
   **Principe 3: Ordre Public en Droit du Travail (Loi sur les normes du travail)**
   
   Si le document concerne une relation d'emploi, vérifier la conformité aux normes minimales:
   
   **Normes minimales inaliénables:**
   - Salaire minimum (art. 40 LNT)
   - Durée maximale de travail et heures supplémentaires (art. 52-59.0.1)
   - Jours fériés et congés annuels (art. 60, 66-77)
   - Congés familiaux et parentaux (art. 79.1-81.17)
   - Protection contre le congédiement sans cause juste et suffisante (art. 124)
   - Protection contre le harcèlement psychologique (art. 81.18-81.20)
   
   **Clauses automatiquement nulles:**
   - Renonciation aux normes minimales
   - Pénalités financières excessives imposées au salarié
   - Interdiction totale de concurrence post-emploi sans compensation
   - Surveillance excessive violant la vie privée
   
   **Test de validité:** Toute clause moins favorable que la LNT est réputée non écrite
   
   **Principe 4: Protection de la Vie Privée et des Données Personnelles**
   
   Conformité à la Loi 25 (modernisation des lois sur la protection des renseignements personnels):
   
   **Obligations fondamentales:**
   
   A. **Collecte de renseignements personnels:**
   - Consentement libre, éclairé et spécifique
   - Finalité déterminée, explicite et légitime
   - Proportionnalité (collecte minimale nécessaire)
   - Information claire sur l'utilisation prévue
   
   B. **Droits de la personne concernée:**
   - Droit d'accès aux renseignements (art. 37-40 Loi 25)
   - Droit de rectification et de suppression
   - Droit à la portabilité des données
   - Droit de retirer son consentement
   
   C. **Sécurité et conservation:**
   - Mesures de sécurité appropriées
   - Durée de conservation limitée et justifiée
   - Destruction sécuritaire des données
   
   D. **Surveillance et vie privée au travail:**
   - Justification objective pour toute surveillance
   - Moyens les moins attentatoires possibles
   - Information préalable des personnes surveillées
   - Respect de la dignité (art. 3, 35 C.c.Q.)
   
   **Vérification:** Le document respecte-t-il les art. 3, 35-41 C.c.Q. et la Loi 25?
   
   **Principe 5: Non-Discrimination (Charte québécoise, art. 10-20.1)**
   
   Vérifier l'absence de discrimination directe ou indirecte:
   
   **Motifs de discrimination prohibés (art. 10):**
   - Race, couleur, origine ethnique ou nationale
   - Sexe, grossesse, orientation sexuelle, identité ou expression de genre
   - État civil, âge (sauf exception légitime)
   - Religion, convictions politiques
   - Langue
   - Condition sociale
   - Handicap ou utilisation d'un moyen pour pallier un handicap
   
   **Applications:**
   
   A. **En matière d'emploi (art. 16-20):**
   - Exigences professionnelles justifiées (EPJ)
   - Obligation d'accommodement raisonnable jusqu'à contrainte excessive
   - Interdiction de discrimination dans l'embauche, les conditions de travail, la promotion
   
   B. **En matière contractuelle:**
   - Égalité dans la fourniture de biens et services (art. 12)
   - Absence de clauses basées sur des stéréotypes
   
   **Test:** La clause impose-t-elle des exigences qui ont un effet discriminatoire sur un groupe protégé sans justification objective?
   
   **Principe 6: Protection du Locataire Résidentiel (art. 1851-2000 C.c.Q.)**
   
   Si le document est un bail résidentiel, vérifier la conformité à l'ordre public absolu:
   
   **Clauses automatiquement nulles (art. 1893):**
   - Augmentation de loyer non conforme (art. 1942-1945)
   - Résiliation sans motif sérieux ou sans ordre du TAL
   - Paiement d'avance de loyer > 1 mois
   - Dépôt de garantie (sauf exceptions strictes)
   - Résiliation automatique pour retard de paiement
   - Renonciation au droit au maintien dans les lieux
   - Modification unilatérale des conditions du bail
   
   **Obligations impératives du locateur:**
   - Délivrance du logement en bon état (art. 1854)
   - Entretien et réparations majeures (art. 1864)
   - Garantie de jouissance paisible (art. 1858)
   - Respect de la vie privée du locataire (art. 1857)
   
   **Droits inaliénables du locataire:**
   - Droit au maintien dans les lieux (art. 1936)
   - Droit de contester l'augmentation (art. 1942-1945)
   - Protection contre la reprise et l'éviction (art. 1957-1970)
   - Recours au Tribunal administratif du logement (TAL)
   
   **Important:** Toute clause contrevenant à ces règles est réputée non écrite, même si signée
   
   **Synthèse de Conformité:**
   
   Pour chaque principe:
   - ✅ **CONFORME** si respecté
   - ⚠️ **ATTENTION** si zone grise ou amélioration suggérée
   - ❌ **NON-CONFORME** si violation claire
   
   Identifier les modifications recommandées pour assurer la pleine conformité juridique

7. POINTS D'ATTENTION PRIORITAIRES
   - Éléments nécessitant une vigilance particulière
   - Clauses abusives potentielles (L.P.C., art. 1436-1437 C.c.Q.)
   - Contradictions ou incohérences dans le texte
   - Documents ou démarches complémentaires nécessaires
   - Recommandations préliminaires

8. CONCLUSION JURIDIQUE INFORMATIVE
   
   Cette section doit synthétiser:
   - **Résumé de la situation juridique** à la lumière des textes de loi pertinents
   - **Droits et obligations** des parties selon le cadre législatif applicable
   - **Conformité** du document aux exigences légales en vigueur
   - **Prochaines étapes conseillées** selon le contexte juridique
   - **Mise en garde importante**: Nature informative de l'analyse, nécessité de consulter un avocat membre du Barreau du Québec pour un avis juridique personnalisé
   
   Référence aux textes applicables et rappel que toute décision doit être prise avec l'accompagnement d'un professionnel du droit.

Format ta réponse en utilisant du Markdown avec des titres (##) et sous-titres (###) clairs. Utilise le gras (**texte**) pour les éléments importants et cite précisément les articles de loi pertinents.`;

    // Préparer la liste des documents
    const documentsListText = filesList.map((f, idx) => `${idx + 1}. ${f.name} (${f.wordCount} mots)`).join('\n');

    // Appel à Claude pour l'analyse du dossier complet
    const message = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 4096,
      temperature: 0.2,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `DOSSIER JURIDIQUE À ANALYSER

Ce dossier contient ${filesList.length} document(s):
${documentsListText}

Contenu complet du dossier:
${combinedText.substring(0, 150000)}

INSTRUCTIONS:
- Analyse l'ENSEMBLE des documents comme un DOSSIER UNIQUE
- Identifie les liens et cohérence entre les différents documents
- Fournis une ÉTUDE DE CAS globale qui synthétise toute l'information
- Cite systématiquement les articles de loi pertinents (Code civil du Québec, lois spéciales)
- Développe en détail chaque section de l'analyse juridique
- Fournis une conclusion informative complète basée sur les textes de loi applicables
- Identifie tous les recours et droits des parties
- Mentionne les délais de prescription le cas échéant
- Analyse la conformité du dossier aux exigences légales

**ANALYSES OBLIGATOIRES TRANSVERSALES:**

1. **ÉQUITÉ PROCÉDURALE (Section F):**
   - Évalue systématiquement le respect des 7 principes d'équité procédurale dans l'ensemble du dossier
   - Identifie toute violation des principes audi alteram partem et nemo judex in sua causa à travers les documents
   - Référence la jurisprudence de la Cour suprême (Baker, Nicholson, Cardinal)
   - Analyse transversale: Comment les documents se complètent ou se contredisent en matière d'équité

2. **PRINCIPES JURIDIQUES FONDAMENTAUX (Section G):**
   - **Bonne foi contractuelle** (art. 1375) - Évalue la cohérence et l'équilibre à travers les documents
   - **Clauses abusives** (art. 1437, L.p.c.) - Identifie tout déséquilibre dans l'ensemble du dossier
   - **Ordre public emploi** - Si dossier emploi: conformité LNT dans tous les documents
   - **Vie privée et données** - Conformité Loi 25 et art. 35-41 C.c.Q. dans tout le dossier
   - **Non-discrimination** - Absence de discrimination dans l'ensemble des documents
   - **Bail résidentiel** - Si dossier bail: vérification ordre public absolu dans tous les documents
   
   Analyse comment les différents documents du dossier interagissent concernant ces principes:
   - Y a-t-il contradictions entre documents?
   - Les principes sont-ils respectés de manière cohérente?
   - Évolution ou détérioration de la conformité au fil des documents?

Pour chaque principe, indique clairement: ✅ CONFORME, ⚠️ ATTENTION, ou ❌ NON-CONFORME

L'analyse doit être exhaustive et permettre une compréhension approfondie de la situation juridique globale du dossier, incluant une évaluation complète de l'équité procédurale ET des principes juridiques fondamentaux à travers tous les documents.`
        }
      ]
    });

    const analysis = message.content[0].text;

    console.log(`✓ Dossier analysé avec succès (${filesList.length} documents)`);

    // Retourner le résultat unique
    res.json({
      analysis: analysis,
      fileName: `Dossier-${filesList.length}-documents`,
      fileSize: filesList.reduce((sum, f) => sum + f.size, 0),
      analyzedAt: new Date().toISOString(),
      wordCount: totalWords,
      documentsCount: filesList.length,
      documents: filesList
    });

  } catch (error) {
    console.error('Erreur Claude (multiple analysis):', error);
    
    // Nettoyer tous les fichiers en cas d'erreur
    if (req.files) {
      for (const file of req.files) {
        try {
          await fs.unlink(file.path);
        } catch (unlinkError) {
          console.error('Erreur lors de la suppression du fichier:', unlinkError);
        }
      }
    }

    res.status(500).json({ 
      error: 'Erreur lors de l\'analyse des documents',
      details: error.message 
    });
  }
});

/**
 * Récupère toutes les analyses d'un utilisateur
 * GET /api/analysis/user/:userId
 */
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (!process.env.MONGODB_URI) {
      return res.status(503).json({
        error: 'MongoDB non configuré'
      });
    }
    
    const analyses = await getUserAnalyses(userId);
    
    res.json({
      success: true,
      count: analyses.length,
      analyses: analyses
    });
  } catch (error) {
    console.error('Erreur getUserAnalyses:', error);
    res.status(500).json({
      error: 'Erreur lors de la récupération des analyses',
      details: error.message
    });
  }
});

/**
 * Récupère une analyse spécifique par ID
 * GET /api/analysis/:analysisId
 */
router.get('/:analysisId', async (req, res) => {
  try {
    const { analysisId } = req.params;
    
    if (!process.env.MONGODB_URI) {
      return res.status(503).json({
        error: 'MongoDB non configuré'
      });
    }
    
    const analysis = await getAnalysisById(analysisId);
    
    if (!analysis) {
      return res.status(404).json({
        error: 'Analyse non trouvée'
      });
    }
    
    res.json({
      success: true,
      analysis: analysis
    });
  } catch (error) {
    console.error('Erreur getAnalysis:', error);
    res.status(500).json({
      error: 'Erreur lors de la récupération de l\'analyse',
      details: error.message
    });
  }
});

/**
 * Supprime une analyse
 * DELETE /api/analysis/:analysisId
 */
router.delete('/:analysisId', async (req, res) => {
  try {
    const { analysisId } = req.params;
    
    if (!process.env.MONGODB_URI) {
      return res.status(503).json({
        error: 'MongoDB non configuré'
      });
    }
    
    const deleted = await deleteAnalysis(analysisId);
    
    if (!deleted) {
      return res.status(404).json({
        error: 'Analyse non trouvée'
      });
    }
    
    res.json({
      success: true,
      message: 'Analyse supprimée avec succès'
    });
  } catch (error) {
    console.error('Erreur deleteAnalysis:', error);
    res.status(500).json({
      error: 'Erreur lors de la suppression de l\'analyse',
      details: error.message
    });
  }
});

export default router;

