document.addEventListener('DOMContentLoaded', function() {
  const apiTypeSelect = document.getElementById('apiType');
  const saveBtn = document.getElementById('saveBtn');
  const statusDiv = document.getElementById('status');

  const openaiSettingsDiv = document.getElementById('openai-settings');
  const geminiSettingsDiv = document.getElementById('gemini-settings');
  const openaiApiKeyInput = document.getElementById('openai-apiKey');
  const openaiModelInput = document.getElementById('openai-model');
  const geminiApiKeyInput = document.getElementById('gemini-apiKey');
  const geminiModelInput = document.getElementById('gemini-model');
  const deepseekSettingsDiv = document.getElementById('deepseek-settings');
  const deepseekApiKeyInput = document.getElementById('deepseek-apiKey');
  const deepseekModelInput = document.getElementById('deepseek-model');

  const defaultSettings = {
    apiType: 'openai',
    openai: { apiKey: '', model: 'gpt-4o-mini' },
    gemini: { apiKey: '', model: 'gemini-1.5-flash-latest' },
    deepseek: { apiKey: '', model: 'deepseek-chat' }
  };

  function toggleSettings(type) {
    openaiSettingsDiv.style.display = type === 'openai' ? 'block' : 'none';
    geminiSettingsDiv.style.display = type === 'gemini' ? 'block' : 'none';
    deepseekSettingsDiv.style.display = type === 'deepseek' ? 'block' : 'none';
  }

  // Load saved settings
  chrome.storage.sync.get(defaultSettings, function(settings) {
    apiTypeSelect.value = settings.apiType;
    openaiApiKeyInput.value = settings.openai.apiKey || '';
    openaiModelInput.value = settings.openai.model || defaultSettings.openai.model;
    geminiApiKeyInput.value = settings.gemini.apiKey || '';
    geminiModelInput.value = settings.gemini.model || defaultSettings.gemini.model;
    deepseekApiKeyInput.value = settings.deepseek.apiKey || '';
    deepseekModelInput.value = settings.deepseek.model || defaultSettings.deepseek.model;
    toggleSettings(settings.apiType);
  });

  // Change active settings view
  apiTypeSelect.addEventListener('change', function() {
    toggleSettings(this.value);
  });

  // Save settings
  saveBtn.addEventListener('click', function() {
    const settingsToSave = {
      apiType: apiTypeSelect.value,
      openai: {
        apiKey: openaiApiKeyInput.value.trim(),
        model: openaiModelInput.value.trim() || defaultSettings.openai.model
      },
      gemini: {
        apiKey: geminiApiKeyInput.value.trim(),
        model: geminiModelInput.value.trim() || defaultSettings.gemini.model
      },
      deepseek: {
        apiKey: deepseekApiKeyInput.value.trim(),
        model: deepseekModelInput.value.trim() || defaultSettings.deepseek.model
      }
    };

    chrome.storage.sync.set(settingsToSave, function() {
      showStatus('Settings saved successfully!', 'success');
    });
  });

  function showStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.className = 'status ' + type;
    statusDiv.style.display = 'block';

    setTimeout(function() {
      statusDiv.style.display = 'none';
    }
    , 3000);
  }
});