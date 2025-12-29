# SillyTavern Image Generator Extension

Automatically generates images from AI character messages using OpenAI-compatible APIs. This extension transforms character messages into image prompts using a text LLM, then generates images using an image generation API.

## Features

- **Two Modes**: 
  - **Manual**: Generate images on demand via slash command or message button
  - **Auto**: Automatically generate images after each AI response
- **OpenAI-Compatible APIs**: Works with any OpenAI-compatible text LLM and image generation API
- **Character Context**: Optionally includes character card information (name, description, personality) in prompt generation
- **Image Preview**: Preview generated images before accepting or deleting
- **Hidden Messages**: Accepted images are saved as hidden system messages (can be unhidden)
- **Regeneration**: Regenerate images with the same prompt if not satisfied

## Installation

1. Copy the `ST-ImageGen` folder to your SillyTavern extensions directory:
   - `SillyTavern/data/<user-handle>/extensions/` (for single user)
   - Or `SillyTavern/public/scripts/extensions/third-party/` (for all users)
2. Restart SillyTavern or reload the page
3. Enable the extension in Extensions panel

## Configuration

### Text LLM Settings (for prompt transformation)
- **API URL**: Full endpoint URL (e.g., `https://api.example.com/v1/chat/completions`)
- **API Key**: Bearer token for authentication (optional)
- **Model**: Model name (e.g., `gpt-4`, `claude-3-sonnet`)
- **System Prompt**: Instructions for transforming messages into image prompts
- **Temperature**: Generation temperature (0.0 - 2.0)
- **Max Tokens**: Maximum tokens for response

### Image Generation Settings
- **API URL**: Full endpoint URL (e.g., `https://api.airforce/v1/images/generations`)
- **API Key**: Bearer token for authentication (optional)
- **Model**: Image model name (e.g., `firefrost`, `dall-e-3`)
- **Size**: Image dimensions (e.g., `1024x1024`)
- **Aspect Ratio**: Aspect ratio option (e.g., `square_1_1`)
- **Resolution**: Resolution setting (e.g., `4k`)
- **Count (n)**: Number of images to generate
- **Response Format**: `url` or `b64_json`
- **SSE**: Enable/disable server-sent events

## Usage

### Manual Mode
1. Click the image icon (📷) in the message action menu (three dots on any AI message)
2. Or use the slash command: `/genimage` or `/genimage mesid=5`

### Auto Mode
1. Enable "Auto" mode in settings
2. Images will be generated automatically after each AI response

### Slash Commands
- `/genimage` - Generate image for the last character message
- `/genimage mesid=5` - Generate image for message #5
- Aliases: `/generateimage`, `/imggen`

## Workflow

1. **Message Selection**: Gets the character's message (last or specified)
2. **Character Context**: Optionally retrieves character card data
3. **Prompt Generation**: Sends message + character info to text LLM to create an image prompt
4. **Image Generation**: Sends the prompt to image generation API
5. **Preview**: Shows popup with generated image and prompt
6. **Save**: If accepted, creates a hidden system message with the image

## API Compatibility

### Text LLM API
The extension expects an OpenAI-compatible chat completions endpoint:

```json
POST /v1/chat/completions
{
  "model": "model-name",
  "messages": [
    {"role": "system", "content": "..."},
    {"role": "user", "content": "..."}
  ],
  "temperature": 0.7,
  "max_tokens": 300
}
```

### Image Generation API
The extension expects an OpenAI-compatible image generations endpoint:

```json
POST /v1/images/generations
{
  "model": "model-name",
  "prompt": "...",
  "n": 1,
  "size": "1024x1024",
  "response_format": "url"
}
```

Optional parameters (if your API supports them):
- `aspectRatio`
- `resolution`
- `sse`

## Tips

1. **System Prompt**: Customize the system prompt to get better image prompts for your use case
2. **Character Cards**: Enable "Include character card" for more accurate visual representations
3. **Hidden Messages**: Generated images are hidden by default. Use `/unhide` command to show them
4. **Temperature**: Lower temperature (0.3-0.5) for more consistent prompts, higher (0.7-1.0) for more creative ones

## Troubleshooting

- **No image generated**: Check that both API URLs are configured correctly
- **API errors**: Verify your API keys and endpoint URLs
- **Images not showing**: Ensure the image API returns valid URLs or base64 data
- **Slow generation**: Image generation can take 10-60 seconds depending on the API

## License

MIT License - Feel free to modify and distribute.

## Credits

Created for SillyTavern - the ultimate LLM frontend for power users.