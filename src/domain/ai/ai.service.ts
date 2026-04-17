import type {
  AiCallOptions,
  AiGenerateReminderPayload,
  AiGenerateReplyPayload,
  AiReformulatePayload,
  AiReminderResult,
  AiSummarizeMailPayload,
} from '@domain/ai/ai.types';

export type AiCaller = (options: AiCallOptions) => Promise<string>;

function extractToken(token?: string): string {
  if (!token?.trim()) {
    throw new Error('Gemini API token is required');
  }
  return token.trim();
}

export async function aiReformulate(aiCall: AiCaller, payload: AiReformulatePayload): Promise<string> {
  const token = extractToken(payload.token);
  const text = payload.text ?? '';
  const prompt =
    'Corriges la syntaxe, la grammaire et l\'orthographe du texte suivant. ' +
    'Réponds UNIQUEMENT avec le texte corrigé, sans commentaire ni explication :\n\n' +
    text;
  return aiCall({ token, prompt });
}

export async function aiGenerateReminder(aiCall: AiCaller, payload: AiGenerateReminderPayload): Promise<AiReminderResult> {
  const token = extractToken(payload.token);
  const originalSubject = payload.subject ?? '';
  const originalTo = payload.to ?? '';
  const originalBody = payload.body ?? '';

  const prompt =
    'Tu es un assistant professionnel. Il y a 3 jours j\'ai envoyé un mail et je n\'ai pas reçu de réponse. ' +
    'Génère un mail de relance poli et professionnel en français. ' +
    'Réponds UNIQUEMENT en JSON valide (sans balises markdown) avec cette structure :\n' +
    '{"subject":"...","body":"..."}\n\n' +
    'Mail original :\n' +
    `À : ${originalTo}\n` +
    `Sujet : ${originalSubject}\n` +
    `Corps :\n${originalBody}`;

  let content = await aiCall({ token, prompt });
  if (content.includes('```')) {
    content = content.includes('```json')
      ? content.split('```json').at(-1) ?? content
      : content.split('```')[1] ?? content;
    content = content.split('```')[0] ?? content;
  }

  const parsed = JSON.parse(content.trim()) as Partial<AiReminderResult>;
  return {
    subject: String(parsed.subject ?? ''),
    body: String(parsed.body ?? ''),
  };
}

export async function aiGenerateReply(aiCall: AiCaller, payload: AiGenerateReplyPayload): Promise<string> {
  const token = extractToken(payload.token);
  const userPrompt = payload.prompt ?? '';
  const subject = payload.subject ?? '';
  const sender = payload.from ?? '';
  const originalText = payload.original_text ?? '';
  const draft = payload.draft ?? '';

  const prompt =
    'Tu es un assistant de redaction email professionnel en francais. ' +
    'Genere UNIQUEMENT le texte de reponse (sans objet, sans salutation imposee, sans commentaire). ' +
    'Respecte strictement les instructions utilisateur ci-dessous. ' +
    'N\'inclus pas le message original dans la sortie.\n\n' +
    `Sujet du fil : ${subject}\n` +
    `Expediteur original : ${sender}\n\n` +
    'Instructions utilisateur :\n' +
    `${userPrompt}\n\n` +
    'Brouillon actuel (a ameliorer si present) :\n' +
    `${draft}\n\n` +
    'Message original recu (contexte, NE PAS recopier integralement) :\n' +
    `${originalText}`;

  return aiCall({ token, prompt });
}

export async function aiSummarizeMail(aiCall: AiCaller, payload: AiSummarizeMailPayload): Promise<string> {
  const token = extractToken(payload.token);
  const body = payload.body ?? '';

  const prompt =
    'CONSIGNE DE FORMAT STRICTE : ta réponse ENTIÈRE doit être UN SEUL PARAGRAPHE ' +
    'de prose continue, SANS AUCUN retour à la ligne.\n' +
    'INTERDIT : titres, sous-titres, gras (**), bullet points (- ou *), ' +
    'listes numérotées, sections, sauts de ligne, markdown.\n' +
    'INTERDIT : métadonnées (date, expéditeur, destinataire, objet), ' +
    'noms des personnes qui envoient ou reçoivent le mail.\n' +
    'OBLIGATOIRE : phrases complètes enchaînées, style compte-rendu narratif, ' +
    'tous les faits (chiffres, noms d\'auteurs, journaux, fichiers) intégrés ' +
    'dans le texte. Va directement aux faits sans introduction.\n' +
    'Ignore les rendez-vous, réunions, visioconférences et pièces jointes.\n' +
    'Réponds UNIQUEMENT avec le paragraphe.\n\n' +
    'MAIL À RÉSUMER :\n' +
    `${body}`;

  const raw = await aiCall({ token, prompt });

  let text = raw.replace(/\*\*([^*]+)\*\*/g, '$1');
  text = text.replace(/\*([^*]+)\*/g, '$1');
  text = text.replace(/_([^_]+)_/g, '$1');
  text = text.replace(/^#{1,6}\s+/gm, '');
  text = text.replace(/^\s*[-*•]\s+/gm, '');
  text = text.replace(/^\s*\d+[.)]\s+/gm, '');
  text = text.replace(/\n+/g, ' ');
  text = text.replace(/  +/g, ' ').trim();

  return text;
}
