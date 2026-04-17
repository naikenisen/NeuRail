import type { AiCallOptions, GeminiGeneratePart, GeminiGenerateResponse } from '@domain/ai/ai.types';

const GEMINI_MODEL = (process.env.GEMINI_MODEL ?? 'gemma-4-31b-it').trim() || 'gemma-4-31b-it';
const GEMINI_FALLBACK_MODELS = (process.env.GEMINI_FALLBACK_MODELS ?? 'gemma-3.1-flash-lite')
  .split(',')
  .map((model) => model.trim())
  .filter(Boolean);

function geminiModelCandidates(): string[] {
  const models: string[] = [];
  for (const model of [GEMINI_MODEL, ...GEMINI_FALLBACK_MODELS]) {
    if (model && !models.includes(model)) {
      models.push(model);
    }
  }
  return models.length ? models : ['gemma-4-31b-it', 'gemma-3.1-flash-lite'];
}

function extractCandidateParts(payload: GeminiGenerateResponse): GeminiGeneratePart[] {
  const candidates = payload.candidates;
  if (!candidates?.length) {
    throw new Error('Gemini response missing candidates');
  }

  const parts = candidates[0]?.content?.parts;
  if (!parts?.length) {
    throw new Error('Gemini response missing content parts');
  }

  return parts;
}

export async function aiCall({ token, prompt }: AiCallOptions): Promise<string> {
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.3 },
  };

  let lastError: Error | null = null;

  for (const model of geminiModelCandidates()) {
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(token)}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        lastError = new Error(`Gemini ${response.status} (${model}): ${errorBody}`);
        continue;
      }

      const parsed = (await response.json()) as GeminiGenerateResponse;
      const parts = extractCandidateParts(parsed);

      for (let index = parts.length - 1; index >= 0; index -= 1) {
        const part = parts[index];
        if (!part?.thought && typeof part?.text === 'string') {
          return part.text;
        }
      }

      const fallback = parts[parts.length - 1]?.text;
      if (typeof fallback === 'string') {
        return fallback;
      }

      throw new Error('Gemini response has no textual part');
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw lastError ?? new Error('All Gemini models failed');
}
