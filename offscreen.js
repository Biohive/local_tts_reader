let audioContext = null;
let audioElement = null;
let isPlaying = false;
let audioSource = null;
let hasSourceConnected = false;

// Safe message sending helper that handles connection errors gracefully
function sendSafeMessage(message, callback) {
  chrome.runtime.sendMessage(message, (response) => {
    if (chrome.runtime.lastError) {
      console.log('Message send (receiver not ready):', message.type);
    } else if (callback) {
      callback(response);
    }
  });
}

// Initialize the audio context
function initAudio() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  
  // Resume audio context if suspended
  if (audioContext.state === 'suspended') {
    audioContext.resume().catch(e => console.error('Error resuming audio context:', e));
  }
  
  if (!audioElement) {
    audioElement = document.getElementById('audioElement');
    if (!audioElement) {
      audioElement = document.createElement('audio');
      audioElement.id = 'audioElement';
      audioElement.controls = true; // For debugging
      document.body.appendChild(audioElement);
    }
  }
}

// Process audio data received from background script
function processAudioData(audioDataArray, mimeType, isRecording) {
  try {
    initAudio();
    
    // Convert array back to Uint8Array
    const uint8Array = new Uint8Array(audioDataArray);
    
    // Create blob from the array
    const blob = new Blob([uint8Array], { type: mimeType });
    
    // Create URL for the blob
    const audioUrl = URL.createObjectURL(blob);
    
    // If recording is enabled, send URL back for download
    if (isRecording) {
      sendSafeMessage({ 
        type: 'recordingComplete', 
        audioUrl: audioUrl
      });
    }
    
    // Play the audio
    playAudioUrl(audioUrl);
    
    // Notify that audio is ready to play
    sendSafeMessage({ type: 'audioReady' });
  } catch (error) {
    console.error('Error processing audio data:', error);
    sendSafeMessage({ 
      type: 'streamError', 
      error: error.message 
    });
  }
}

// Play audio from URL
function playAudioUrl(audioUrl) {
  try {
    console.log('Playing audio URL:', audioUrl);
    
    // Reset connection flag
    hasSourceConnected = false;
    
    // Set up audio element
    audioElement.src = audioUrl;
    
    // Set up event listeners
    audioElement.onplay = () => {
      isPlaying = true;
      
      // Connect to audio context only once
      if (!hasSourceConnected) {
        try {
          // Create and connect new source only if it doesn't exist
          if (!audioSource) {
            audioSource = audioContext.createMediaElementSource(audioElement);
            audioSource.connect(audioContext.destination);
          }
          hasSourceConnected = true;
        } catch (e) {
          console.error('Error connecting audio source:', e);
        }
      }
      
      sendSafeMessage({ type: 'stateUpdate', state: 'playing' });
    };
    
    audioElement.onpause = () => {
      isPlaying = false;
      sendSafeMessage({ type: 'stateUpdate', state: 'paused' });
    };
    
    audioElement.onended = () => {
      isPlaying = false;
      sendSafeMessage({ type: 'stateUpdate', state: 'stopped' });
      sendSafeMessage({ type: 'streamComplete' });
    };
    
    // Add timeupdate event for seeking
    audioElement.ontimeupdate = () => {
      sendSafeMessage({ 
        type: 'timeUpdate', 
        timeInfo: {
          currentTime: audioElement.currentTime,
          duration: audioElement.duration
        }
      });
    };
    
    // Start playing
    audioElement.play().catch(err => {
      console.error('Play error:', err);
      sendSafeMessage({ 
        type: 'streamError', 
        error: err.message 
      });
    });
  } catch (error) {
    console.error('Error playing audio URL:', error);
    sendSafeMessage({ 
      type: 'streamError', 
      error: error.message 
    });
  }
}

// Get current player state
function getPlayerState() {
  if (!audioElement) return 'stopped';
  if (audioElement.paused) {
    return audioElement.currentTime > 0 && audioElement.currentTime < audioElement.duration ? 'paused' : 'stopped';
  }
  return 'playing';
}

// Get current time and duration
function getTimeInfo() {
  if (!audioElement) return null;
  return {
    currentTime: audioElement.currentTime,
    duration: audioElement.duration
  };
}

// Seek to a specific time
function seekTo(time) {
  if (!audioElement) return false;
  try {
    audioElement.currentTime = time;
    return true;
  } catch (error) {
    console.error('Error seeking:', error);
    return false;
  }
}

// Handle messages from the background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Offscreen received message:', message.type);
  
  try {
    switch (message.type) {
      case 'processAudioData':
        if (message.audioData) {
          processAudioData(message.audioData, message.mimeType, message.isRecording);
        }
        sendResponse({ success: true });
        break;
        
      case 'play':
        if (audioElement) {
          audioElement.play().catch(err => console.error('Play error:', err));
        }
        sendResponse({ success: true });
        break;
        
      case 'pause':
        if (audioElement) {
          audioElement.pause();
        }
        sendResponse({ success: true });
        break;
        
      case 'stop':
        if (audioElement) {
          audioElement.pause();
          audioElement.currentTime = 0;
          sendSafeMessage({ type: 'stateUpdate', state: 'stopped' });
        }
        sendResponse({ success: true });
        break;
        
      case 'seek':
        const success = seekTo(message.time);
        sendResponse({ success });
        break;
        
      case 'getState':
        sendResponse({ state: getPlayerState() });
        break;
        
      case 'getTimeInfo':
        sendResponse({ timeInfo: getTimeInfo() });
        break;
        
      default:
        sendResponse({ error: 'Unknown message type' });
    }
  } catch (error) {
    console.error('Error handling message:', error);
    sendResponse({ error: error.message });
  }
});

// Initialize when the document loads
document.addEventListener('DOMContentLoaded', () => {
  console.log('Offscreen document loaded');
  
  // Create audio element
  audioElement = document.createElement('audio');
  audioElement.id = 'audioElement';
  audioElement.controls = true; // For debugging
  document.body.appendChild(audioElement);
  
  // Initialize audio context
  initAudio();
  
  console.log('Offscreen document initialized');
});