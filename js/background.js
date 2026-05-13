import { PROVIDERS } from './shared/config.js';
import { ensureSettingsMigrated, getSettings } from './shared/storage.js';

const MAX_INPUT_CHARS = 18000;
const DEFAULT_TIMEOUT_MS = 45000;

chrome.runtime.onInstalled.addListener(() => {
  ensureSettingsMigrated().catch((error) => {
    console.error('Failed to initialize settings:', error);
  });
});

chrome.runtime.onStartup.addListener(() => {
  ensureSettingsMigrated().catch((error) => {
    console.error('Failed to migrate settings on startup:', error);
  });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request?.type === 'ping') {
    sendResponse({ status: 'success', data: 'pong' });
    return false;
  }

  if (request?.type === 'summarize') {
    (async () => {
      try {
        const payload = validateSummaryPayload(request.payload);
        const settings = await getSettings();
        const summary = await summarizeArticle(payload, settings);
        sendResponse({ status: 'success', data: summary });
      } catch (error) {
        sendResponse({
          status: 'error',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    })();

    return true;
  }

  if (request?.type === 'testConnection') {
    (async () => {
      try {
        const result = await testProviderConnection(request.payload);
        sendResponse({ status: 'success', data: result });
      } catch (error) {
        sendResponse({
          status: 'error',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    })();

    return true;
  }

  return false;
});

function validateSummaryPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Missing summarize payload.');
  }

  const content = typeof payload.content === 'string' ? payload.content.trim() : '';
  const url = typeof payload.url === 'string' ? payload.url.trim() : '';
  const summaryType = typeof payload.summaryType === 'string' ? payload.summaryType.trim() : 'concise';

  if (!content || content.length < 120) {
    throw new Error('Could not extract enough article content to summarize.');
  }

  if (!url) {
    throw new Error('Missing page URL for summarization.');
  }

  return { content, url, summaryType };
}

async function summarizeArticle({ content, url, summaryType }, settings) {
  const providerId = settings.apiType;
  const providerConfig = PROVIDERS[providerId];

  if (!providerConfig) {
    throw new Error('Please choose a supported provider in settings.');
  }

  const providerSettings = settings[providerId];
  if (!providerSettings?.apiKey) {
    throw new Error(`${providerConfig.label} API key is missing. Open settings to add it.`);
  }

  const articleContent = truncateContent(normalizeText(content), MAX_INPUT_CHARS);
  const prompt = buildPrompt(summaryType, url);

  switch (providerId) {
    case 'openai':
      return callOpenAI({ prompt, content: articleContent, url, ...providerSettings });
    case 'gemini':
      return callGemini({ prompt, content: articleContent, url, ...providerSettings });
    case 'deepseek':
      return callDeepSeek({ prompt, content: articleContent, url, ...providerSettings });
    default:
      throw new Error('Unsupported provider selected.');
  }
}

function buildPrompt(summaryType, url) {
  const articleContext = `Article URL: ${url}`;

  switch (summaryType) {
    case 'concise':
      return `${articleContext}

Write a concise summary in 3-4 sentences that captures the central claim, the most important facts, and why the piece matters.`;
    case 'detailed':
      return `${articleContext}

Produce a structured summary with:
- Main thesis
- Key supporting details
- Important implications or takeaways`;
    case 'bullets':
      return `${articleContext}

Summarize the article as bullet points. Make each bullet start with a short bolded lead, followed by a single clear explanation.`;
    case 'investor':
      return `${articleContext}

Summarize this article for an investor audience. Cover the core development, likely market or industry implications, second-order effects, and a balanced risk/opportunity view. Do not provide personalized financial advice.`;
    default:
      return `${articleContext}

Summarize the article clearly and accurately.`;
  }
}

function buildSystemInstruction() {
  return [
    'You are a careful research assistant specializing in article summaries.',
    'Return clean markdown with short headings or bullets when useful.',
    'Stay grounded in the supplied article content and do not invent facts.',
    'If the article content appears incomplete, say so briefly and still summarize what is available.'
  ].join(' ');
}

function truncateContent(content, maxChars) {
  return content.length <= maxChars ? content : `${content.slice(0, maxChars)}\n\n[Content truncated for length]`;
}

function normalizeText(text) {
  return text
    .replace(/\u0000/g, '')
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function callOpenAI({ prompt, content, url, apiKey, model }) {
  const response = await fetchWithTimeout('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: 'system',
          content: [
            {
              type: 'input_text',
              text: buildSystemInstruction()
            }
          ]
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: `${prompt}\n\nContent:\n${content}`
            }
          ]
        }
      ],
      max_output_tokens: 1800
    })
  });

  const data = await parseJsonResponse(response);
  ensureSuccessfulResponse(response, data, 'OpenAI');

  const summary = extractOpenAIText(data);
  if (!summary) {
    throw new Error('OpenAI returned an empty response.');
  }

  return summary;
}

function extractOpenAIText(data) {
  if (typeof data.output_text === 'string' && data.output_text.trim()) {
    return data.output_text.trim();
  }

  const outputs = Array.isArray(data.output) ? data.output : [];
  for (const item of outputs) {
    const contentItems = Array.isArray(item.content) ? item.content : [];
    for (const part of contentItems) {
      if (part?.type === 'output_text' && typeof part.text === 'string' && part.text.trim()) {
        return part.text.trim();
      }
    }
  }

  return '';
}

async function callGemini({ prompt, content, apiKey, model }) {
  const response = await fetchWithTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: buildSystemInstruction() }]
        },
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `${prompt}\n\nContent:\n${content}`
              }
            ]
          }
        ],
        generationConfig: {
          maxOutputTokens: 1800,
          temperature: 0.4
        }
      })
    }
  );

  const data = await parseJsonResponse(response);
  ensureSuccessfulResponse(response, data, 'Gemini');

  const summary = data.candidates?.[0]?.content?.parts
    ?.map((part) => part?.text || '')
    .join('\n')
    .trim();

  if (!summary) {
    const blockReason = data.promptFeedback?.blockReason;
    throw new Error(blockReason ? `Gemini blocked the request: ${blockReason}` : 'Gemini returned an empty response.');
  }

  return summary;
}

async function callDeepSeek({ prompt, content, apiKey, model }) {
  const response = await fetchWithTimeout('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content: buildSystemInstruction()
        },
        {
          role: 'user',
          content: `${prompt}\n\nContent:\n${content}`
        }
      ],
      temperature: 0.4,
      max_tokens: 1800
    })
  });

  const data = await parseJsonResponse(response);
  ensureSuccessfulResponse(response, data, 'DeepSeek');

  const summary = data.choices?.[0]?.message?.content?.trim();
  if (!summary) {
    throw new Error('DeepSeek returned an empty response.');
  }

  return summary;
}

function ensureSuccessfulResponse(response, data, providerLabel) {
  if (response.ok && !data?.error) {
    return;
  }

  const providerMessage = data?.error?.message || data?.error?.status || response.statusText;
  throw new Error(`${providerLabel} API error: ${providerMessage || 'Unknown error'}`);
}

async function parseJsonResponse(response) {
  const rawText = await response.text();
  if (!rawText) {
    return {};
  }

  try {
    return JSON.parse(rawText);
  } catch (error) {
    throw new Error(`Unexpected non-JSON response from ${new URL(response.url).hostname}.`);
  }
}

async function testProviderConnection(payload) {
  const settings = validateProviderTestPayload(payload);
  const provider = PROVIDERS[settings.providerId];
  const { apiKey, model } = settings.providerSettings;

  if (!apiKey) {
    throw new Error(`${provider.label} API key is missing.`);
  }

  let availableModels = [];

  switch (settings.providerId) {
    case 'openai':
      availableModels = await listOpenAIModels(apiKey);
      break;
    case 'gemini':
      availableModels = await listGeminiModels(apiKey);
      break;
    case 'deepseek':
      availableModels = await listDeepSeekModels(apiKey);
      break;
    default:
      throw new Error('Unsupported provider selected.');
  }

  const matchedModel = findMatchingModelId(availableModels, model);
  return {
    providerId: settings.providerId,
    providerLabel: provider.label,
    model,
    modelFound: Boolean(matchedModel),
    matchedModel: matchedModel || null,
    availableModelCount: availableModels.length,
    message: matchedModel
      ? `${provider.label} connection verified. Model "${matchedModel}" is available.`
      : `${provider.label} authentication succeeded, but model "${model}" was not found in the provider model list.`
  };
}

function validateProviderTestPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Missing provider test payload.');
  }

  const providerId = payload.providerId;
  if (!PROVIDERS[providerId]) {
    throw new Error('Unsupported provider selected.');
  }

  const providerSettings = payload.providerSettings || {};
  const apiKey = typeof providerSettings.apiKey === 'string' ? providerSettings.apiKey.trim() : '';
  const model = typeof providerSettings.model === 'string' && providerSettings.model.trim()
    ? providerSettings.model.trim()
    : PROVIDERS[providerId].defaultModel;

  return {
    providerId,
    providerSettings: {
      apiKey,
      model
    }
  };
}

async function listOpenAIModels(apiKey) {
  const response = await fetchWithTimeout('https://api.openai.com/v1/models', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`
    }
  }, 20000);

  const data = await parseJsonResponse(response);
  ensureSuccessfulResponse(response, data, 'OpenAI');
  return Array.isArray(data.data) ? data.data.map((item) => item?.id).filter(Boolean) : [];
}

async function listGeminiModels(apiKey) {
  const response = await fetchWithTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}&pageSize=1000`,
    {
      method: 'GET'
    },
    20000
  );

  const data = await parseJsonResponse(response);
  ensureSuccessfulResponse(response, data, 'Gemini');

  if (!Array.isArray(data.models)) {
    return [];
  }

  return data.models
    .map((item) => item?.name || '')
    .filter(Boolean)
    .map((name) => name.replace(/^models\//, ''));
}

async function listDeepSeekModels(apiKey) {
  const response = await fetchWithTimeout('https://api.deepseek.com/models', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`
    }
  }, 20000);

  const data = await parseJsonResponse(response);
  ensureSuccessfulResponse(response, data, 'DeepSeek');
  return Array.isArray(data.data) ? data.data.map((item) => item?.id).filter(Boolean) : [];
}

function findMatchingModelId(availableModels, requestedModel) {
  const normalizedRequested = requestedModel.trim().toLowerCase();
  return availableModels.find((modelId) => modelId.toLowerCase() === normalizedRequested) || '';
}

async function fetchWithTimeout(url, options, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('The request timed out. Please try again or use a shorter article.');
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
