# Local TTS Reader - Chrome Extension

A sleek Chrome extension that converts webpage text to speech using a local OpenAI-compatible TTS server. Features include voice selection, speed control, and the ability to save audio files.


## Features

- 🎯 Read selected text or entire webpage
- 🎭 Multiple voice options compatible with OpenAI voice mappings
- ⚡ Adjustable playback speed (0.25x to 4.0x)
- 💾 Option to save audio for download
- ⏯️ Play/Pause/Stop/Seek controls
- 🎨 Clean, modern interface
- 🔧 Configurable server URL
- 🌐 Works with Tailscale/local network TTS servers

## Installation

1. Clone this repository:
```bash
git clone https://github.com/phildougherty/local_tts_reader.git
```

2. Load the extension in Chrome:
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" in the top right
   - Click "Load unpacked"
   - Select the cloned repository folder

## Usage

1. Click the extension icon in your Chrome toolbar
2. Configure your settings:
   - Select your preferred voice
   - Adjust the playback speed using the slider
   - Check "Save audio for download" if you want to download the audio
   - Enter your local TTS server URL

3. On any webpage:
   - Select specific text to read just that portion
   - Or don't select anything to read the entire page
   - Click play to start TTS
   - Use pause/stop controls as needed
   - Download the audio if recording was enabled

## Voice Options

The extension dynamically fetches available voices from your TTS server via the `/v1/audio/voices` endpoint. Voice options depend on your server implementation.

### Fetching Voices

1. Configure your server URL in the settings
2. Click the **refresh icon** next to the voice dropdown to fetch available voices from your server
3. The extension caches the voice list for future use

### Default Voices (Fallback)

If voice fetching is not available, the extension includes default OpenAI-compatible voice options:

**Female Voices:**
- Nicole (Ash) - `af_nicole`
- Bella (Echo) - `af_bella` (default)
- Sarah (Fable) - `af_sarah`
- Isabella (Nova) - `bf_isabella`
- Sky (Shimmer) - `af_sky`

**Male Voices:**
- Adam (Alloy) - `am_adam`
- George (Onyx) - `bm_george`
- Michael (Sage) - `am_michael`
- Emma (Coral) - `bf_emma`

## Server Requirements

Your local TTS server should:
- Be OpenAI API compatible
- Accept POST requests to `/v1/audio/speech`
- Accept JSON payload in the format:
\\```json
{
  "model": "tts-1",
  "voice": "af_bella",
  "input": "text to speak",
  "speed": 1.0
}
\\```
- Return audio data (mp3/wav)

Default server URL: `http://localhost:8000/v1/audio/speech`

## Development

The extension consists of three main files:
- `manifest.json`: Extension configuration
- `popup.html`: UI layout and styles
- `popup.js`: Core functionality and event handlers

To modify the extension:
1. Make your changes
2. Reload the extension in `chrome://extensions/`
3. Click the refresh icon on the extension card

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

Distributed under the MIT
