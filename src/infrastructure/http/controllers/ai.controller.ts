import type {
  AiGenerateReminderPayload,
  AiGenerateReplyPayload,
  AiReformulatePayload,
  AiSummarizeMailPayload,
} from '@domain/ai/ai.types';
import {
  generateReminderWithGemini,
  generateReplyWithGemini,
  reformulateWithGemini,
  summarizeMailWithGemini,
} from '@infrastructure/ai/gemini/ai-facade.service';

export async function summarizeMailController(payload: AiSummarizeMailPayload): Promise<{ ok: true; text: string }> {
  const text = await summarizeMailWithGemini(payload);
  return { ok: true, text };
}

export async function reformulateController(payload: AiReformulatePayload): Promise<{ ok: true; text: string }> {
  const text = await reformulateWithGemini(payload);
  return { ok: true, text };
}

export async function generateReplyController(payload: AiGenerateReplyPayload): Promise<{ ok: true; text: string }> {
  const text = await generateReplyWithGemini(payload);
  return { ok: true, text };
}

export async function generateReminderController(payload: AiGenerateReminderPayload): Promise<{ ok: true; reminder: { subject: string; body: string } }> {
  const reminder = await generateReminderWithGemini(payload);
  return { ok: true, reminder };
}
