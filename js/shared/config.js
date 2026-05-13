export const PROVIDERS = {
  openai: {
    id: 'openai',
    label: 'OpenAI',
    badge: 'Responses API',
    description: 'Fast, high-quality summaries with current OpenAI text models.',
    apiKeyPlaceholder: 'sk-...',
    modelPlaceholder: 'gpt-4.1-mini',
    docsUrl: 'https://platform.openai.com/docs/overview',
    defaultModel: 'gpt-4.1-mini',
    endpointLabel: 'api.openai.com'
  },
  gemini: {
    id: 'gemini',
    label: 'Gemini',
    badge: 'GenerateContent API',
    description: 'Google Gemini 2.5 models with strong speed and long-context handling.',
    apiKeyPlaceholder: 'AIza...',
    modelPlaceholder: 'gemini-2.5-flash',
    docsUrl: 'https://ai.google.dev/gemini-api/docs',
    defaultModel: 'gemini-2.5-flash',
    endpointLabel: 'generativelanguage.googleapis.com'
  },
  deepseek: {
    id: 'deepseek',
    label: 'DeepSeek',
    badge: 'Chat Completions API',
    description: 'Cost-efficient summaries through the current DeepSeek-compatible chat endpoint.',
    apiKeyPlaceholder: 'sk-...',
    modelPlaceholder: 'deepseek-v4-flash',
    docsUrl: 'https://api-docs.deepseek.com/',
    defaultModel: 'deepseek-v4-flash',
    endpointLabel: 'api.deepseek.com'
  }
};

export const SUMMARY_TYPES = {
  concise: {
    label: 'Concise',
    helper: '3-4 sentence scan'
  },
  detailed: {
    label: 'Detailed',
    helper: 'Structured key arguments'
  },
  bullets: {
    label: 'Bullet Points',
    helper: 'Fast skim for meetings'
  },
  investor: {
    label: 'Investor Lens',
    helper: 'Macro and market framing'
  }
};

export const DEFAULT_SETTINGS = {
  apiType: 'openai',
  openai: {
    apiKey: '',
    model: PROVIDERS.openai.defaultModel
  },
  gemini: {
    apiKey: '',
    model: PROVIDERS.gemini.defaultModel
  },
  deepseek: {
    apiKey: '',
    model: PROVIDERS.deepseek.defaultModel
  }
};

export const SETTINGS_STORAGE_KEY = 'articleSummarizerSettings';
