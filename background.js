let offscreenDocument = null;
let isRecording = false;
let currentPlayerState = 'stopped';
let textProcessorInjected = false;
let offscreenReady = false;

// Create or get the offscreen document
async function setupOffscreenDocument() {
  // Check if we already have an offscreen document
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT']
  });

  if (existingContexts.length > 0) {
    offscreenDocument = existingContexts[0];
    offscreenReady = true;
    return;
  }

  // Create an offscreen document
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['AUDIO_PLAYBACK'],
    justification: 'Playing TTS audio in the background'
  });
  
  offscreenReady = true;
}

// Set up context menu items
function setupContextMenu() {
  chrome.contextMenus.create({
    id: "readAloud",
    title: "Read Aloud",
    contexts: ["selection", "page"]
  });
}

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "readAloud") {
    let text = info.selectionText || "";
    
    if (!text) {
      // If no text is selected, get the page content
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: () => {
          return document.body.innerText;
        }
      }).then(results => {
        if (results && results[0] && results[0].result) {
          processAndReadText(results[0].result, tab.id);
        }
      });
    } else {
      // Use the selected text
      processAndReadText(text, tab.id);
    }
  }
});

// Process and read text with default settings
async function processAndReadText(text, tabId) {
  try {
    // Get default settings
    const settings = await chrome.storage.local.get({
      serverUrl: 'http://localhost:8000/v1/audio/speech',
      voice: 'af_bella',
      speed: 1.0,
      recordAudio: false,
      preprocessText: true
    });
    
    // Process text if enabled
    if (settings.preprocessText && tabId) {
      try {
        // Inject the text processor script only once per tab
        if (!textProcessorInjected) {
          await chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: ['textProcessor.js']
          });
          textProcessorInjected = true;
        }
        
        // Process the text
        const result = await chrome.scripting.executeScript({
          target: { tabId: tabId },
          func: (textToProcess) => {
            return window.TextProcessor.process(textToProcess);
          },
          args: [text]
        });
        
        if (result && result[0] && result[0].result) {
          text = result[0].result;
        }
      } catch (error) {
        console.error('Error processing text:', error);
        // Fall back to using the original text
      }
    }
    
    // Set state to loading
    currentPlayerState = 'loading';
    chrome.runtime.sendMessage({ 
      type: 'playerStateUpdate', 
      state: 'loading' 
    });
    
    // Start streaming audio
    startStreamingAudio(text, settings);
  } catch (error) {
    console.error('Error in processAndReadText:', error);
    chrome.runtime.sendMessage({ 
      type: 'streamError', 
      error: error.message 
    });
  }
}

// Handle messages from popup or offscreen document
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  try {
    switch (message.type) {
      case 'setupOffscreen':
        setupOffscreenDocument().then(() => sendResponse({ success: true }));
        return true; // Will respond async
        
      case 'startStreaming':
        isRecording = message.record;
        // Set state to loading before starting the audio stream
        currentPlayerState = 'loading';
        chrome.runtime.sendMessage({ 
          type: 'playerStateUpdate', 
          state: 'loading' 
        }, () => {
          if (chrome.runtime.lastError) {
            console.log('State update sent');
          }
        });
        startStreamingAudio(message.text, message.settings);
        sendResponse({ success: true });
        break;
        
      case 'controlAudio':
        chrome.runtime.sendMessage({ 
          type: message.action, 
          data: message.data 
        }, () => {
          if (chrome.runtime.lastError) {
            console.log('Control message sent');
          }
        });
        sendResponse({ success: true });
        break;
        
      case 'stateUpdate':
        currentPlayerState = message.state;
        chrome.runtime.sendMessage({ 
          type: 'playerStateUpdate', 
          state: message.state 
        }, () => {
          if (chrome.runtime.lastError) {
            console.log('State update sent');
          }
        });
        sendResponse({ success: true });
        break;
        
      case 'audioReady':
        // Audio is ready but not yet playing
        if (currentPlayerState === 'loading') {
          currentPlayerState = 'ready';
          chrome.runtime.sendMessage({ 
            type: 'playerStateUpdate', 
            state: 'ready' 
          }, () => {
            if (chrome.runtime.lastError) {
              console.log('Ready state sent');
            }
          });
        }
        sendResponse({ success: true });
        break;
        
      case 'getPlayerState':
        sendResponse({ state: currentPlayerState });
        break;
        
      case 'seek':
        chrome.runtime.sendMessage({ 
          type: 'seek', 
          time: message.time 
        }, (response) => {
          sendResponse(response || { success: false });
        });
        return true; // Will respond async
        
      case 'getTimeInfo':
        chrome.runtime.sendMessage({ 
          type: 'getTimeInfo' 
        }, (response) => {
          sendResponse(response || { timeInfo: null });
        });
        return true; // Will respond async
        
      case 'timeUpdate':
        // Forward time updates to the popup
        chrome.runtime.sendMessage(message, () => {
          if (chrome.runtime.lastError) {
            console.log('Time update forwarded');
          }
        });
        sendResponse({ success: true });
        break;
        
      default:
        sendResponse({ error: 'Unknown message type' });
    }
  } catch (error) {
    console.error('Error handling message:', error);
    sendResponse({ error: error.message });
  }
});

// Start streaming audio from the TTS server
async function startStreamingAudio(text, settings) {
  try {
    await setupOffscreenDocument();
    
    // Add a small delay to ensure offscreen document is fully ready
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const response = await fetch(settings.serverUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg, audio/wav, audio/*'
      },
      body: JSON.stringify({
        model: 'tts-1',
        voice: settings.voice,
        input: text,
        speed: parseFloat(settings.speed)
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    // Get the audio data as a blob
    const audioBlob = await response.blob();
    const mimeType = audioBlob.type || 'audio/mpeg';
    
    // Convert blob to array buffer to send to offscreen document
    const arrayBuffer = await audioBlob.arrayBuffer();
    
    // Send the audio data to the offscreen document
    chrome.runtime.sendMessage({ 
      type: 'processAudioData', 
      audioData: Array.from(new Uint8Array(arrayBuffer)),
      mimeType: mimeType,
      isRecording: isRecording
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Error sending message to offscreen:', chrome.runtime.lastError);
      }
    });
  } catch (error) {
    console.error('Error streaming audio:', error);
    
    // Update state to stopped on error
    currentPlayerState = 'stopped';
    chrome.runtime.sendMessage({ 
      type: 'playerStateUpdate', 
      state: 'stopped' 
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Error sending error message:', chrome.runtime.lastError);
      }
    });
  }
}

// Initialize context menu when extension is installed or updated
chrome.runtime.onInstalled.addListener(() => {
  setupContextMenu();
});