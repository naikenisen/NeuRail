declare namespace NodeJS {
  interface ProcessEnv {
    NODE_ENV?: 'development' | 'production' | 'test';
    ISENAPP_DATA_DIR?: string;
    ISENAPP_VAULT_PATH?: string;
    ISENAPP_PYTHON?: string;
    GEMINI_API_KEY?: string;
    GEMINI_MODEL?: string;
    GEMINI_FALLBACK_MODELS?: string;
    EMBEDDING_MODEL?: string;
  }
}

export {};
