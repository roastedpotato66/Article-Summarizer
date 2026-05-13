import { DEFAULT_SETTINGS, PROVIDERS } from './shared/config.js';
import { getSettings, saveSettings } from './shared/storage.js';

function cloneSettings(value) {
  return JSON.parse(JSON.stringify(value));
}

const providerGrid = document.getElementById('providerGrid');
const activeProviderNameElement = document.getElementById('activeProviderName');
const activeProviderDescriptionElement = document.getElementById('activeProviderDescription');
const activeProviderBadgeElement = document.getElementById('activeProviderBadge');
const providerPanelTitleElement = document.getElementById('providerPanelTitle');
const providerPanelCopyElement = document.getElementById('providerPanelCopy');
const providerDocsLink = document.getElementById('providerDocsLink');
const apiKeyInput = document.getElementById('apiKeyInput');
const modelInput = document.getElementById('modelInput');
const toggleKeyBtn = document.getElementById('toggleKeyBtn');
const testBtn = document.getElementById('testBtn');
const saveBtn = document.getElementById('saveBtn');
const statusElement = document.getElementById('status');

let draftSettings = cloneSettings(DEFAULT_SETTINGS);

document.addEventListener('DOMContentLoaded', async () => {
  renderProviderCards();
  wireEvents();
  draftSettings = await getSettings();
  syncViewFromSettings();
});

function renderProviderCards() {
  providerGrid.innerHTML = Object.values(PROVIDERS).map((provider) => `
    <button class="provider-card" type="button" data-provider-id="${provider.id}">
      <div class="provider-topline">
        <h3 class="provider-name">${provider.label}</h3>
        <span class="provider-badge">${provider.badge}</span>
      </div>
      <p class="provider-description">${provider.description}</p>
      <p class="provider-meta">Default model: ${provider.defaultModel}</p>
    </button>
  `).join('');
}

function wireEvents() {
  providerGrid.addEventListener('click', (event) => {
    const target = event.target.closest('[data-provider-id]');
    if (!target) {
      return;
    }

    persistActiveProviderDraft();
    draftSettings.apiType = target.dataset.providerId;
    syncViewFromSettings();
  });

  toggleKeyBtn.addEventListener('click', () => {
    const shouldReveal = apiKeyInput.type === 'password';
    apiKeyInput.type = shouldReveal ? 'text' : 'password';
    toggleKeyBtn.textContent = shouldReveal ? 'Hide' : 'Show';
  });

  saveBtn.addEventListener('click', async () => {
    if (saveBtn.disabled || testBtn.disabled) {
      return;
    }

    persistActiveProviderDraft();

    saveBtn.disabled = true;
    hideStatus();

    try {
      const normalized = await saveSettings(draftSettings);
      draftSettings = normalized;
      syncViewFromSettings();
      showStatus('success', 'Settings saved. New popup summaries will use this provider configuration.');
    } catch (error) {
      showStatus('error', error instanceof Error ? error.message : 'Failed to save settings.');
    } finally {
      saveBtn.disabled = false;
    }
  });

  testBtn.addEventListener('click', async () => {
    if (saveBtn.disabled || testBtn.disabled) {
      return;
    }

    persistActiveProviderDraft();
    setButtonsDisabled(true);
    showStatus('info', 'Checking provider authentication and model availability without running a summary...');

    try {
      const providerId = draftSettings.apiType;
      const response = await sendRuntimeMessage({
        type: 'testConnection',
        payload: {
          providerId,
          providerSettings: draftSettings[providerId]
        }
      });

      if (response?.status !== 'success') {
        throw new Error(response?.message || 'Connection test failed.');
      }

      const { data } = response;
      const suffix = data.modelFound
        ? ` Model available: ${data.matchedModel}.`
        : ` Authentication worked, but the model name was not found: ${data.model}.`;
      showStatus(data.modelFound ? 'success' : 'error', `${data.message}${suffix}`);
    } catch (error) {
      showStatus('error', error instanceof Error ? error.message : 'Connection test failed.');
    } finally {
      setButtonsDisabled(false);
    }
  });
}

function persistActiveProviderDraft() {
  const providerId = draftSettings.apiType;
  draftSettings[providerId] = {
    apiKey: apiKeyInput.value.trim(),
    model: modelInput.value.trim() || PROVIDERS[providerId].defaultModel
  };
}

function syncViewFromSettings() {
  const provider = PROVIDERS[draftSettings.apiType];
  const providerSettings = draftSettings[provider.id];

  for (const card of providerGrid.querySelectorAll('[data-provider-id]')) {
    card.classList.toggle('active', card.dataset.providerId === provider.id);
  }

  activeProviderNameElement.textContent = provider.label;
  activeProviderDescriptionElement.textContent = provider.description;
  activeProviderBadgeElement.textContent = provider.badge;
  providerPanelTitleElement.textContent = `${provider.label} configuration`;
  providerPanelCopyElement.textContent = `Endpoint: ${provider.endpointLabel}. Leave the model as-is for a safe default, or override it if your account uses a different supported model ID.`;
  providerDocsLink.href = provider.docsUrl;
  apiKeyInput.placeholder = provider.apiKeyPlaceholder;
  apiKeyInput.value = providerSettings.apiKey || '';
  modelInput.placeholder = provider.modelPlaceholder;
  modelInput.value = providerSettings.model || provider.defaultModel;
}

function showStatus(type, message) {
  statusElement.className = `status ${type} visible`;
  statusElement.textContent = message;
}

function hideStatus() {
  statusElement.className = 'status';
  statusElement.textContent = '';
}

function setButtonsDisabled(disabled) {
  saveBtn.disabled = disabled;
  testBtn.disabled = disabled;
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
