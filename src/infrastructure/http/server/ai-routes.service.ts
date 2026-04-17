import type {
  AiGenerateReminderPayload,
  AiGenerateReplyPayload,
  AiReformulatePayload,
  AiSummarizeMailPayload,
} from '@domain/ai/ai.types';
import {
  generateReminderController,
  generateReplyController,
  reformulateController,
  summarizeMailController,
} from '@infrastructure/http/controllers/ai.controller';
import type { JsonHttpServer } from '@infrastructure/http/server/http-server.service';

export function registerAiRoutes(server: JsonHttpServer): void {
  server.registerJsonRoute('POST', '/api/mail/summarize', async (payload) => {
    return summarizeMailController(payload as AiSummarizeMailPayload);
  });

  server.registerJsonRoute('POST', '/api/reformulate', async (payload) => {
    return reformulateController(payload as AiReformulatePayload);
  });

  server.registerJsonRoute('POST', '/api/generate-reply', async (payload) => {
    return generateReplyController(payload as AiGenerateReplyPayload);
  });

  server.registerJsonRoute('POST', '/api/generate-reminder', async (payload) => {
    return generateReminderController(payload as AiGenerateReminderPayload);
  });
}
