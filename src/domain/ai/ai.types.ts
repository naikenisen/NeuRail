export type AiCallOptions = {
  token: string;
  prompt: string;
};

export type AiReformulatePayload = {
  token?: string;
  text?: string;
};

export type AiGenerateReminderPayload = {
  token?: string;
  subject?: string;
  to?: string;
  body?: string;
};

export type AiGenerateReplyPayload = {
  token?: string;
  prompt?: string;
  subject?: string;
  from?: string;
  original_text?: string;
  draft?: string;
};

export type AiSummarizeMailPayload = {
  token?: string;
  body?: string;
};

export type AiReminderResult = {
  subject: string;
  body: string;
};

export type GeminiGeneratePart = {
  text?: string;
  thought?: boolean;
};

export type GeminiGenerateResponse = {
  candidates?: Array<{
    content?: {
      parts?: GeminiGeneratePart[];
    };
  }>;
};
