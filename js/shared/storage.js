import { DEFAULT_SETTINGS, PROVIDERS, SETTINGS_STORAGE_KEY } from './config.js';

function cloneSettings(value) {
  return JSON.parse(JSON.stringify(value));
}

function getStorageArea(areaName) {
  return chrome.storage[areaName];
}

function storageGet(areaName, keys) {
  return new Promise((resolve, reject) => {
    getStorageArea(areaName).get(keys, (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      resolve(result);
    });
  });
}

function storageSet(areaName, payload) {
  return new Promise((resolve, reject) => {
    getStorageArea(areaName).set(payload, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      resolve();
    });
  });
}

function storageRemove(areaName, keys) {
  return new Promise((resolve, reject) => {
    getStorageArea(areaName).remove(keys, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      resolve();
    });
  });
}

function buildNormalizedSettings(rawSettings = {}) {
  const normalized = cloneSettings(DEFAULT_SETTINGS);
  const incoming = rawSettings[SETTINGS_STORAGE_KEY] || rawSettings;

  normalized.apiType = PROVIDERS[incoming.apiType] ? incoming.apiType : DEFAULT_SETTINGS.apiType;

  for (const providerId of Object.keys(PROVIDERS)) {
    const providerSettings = incoming[providerId] || {};
    normalized[providerId] = {
      apiKey: typeof providerSettings.apiKey === 'string' ? providerSettings.apiKey.trim() : '',
      model: typeof providerSettings.model === 'string' && providerSettings.model.trim()
        ? providerSettings.model.trim()
        : DEFAULT_SETTINGS[providerId].model
    };
  }

  return normalized;
}

function buildLegacySettings(syncData, localData) {
  const merged = {
    apiType: syncData.apiType || localData.apiType || DEFAULT_SETTINGS.apiType
  };

  for (const providerId of Object.keys(PROVIDERS)) {
    const syncProvider = syncData[providerId] || {};
    const localProvider = localData[providerId] || {};

    merged[providerId] = {
      apiKey: localProvider.apiKey || syncProvider.apiKey || '',
      model: syncProvider.model || localProvider.model || DEFAULT_SETTINGS[providerId].model
    };
  }

  if (syncData.apiKey && !merged.openai.apiKey && merged.apiType === 'openai') {
    merged.openai.apiKey = syncData.apiKey;
  }

  if (syncData.apiKey && !merged.gemini.apiKey && merged.apiType === 'gemini') {
    merged.gemini.apiKey = syncData.apiKey;
  }

  return buildNormalizedSettings(merged);
}

export async function getSettings() {
  await ensureSettingsMigrated();
  const localData = await storageGet('local', SETTINGS_STORAGE_KEY);
  return buildNormalizedSettings(localData);
}

export async function saveSettings(settings) {
  const normalized = buildNormalizedSettings(settings);
  await storageSet('local', {
    [SETTINGS_STORAGE_KEY]: normalized
  });

  return normalized;
}

export async function ensureSettingsMigrated() {
  const localData = await storageGet('local', [SETTINGS_STORAGE_KEY, 'openai', 'gemini', 'deepseek', 'apiType']);

  if (localData[SETTINGS_STORAGE_KEY]) {
    const normalized = buildNormalizedSettings(localData);
    await storageSet('local', {
      [SETTINGS_STORAGE_KEY]: normalized
    });

    return normalized;
  }

  const syncData = await storageGet('sync', [SETTINGS_STORAGE_KEY, 'apiType', 'openai', 'gemini', 'deepseek', 'apiKey']);
  const migrated = buildLegacySettings(syncData, localData);

  await storageSet('local', {
    [SETTINGS_STORAGE_KEY]: migrated
  });

  const legacyKeys = ['apiType', 'openai', 'gemini', 'deepseek', 'apiKey', SETTINGS_STORAGE_KEY];
  await storageRemove('sync', legacyKeys);
  await storageRemove('local', ['apiType', 'openai', 'gemini', 'deepseek']);

  return migrated;
}
