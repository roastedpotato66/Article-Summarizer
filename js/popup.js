document.addEventListener('DOMContentLoaded', function() {
  const summarizeBtn = document.getElementById('summarizeBtn');
  const summaryElement = document.getElementById('summary');
  const loaderElement = document.getElementById('loader');
  const summaryTypeElement = document.getElementById('summaryType');
  const statusBadge = document.getElementById('statusBadge');
  const wordCountElement = document.getElementById('wordCount');
  const optionsLink = document.getElementById('optionsLink');
  const currentModelElement = document.getElementById('currentModel');

  // Function to load and display the current model
  function loadCurrentModel() {
    // These defaults should be aligned with options.js and background.js
    const defaultSettings = {
        apiType: 'openai',
        openai: { apiKey: '', model: 'gpt-4o-mini' },
        gemini: { apiKey: '', model: 'gemini-1.5-flash-latest' },
        deepseek: { apiKey: '', model: 'deepseek-chat' }
    };
    chrome.storage.sync.get(defaultSettings, (settings) => {
      const apiType = settings.apiType;
      const model = settings[apiType].model;
      if (currentModelElement) {
        const displayModel = model || 'Not Set';
        currentModelElement.textContent = `Using: ${displayModel}`;
        currentModelElement.title = displayModel; // Tooltip for long names
      }
    });
  }

  // Load the model name when the popup opens
  loadCurrentModel();

  // Listen for changes in storage (e.g., user saves new options)
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync') {
      loadCurrentModel();
    }
  });
  
  // Open options page when link is clicked
  optionsLink.addEventListener('click', function(e) {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });
  
  summarizeBtn.addEventListener('click', async function() {
    // Show loader, update status
    loaderElement.style.display = 'block';
    statusBadge.textContent = 'Extracting content...';
    statusBadge.className = 'status-badge';
    statusBadge.style.display = 'inline-flex';
    summaryElement.textContent = '';
    wordCountElement.textContent = '';
    
    // Get current tab
    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    
    // Get selected summary type
    const summaryType = summaryTypeElement.value;
    
    // Execute content script to get page content
    chrome.scripting.executeScript({
      target: {tabId: tab.id},
      function: extractPageContent
    }, async (results) => {
      if (chrome.runtime.lastError || !results || !results[0]) {
        showError('Error extracting content: ' + (chrome.runtime.lastError ? chrome.runtime.lastError.message : 'Unknown error'));
        return;
      }
      
      const content = results[0].result;
      
      if (!content || content.length < 50) {
        showError('Could not extract meaningful content from this page.');
        return;
      }
      
      statusBadge.textContent = 'Generating summary...';
      
      // Send message to background script to perform summarization
      chrome.runtime.sendMessage({
        type: 'summarize',
        payload: {
          content: content,
          url: tab.url,
          summaryType: summaryType
        }
      }, (response) => {
        loaderElement.style.display = 'none';

        if (chrome.runtime.lastError) {
          showError('Error: ' + chrome.runtime.lastError.message);
          return;
        }

        if (response.status === 'success') {
          renderSummary(response.data);
        } else {
          showError('Error: ' + response.message);
        }
      });
    });
  });
  
  function renderSummary(summary) {
    // Configure marked to handle LaTeX
    marked.setOptions({
      renderer: new marked.Renderer(),
      gfm: true,
      breaks: true,
      sanitize: false,
      smartLists: true,
      smartypants: true
    });

    // Render markdown content with sanitization
    summaryElement.innerHTML = DOMPurify.sanitize(marked.parse(summary));

    // Show success status and word count
    statusBadge.textContent = 'Summary generated';
    statusBadge.className = 'status-badge success';
    
    const wordCount = summary.split(/\s+/).length;
    wordCountElement.textContent = `${wordCount} words`;
    
    // Hide status after a delay
    setTimeout(() => {
      statusBadge.style.display = 'none';
    }, 3000);
  }

  function showError(message) {
    statusBadge.textContent = message;
    statusBadge.className = 'status-badge error';
    summaryElement.textContent = message;
    loaderElement.style.display = 'none';
    
    // Hide error after delay
    setTimeout(() => {
      statusBadge.style.display = 'none';
    }, 5000);
  }
});

function extractPageContent() {
  // Try to find the most relevant content container
  function getTextContent(element) {
    return element.textContent.trim().replace(/\s+/g, ' ');
  }
  
  // Prioritized selectors for article content
  const contentSelectors = [
    'article', 
    '[role="article"]',
    '.article-content', 
    '.post-content',
    '.entry-content',
    '.content-article',
    '#article-body',
    'main',
    '.main-content'
  ];
  
  // Find the first matching selector with substantial content
  for (const selector of contentSelectors) {
    const elements = document.querySelectorAll(selector);
    for (const element of elements) {
      const content = getTextContent(element);
      if (content.length > 250) {
        return content;
      }
    }
  }
  
  // Fallback: look for paragraphs
  const paragraphs = Array.from(document.querySelectorAll('p'));
  if (paragraphs.length > 3) {
    // Get paragraphs that have reasonable length (to filter out nav/footer text)
    const contentParagraphs = paragraphs
      .filter(p => getTextContent(p).length > 50)
      .map(p => getTextContent(p))
      .join('\n\n');
      
    if (contentParagraphs.length > 250) {
      return contentParagraphs;
    }
  }
  
  // Last resort: just get body text
  return document.body.innerText.substring(0, 30000);
}