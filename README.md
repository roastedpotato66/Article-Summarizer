# Article Summarizer Chrome Extension

This Chrome extension summarizes article pages through one of three configurable providers: OpenAI, Gemini, or DeepSeek.

## What changed in the refactor

- Modernized popup and options UI with a dedicated three-provider design.
- Centralized provider defaults and settings so popup, options, and background logic stay aligned.
- Migrated keys and model settings into local extension storage to avoid sync drift and reduce accidental exposure across browser profiles.
- Tightened Chrome permissions to provider endpoints instead of using a broad `<all_urls>` host permission.
- Hardened async flows for extraction errors, duplicate submits, empty provider responses, and request timeouts.

## Features

- Summarize the current article page with one click.
- Switch between OpenAI, Gemini, and DeepSeek.
- Use concise, detailed, bullet-point, or investor-oriented summary modes.
- Override the model name for each provider.
- Render markdown output in the popup.

## Installation

1. Clone this repository or download it as a ZIP.
2. Open `chrome://extensions`.
3. Enable Developer mode.
4. Click Load unpacked and select this project directory.
5. Pin the extension if you want quick access from the toolbar.

## Configuration

1. Open the extension popup and click `Settings`.
2. Choose the active provider port.
3. Enter that provider's API key.
4. Keep the default model or replace it with another supported model ID.
5. Save settings.

## Default provider models

- OpenAI: `gpt-4.1-mini`
- Gemini: `gemini-2.5-flash`
- DeepSeek: `deepseek-chat`

These are only defaults. You can replace them with any compatible model ID supported by your own account.

## Notes

- API keys are stored in Chrome extension local storage for the current browser profile.
- Article extraction runs against the active page using `chrome.scripting`.
- The background worker calls provider APIs directly from the extension service worker.

## License

Apache License 2.0. See [LICENSE](/Users/frederickchen/LocalDocs/article-summarizer/LICENSE).
