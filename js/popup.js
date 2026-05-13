import { PROVIDERS, SUMMARY_TYPES } from './shared/config.js';
import { getSettings } from './shared/storage.js';

const summarizeBtn = document.getElementById('summarizeBtn');
const summaryElement = document.getElementById('summary');
const summaryModeRowElement = document.getElementById('summaryModeRow');
const statusElement = document.getElementById('status');
const statusIconElement = document.getElementById('statusIcon');
const statusMessageElement = document.getElementById('statusMessage');
const wordCountElement = document.getElementById('wordCount');
const optionsLink = document.getElementById('optionsLink');
const currentModelElement = document.getElementById('currentModel');
const providerChipLabelElement = document.getElementById('providerChipLabel');
const providerEndpointElement = document.getElementById('providerEndpoint');

const POPUP_STATE_STORAGE_KEY = 'articleSummarizerPopupState';

let isSubmitting = false;
let selectedSummaryType = 'concise';

document.addEventListener('DOMContentLoaded', async () => {
  renderSummaryTypeChips();
  bindEvents();
  await hydratePopupState();
  await refreshProviderMeta();
  summarizeBtn.focus();
});

function bindEvents() {
  optionsLink.addEventListener('click', (event) => {
    event.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  summaryModeRowElement.addEventListener('click', async (event) => {
    const chip = event.target.closest('[data-summary-type]');
    if (!chip) {
      return;
    }

    const wasSelected = chip.dataset.summaryType === selectedSummaryType;
    selectedSummaryType = chip.dataset.summaryType;
    updateSummaryTypeUI();
    await savePopupState();

    if (!wasSelected && !isSubmitting) {
      void triggerSummarize();
    }
  });

  summarizeBtn.addEventListener('click', () => {
    void triggerSummarize();
  });

  chrome.storage.onChanged.addListener(async (changes, areaName) => {
    if (areaName === 'local' && changes.articleSummarizerSettings) {
      await refreshProviderMeta();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.repeat && !isSubmitting) {
      event.preventDefault();
      void triggerSummarize();
    }
  });
}

function renderSummaryTypeChips() {
  summaryModeRowElement.innerHTML = Object.entries(SUMMARY_TYPES).map(([value, meta]) => `
    <button class="mode-chip" type="button" data-summary-type="${value}" aria-pressed="false">
      <strong>${meta.label}</strong>
      <span>${meta.helper}</span>
    </button>
  `).join('');
  updateSummaryTypeUI();
}

function updateSummaryTypeUI() {
  for (const chip of summaryModeRowElement.querySelectorAll('[data-summary-type]')) {
    const isActive = chip.dataset.summaryType === selectedSummaryType;
    chip.classList.toggle('active', isActive);
    chip.setAttribute('aria-pressed', String(isActive));
  }
}

async function hydratePopupState() {
  try {
    const storedState = await chrome.storage.local.get(POPUP_STATE_STORAGE_KEY);
    const savedType = storedState?.[POPUP_STATE_STORAGE_KEY]?.summaryType;
    if (savedType && SUMMARY_TYPES[savedType]) {
      selectedSummaryType = savedType;
      updateSummaryTypeUI();
    }
  } catch (_error) {
    updateSummaryTypeUI();
  }
}

async function savePopupState() {
  try {
    await chrome.storage.local.set({
      [POPUP_STATE_STORAGE_KEY]: {
        summaryType: selectedSummaryType
      }
    });
  } catch (_error) {
    // Ignore preference-save failures to keep the summarize flow fast.
  }
}

async function triggerSummarize() {
  if (isSubmitting) {
    return;
  }

  isSubmitting = true;
  summarizeBtn.disabled = true;

  try {
    await ensureBackgroundReady();
    clearSummary();
    setStatus('info', 'Extracting article content...', true);

    const tab = await getActiveTab();
    const content = await extractContentFromTab(tab.id);

    if (!content || content.trim().length < 120) {
      throw new Error('This page does not expose enough readable article content to summarize.');
    }

    setStatus('info', 'Sending content to your selected provider...', true);

    const response = await sendRuntimeMessage({
      type: 'summarize',
      payload: {
        content,
        url: tab.url,
        summaryType: selectedSummaryType
      }
    });

    if (response?.status !== 'success' || !response.data) {
      throw new Error(response?.message || 'The summarization request failed.');
    }

    renderSummary(response.data);
    setStatus('success', 'Summary ready.', false);
  } catch (error) {
    renderError(error instanceof Error ? error.message : 'Unknown error');
  } finally {
    isSubmitting = false;
    summarizeBtn.disabled = false;
  }
}

async function refreshProviderMeta() {
  const settings = await getSettings();
  const provider = PROVIDERS[settings.apiType];
  const model = settings[settings.apiType]?.model || provider.defaultModel;

  providerChipLabelElement.textContent = provider.label;
  providerEndpointElement.textContent = provider.endpointLabel;
  currentModelElement.textContent = model;
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs?.[0];

  if (!tab?.id || !tab.url) {
    throw new Error('No active browser tab is available.');
  }

  if (!/^https?:/i.test(tab.url)) {
    throw new Error('Open a standard web article page before running a summary.');
  }

  return tab;
}

async function extractContentFromTab(tabId) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: extractPageContent
  });

  return results?.[0]?.result || '';
}

function renderSummary(summary) {
  marked.setOptions({
    gfm: true,
    breaks: true
  });

  const rendered = DOMPurify.sanitize(marked.parse(summary));
  summaryElement.innerHTML = rendered;
  wordCountElement.textContent = `${countWords(summary)} words`;
}

function renderError(message) {
  summaryElement.innerHTML = `<div class="summary-placeholder">${escapeHtml(message)}</div>`;
  wordCountElement.textContent = 'No output';
  setStatus('error', message, false);
}

function clearSummary() {
  summaryElement.innerHTML = '<div class="summary-placeholder">Working on your summary...</div>';
  wordCountElement.textContent = 'Generating...';
}

function setStatus(type, message, showSpinner) {
  statusElement.className = `status ${type} visible`;
  statusMessageElement.textContent = message;
  statusIconElement.style.display = showSpinner ? 'inline-block' : 'none';
}

function countWords(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function sendRuntimeMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        const runtimeMessage = chrome.runtime.lastError.message || 'Unknown runtime error';
        if (/Receiving end does not exist/i.test(runtimeMessage)) {
          reject(new Error('The extension background worker is unavailable. Reload the extension in chrome://extensions and try again.'));
          return;
        }

        reject(new Error(runtimeMessage));
        return;
      }

      resolve(response);
    });
  });
}

async function ensureBackgroundReady() {
  const response = await sendRuntimeMessage({ type: 'ping' });
  if (response?.status !== 'success') {
    throw new Error('The extension background worker did not respond.');
  }
}

function extractPageContent() {
  const blockedTags = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG', 'HEADER', 'FOOTER']);
  const candidateSelectors = [
    'article',
    '[role="article"]',
    'main article',
    'main',
    '.article-content',
    '.post-content',
    '.entry-content',
    '.story-body',
    '#article-body',
    '[itemprop="articleBody"]'
  ];

  function normalizedText(node) {
    return (node?.innerText || node?.textContent || '')
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();
  }

  function scoreElement(element) {
    const text = normalizedText(element);
    if (text.length < 300) {
      return { text, score: 0 };
    }

    const paragraphs = element.querySelectorAll('p').length;
    const headings = element.querySelectorAll('h1, h2, h3').length;
    const links = element.querySelectorAll('a').length;
    const textDensity = text.length / Math.max(element.querySelectorAll('*').length, 1);
    const score = text.length + (paragraphs * 120) + (headings * 80) + Math.min(textDensity * 10, 400) - (links * 8);
    return { text, score };
  }

  const clonedBody = document.body.cloneNode(true);
  clonedBody.querySelectorAll('*').forEach((node) => {
    if (
      blockedTags.has(node.tagName) ||
      node.matches('nav, aside, form, button, [aria-hidden="true"], [role="navigation"], [role="complementary"], .sidebar, .related, .advertisement, .ads, .share, .social, .newsletter')
    ) {
      node.remove();
    }
  });

  let best = { text: '', score: 0 };

  for (const selector of candidateSelectors) {
    const matches = clonedBody.querySelectorAll(selector);
    for (const match of matches) {
      const candidate = scoreElement(match);
      if (candidate.score > best.score) {
        best = candidate;
      }
    }
  }

  if (best.score > 0) {
    return best.text.slice(0, 40000);
  }

  const paragraphs = Array.from(clonedBody.querySelectorAll('p'))
    .map((paragraph) => normalizedText(paragraph))
    .filter((paragraph) => paragraph.length > 80)
    .join('\n\n');

  if (paragraphs.length >= 300) {
    return paragraphs.slice(0, 40000);
  }

  return normalizedText(clonedBody).slice(0, 40000);
}
