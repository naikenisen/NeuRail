import {
  aiGenerateReminder,
  aiGenerateReply,
  aiReformulate,
  aiSummarizeMail,
} from '@domain/ai/ai.service';
import type {
  AiGenerateReminderPayload,
  AiGenerateReplyPayload,
  AiReformulatePayload,
  AiSummarizeMailPayload,
} from '@domain/ai/ai.types';
import { aiCall } from '@infrastructure/ai/gemini/gemini-client.service';

export async function summarizeMailWithGemini(payload: AiSummarizeMailPayload): Promise<string> {
  return aiSummarizeMail(aiCall, payload);
}

export async function reformulateWithGemini(payload: AiReformulatePayload): Promise<string> {
  return aiReformulate(aiCall, payload);
}

export async function generateReplyWithGemini(payload: AiGenerateReplyPayload): Promise<string> {
  return aiGenerateReply(aiCall, payload);
}

export async function generateReminderWithGemini(payload: AiGenerateReminderPayload): Promise<{ subject: string; body: string }> {
  return aiGenerateReminder(aiCall, payload);
}
