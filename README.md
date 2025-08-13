# Article Summarizer Chrome Extension

This extension allows you to quickly summarize web articles using your own API keys for various AI services.

## Features

-   Summarize any article with a single click.
-   Supports multiple AI providers:
    -   OpenAI (GPT models)
    -   Google (Gemini models)
    -   DeepSeek
-   Multiple summary types: Concise, Detailed, Bullet Points, and a special "For Investor" analysis.
-   Securely stores your API keys in your browser's local storage.
-   Renders summaries in Markdown, including support for tables, code blocks, and LaTeX.

## Installation

1.  Clone this repository or download the source code as a ZIP file.
2.  Open Google Chrome and navigate to `chrome://extensions`.
3.  Enable "Developer mode" in the top right corner.
4.  Click "Load unpacked" and select the directory where you cloned/unzipped the source code.
5.  The Article Summarizer icon will appear in your extensions bar.

## Configuration

1.  Click on the Article Summarizer icon, then click the "Options" link in the popup.
2.  Alternatively, right-click the extension icon and select "Options".
3.  On the options page:
    -   Select your desired AI Service.
    -   Enter your API key for the selected service.
    -   (Optional) Change the default model name if you want to use a different one.
    -   Click "Save Settings".

### Getting API Keys

-   **OpenAI:** Get your key from platform.openai.com/api-keys.
-   **Google Gemini:** Get your key from aistudio.google.com/app/apikey.
-   **DeepSeek:** Get your key from the DeepSeek Platform.

## How to Use

1.  Navigate to an article you want to summarize.
2.  Click the Article Summarizer extension icon.
3.  Select a summary type from the dropdown.
4.  Click the "Summarize" button.
5.  The summary will appear in the popup window.

## Contributing

Contributions are welcome! Please feel free to submit a pull request or open an issue for any bugs or feature requests.