const defaultSettings = {
  apiType: 'openai',
  openai: { apiKey: '', model: 'gpt-5-nano-2025-08-07' },
  gemini: { apiKey: '', model: 'gemini-2.5-flash-lite' },
  deepseek: { apiKey: '', model: 'deepseek-chat' }
};

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.storage.sync.set(defaultSettings);
  } else if (details.reason === 'update') {
    // Migrate settings from older versions to the new structure
    chrome.storage.sync.get(null, (items) => {
      const mergedSettings = {
        apiType: items.apiType || defaultSettings.apiType,
        openai: { ...defaultSettings.openai, ...(items.openai || {}) },
        gemini: { ...defaultSettings.gemini, ...(items.gemini || {}) },
        deepseek: { ...defaultSettings.deepseek, ...(items.deepseek || {}) }
      };

      // Handle migration from the very old single apiKey format
      if (items.apiKey && !items.openai && !items.gemini) {
        if (items.apiType === 'gemini') {
          mergedSettings.gemini.apiKey = items.apiKey;
        } else {
          mergedSettings.openai.apiKey = items.apiKey;
        }
      }
      
      chrome.storage.sync.set(mergedSettings, () => {
        if (items.apiKey) {
          chrome.storage.sync.remove('apiKey');
        }
      });
    });
  }
  console.log('Article Summarizer extension installed/updated.');

});

function generatePrompt(summaryType, url) {
  switch(summaryType) {
    case 'concise':
      return `Summarize this article from ${url} in a concise way (3-4 sentences), focusing only on the most important facts.`;
    case 'detailed':
      return `Provide a comprehensive summary of this article from ${url} covering: 
        1. Main topic and key arguments
        2. Supporting evidence presented
        3. Conclusions or implications`;
    case 'bullets':
      return `Extract key points from this article from ${url} as bullet points. 
        For each point, include:
        - The core idea in bold
        - A brief 1-sentence explanation`;
    case 'investor':
      return `Summarize this article from ${url} for an investor+power owner (think Kenneth C. Griffin or Ray Dalio). Use serious economics, finance, and social science knowledge to analyze the content of the news and provide an objective outlook for the impacts created by this event and how it will impact the world politically, economically, etc. Then, provide a detailed investment strategy (covering all markets, primary & secondary markets, buy-side, PE, etc.) for this event.`;
    default:
      return `Summarize this article from ${url}:`;
  }
}

function fixEncoding(text) {
  if (!text) return '';
  return text.replace(/â€™/g, "'").replace(/â€œ/g, '"').replace(/â€/g, '"').replace(/â€"/g, "—").replace(/â€¦/g, "…").replace(/Â /g, " ").replace(/â€¢/g, "•");
}

async function getSummary(content, url, summaryType, settings) {
  const maxLength = 15000;
  const truncatedContent = content.length > maxLength ? content.substring(0, maxLength) + "..." : content;
  const prompt = generatePrompt(summaryType, url);
  const { apiType } = settings;

  if (apiType === 'openai') {
    const { apiKey, model } = settings.openai;
    if (!apiKey) throw new Error('OpenAI API key is not set.');
    return await callOpenAI(prompt, truncatedContent, url, apiKey, model);
  } else if (apiType === 'gemini') {
    const { apiKey, model } = settings.gemini;
    if (!apiKey) throw new Error('Gemini API key is not set.');
    return await callGemini(prompt, truncatedContent, url, apiKey, model);
  } else if (apiType === 'deepseek') {
    const { apiKey, model } = settings.deepseek;
    if (!apiKey) throw new Error('DeepSeek API key is not set.');
    return await callDeepSeek(prompt, truncatedContent, url, apiKey, model);
  }
  throw new Error('Invalid API type selected.');
}

async function callOpenAI(prompt, content, url, apiKey, model) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model,
      messages: [
        {
          role: 'system',
          content: 'You are a skilled assistant that specializes in creating clear, accurate summaries of online content. Format your responses using markdown for better readability. Use headings, bullet points, and emphasis where appropriate. If needed, you can include LaTeX math expressions using $ notation.'
        },
        {
          role: 'user',
          content: `${prompt}\n\nArticle URL: ${url}\n\nContent:\n${content}`
        }
      ],
      max_completion_tokens: 2000
    })
  });

  const data = await response.json();

  if (!response.ok || data.error) {
    throw new Error(data.error?.message || 'Unknown OpenAI API error');
  }

  const summary = data.choices?.[0]?.message?.content;
  if (!summary) {
    throw new Error('No summary returned from OpenAI. The content may have been blocked or the response was empty.');
  }

  return fixEncoding(summary);
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'summarize') {
    // Use an async function to handle the asynchronous operations
    (async () => {
      try {
        const { content, url, summaryType } = request.payload;
        
        // 1. Get the latest settings from storage
        const settings = await new Promise((resolve) => {
          chrome.storage.sync.get(defaultSettings, resolve);
        });

        // 2. Call the main getSummary function
        const summary = await getSummary(content, url, summaryType, settings);
        
        // 3. Send a success response
        sendResponse({ status: 'success', data: summary });

      } catch (error) {
        // 4. Send an error response
        sendResponse({ status: 'error', message: error.message });
      }
    })();
    
    // Return true to indicate that the response will be sent asynchronously
    return true;
  }
});

async function callGemini(prompt, content, url, apiKey, model) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      contents: [{
        parts: [{
          text: `${prompt}\n\nArticle URL: ${url}\n\nContent:\n${content}`
        }]
      }],
      generationConfig: {
        maxOutputTokens: 2000
      }
    })
  });

  const data = await response.json();

  if (!response.ok || data.error) {
    throw new Error(data.error?.message || 'Unknown Gemini API error');
  }

  const summary = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!summary) {
    const blockReason = data.promptFeedback?.blockReason;
    if (blockReason) {
      throw new Error(`No summary returned from Gemini. Reason: ${blockReason}`);
    }
    throw new Error('No summary returned from Gemini. The response was empty or malformed.');
  }
  return fixEncoding(summary);
}

async function callDeepSeek(prompt, content, url, apiKey, model) {
  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model,
      messages: [
        {
          role: 'system',
          content: 'You are a skilled assistant that specializes in creating clear, accurate summaries of online content. Format your responses using markdown for better readability. Use headings, bullet points, and emphasis where appropriate. If needed, you can include LaTeX math expressions using $ notation.'
        },
        {
          role: 'user',
          content: `${prompt}\n\nArticle URL: ${url}\n\nContent:\n${content}`
        }
      ],
      max_tokens: 2000
    })
  });

  const data = await response.json();

  if (!response.ok || data.error) {
    throw new Error(data.error?.message || 'Unknown DeepSeek API error');
  }

  const summary = data.choices?.[0]?.message?.content;
  if (!summary) {
    throw new Error('No summary returned from DeepSeek. The content may have been blocked or the response was empty.');
  }

  return fixEncoding(summary);
}