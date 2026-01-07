/**
 * ST-ImageGen API Functions
 * Handles Text LLM and Image Generation API calls
 */

import { MODEL_CONFIGS } from './constants.js';
import { getSettings, getCurrentModelParams, getAbortController, setAbortController } from './settings.js';
import { getUploadedPresetPrompts, applyPostProcessing } from './presets.js';
import { buildLorebookPromptContent } from './lorebook.js';
import { getUserPersonaData, getCharacterAvatar, cleanMessageContent } from './character.js';

/**
 * Transform a roleplay message into an image generation prompt using the Text LLM
 * @param {string} message - The roleplay message to transform
 * @param {Object} characterData - Character data for context
 * @returns {Promise<string>} The generated image prompt
 */
export async function transformMessageToImagePrompt(message, characterData) {
    const settings = getSettings();
    if (!settings.textLlm.apiUrl) throw new Error('Text LLM API URL is not configured');

    // Clean the message content before processing
    const cleanedMessage = cleanMessageContent(message);

    let systemPrompt = settings.textLlm.systemPrompt;

    // Add character information to the system prompt if enabled
    if (settings.includeCharacterCard && characterData) {
        systemPrompt += '\n\n--- Character Information (use this to describe the character accurately) ---';
        if (characterData.name) systemPrompt += `\nCharacter Name: ${characterData.name}`;
        if (characterData.description) systemPrompt += `\nCharacter Description: ${characterData.description}`;
        if (characterData.personality) systemPrompt += `\nCharacter Personality: ${characterData.personality}`;
        if (characterData.scenario) systemPrompt += `\nScenario: ${characterData.scenario}`;
        systemPrompt += '\n--- End Character Information ---';
    }

    // Add user persona information to the system prompt if enabled
    if (settings.includeUserPersona) {
        const personaData = getUserPersonaData();
        if (personaData) {
            systemPrompt += '\n\n--- User/Player Information (use this to describe the user accurately) ---';
            if (personaData.name) systemPrompt += `\nUser Name: ${personaData.name}`;
            if (personaData.description) systemPrompt += `\nUser Description: ${personaData.description}`;
            systemPrompt += '\n--- End User Information ---';
        }
    }

    // Add lorebook content to the system prompt if enabled
    if (settings.lorebook.enabled && settings.lorebook.includeInPrompt) {
        const lorebookContent = await buildLorebookPromptContent();
        if (lorebookContent) {
            systemPrompt += '\n\n--- Lorebook/World Information (use this for additional context and visual details) ---';
            systemPrompt += '\n' + lorebookContent;
            systemPrompt += '\n--- End Lorebook Information ---';
        }
    }

    // Build messages array
    const messages = [];

    // Inject preset prompts BEFORE system prompt if enabled
    if (settings.textLlm.usePreset && settings.textLlm.uploadedPreset) {
        const presetPrompts = getUploadedPresetPrompts();
        if (presetPrompts.length > 0) {
            messages.push(...presetPrompts);
        }
    }

    // Add our system prompt
    messages.push({ role: 'system', content: systemPrompt });

    // Build user message content (may include character image reference)
    let userMessageContent;
    const charAvatarData = settings.includeCharacterImage ? await getCharacterAvatar() : null;

    if (charAvatarData) {
        // Multimodal message with image reference
        userMessageContent = [
            { type: 'text', text: `[Reference image for ${charAvatarData.name}]` },
            {
                type: 'image_url',
                image_url: { url: `data:${charAvatarData.mimeType};base64,${charAvatarData.data}` }
            },
            { type: 'text', text: `Transform this roleplay message into an image generation prompt:\n\n${cleanedMessage}` }
        ];
    } else {
        // Plain text message
        userMessageContent = `Transform this roleplay message into an image generation prompt:\n\n${cleanedMessage}`;
    }

    // Add user message
    messages.push({ role: 'user', content: userMessageContent });

    // Add prefill assistant message if enabled
    if (settings.textLlm.usePrefill && settings.textLlm.prefillContent) {
        messages.push({ role: 'assistant', content: settings.textLlm.prefillContent });
    }

    // Apply post-processing to messages
    const postProcessingMode = settings.textLlm.postProcessing || 'none';
    const processedMessages = applyPostProcessing(messages, postProcessingMode);

    const requestBody = {
        model: settings.textLlm.model,
        messages: processedMessages,
        temperature: parseFloat(settings.textLlm.temperature) || 0.7,
        max_tokens: parseInt(settings.textLlm.maxTokens) || 300,
    };

    // Add reasoning settings if enabled
    if (settings.textLlm.enableReasoning) {
        requestBody.include_reasoning = true;
        requestBody.reasoning_effort = settings.textLlm.reasoningEffort || 'medium';
    }
    const headers = { 'Content-Type': 'application/json' };
    if (settings.textLlm.apiKey) headers['Authorization'] = `Bearer ${settings.textLlm.apiKey}`;

    const controller = new AbortController();
    setAbortController(controller);

    const response = await fetch(settings.textLlm.apiUrl, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(requestBody),
        signal: controller.signal,
    });
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Text LLM API error: ${response.status} - ${errorText}`);
    }
    let data = await response.json();

    // Some API providers wrap the response in a 'data' object
    if (data.data && data.data.choices) {
        data = data.data;
    }

    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        throw new Error('Invalid response from Text LLM API: ' + JSON.stringify(data));
    }

    let content = data.choices[0].message.content;

    // Handle Gemini Pro thinking response format
    // Some proxies may return reasoning_content separately
    if (content === null || content === undefined) {
        // Check if there's reasoning_content (some proxies put the actual response there)
        const reasoningContent = data.choices[0].message.reasoning_content;
        if (reasoningContent && typeof reasoningContent === 'string') {
            content = reasoningContent;
        }

        // Check for responseContent (Gemini native format wrapped)
        if (!content && data.responseContent) {
            // Extract non-thought parts from Gemini response
            if (data.responseContent.parts && Array.isArray(data.responseContent.parts)) {
                const textParts = data.responseContent.parts
                    .filter(part => !part.thought && part.text)
                    .map(part => part.text);
                if (textParts.length > 0) {
                    content = textParts.join('\n\n');
                }
            }
        }

        // Check for text field directly in message
        if (!content && data.choices[0].message.text) {
            content = data.choices[0].message.text;
        }

        // Still null? Check for refusal or throw error
        if (content === null || content === undefined) {
            const refusal = data.choices[0].message.refusal;
            if (refusal) {
                throw new Error(`Text LLM refused to generate prompt: ${refusal}`);
            }
            throw new Error('Text LLM returned empty content. Full response: ' + JSON.stringify(data));
        }
    }

    return content.trim();
}

/**
 * Generate an image from a prompt using the Image Generation API
 * @param {string} prompt - The image generation prompt
 * @returns {Promise<string>} The image URL or data URL
 */
export async function generateImage(prompt) {
    const settings = getSettings();
    if (!settings.imageGen.apiUrl) throw new Error('Image Generation API URL is not configured');
    if (!prompt) throw new Error('No prompt provided for image generation');

    const model = settings.imageGen.model;
    const modelConfig = MODEL_CONFIGS[model];
    const modelParams = getCurrentModelParams();

    // Use custom model name if 'custom' is selected, otherwise use the selected model
    const actualModel = model === 'custom' ? settings.imageGen.customModelName : model;
    if (model === 'custom' && !actualModel) {
        throw new Error('Custom model name is not configured');
    }

    let requestBody;

    // Check if we should use chat completions format
    if (settings.imageGen.useChatCompletions) {
        // Build request in /v1/chat/completions format
        requestBody = {
            model: actualModel,
            messages: [
                {
                    role: 'user',
                    content: prompt
                }
            ],
            max_tokens: 4096,
        };

        // Add model-specific parameters for chat completions
        if (modelConfig && modelConfig.parameters) {
            for (const [paramName, paramConfig] of Object.entries(modelConfig.parameters)) {
                const value = modelParams[paramName];
                if (value !== undefined && value !== null && value !== '') {
                    if (paramName === 'image_urls') {
                        const urls = value.split('\n').map(url => url.trim()).filter(url => url.length > 0);
                        if (urls.length > 0) {
                            requestBody.image_urls = urls;
                        }
                    } else {
                        requestBody[paramName] = value;
                    }
                }
            }
        }
    } else {
        // Standard image generation format
        requestBody = {
            model: actualModel,
            prompt: prompt,
            n: parseInt(settings.imageGen.n) || 1,
            response_format: settings.imageGen.responseFormat,
            sse: settings.imageGen.sse,
        };

        // Add model-specific parameters
        if (modelConfig && modelConfig.parameters) {
            for (const [paramName, paramConfig] of Object.entries(modelConfig.parameters)) {
                const value = modelParams[paramName];
                if (value !== undefined && value !== null && value !== '') {
                    // Handle image_urls specially - convert from newline-separated to array
                    if (paramName === 'image_urls') {
                        const urls = value.split('\n').map(url => url.trim()).filter(url => url.length > 0);
                        if (urls.length > 0) {
                            requestBody.image_urls = urls;
                        }
                    } else {
                        requestBody[paramName] = value;
                    }
                }
            }
        }
    }

    const headers = { 'Content-Type': 'application/json' };
    if (settings.imageGen.apiKey) {
        // nano-gpt uses x-api-key header instead of Bearer token
        if (settings.imageGen.apiUrl.includes('nano-gpt.com')) {
            headers['x-api-key'] = settings.imageGen.apiKey;
        } else {
            headers['Authorization'] = `Bearer ${settings.imageGen.apiKey}`;
        }
    }

    const controller = new AbortController();
    setAbortController(controller);

    const response = await fetch(settings.imageGen.apiUrl, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(requestBody),
        signal: controller.signal,
    });
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Image Generation API error: ${response.status} - ${errorText}`);
    }

    const responseText = await response.text();

    // Check if this is an SSE response (contains "data: " lines)
    let jsonText = responseText;
    if (responseText.includes('data: {') || responseText.includes(': keepalive')) {
        // Extract JSON from SSE format - find lines starting with "data: " that contain JSON
        const lines = responseText.split('\n');
        for (const line of lines) {
            if (line.startsWith('data: ') && line.includes('{')) {
                jsonText = line.substring(6); // Remove "data: " prefix
                break;
            }
        }
    }

    // Try to parse as JSON first
    let data;
    try {
        data = JSON.parse(jsonText);
    } catch (e) {
        // If not JSON, check if it's a direct URL or base64
        if (responseText.startsWith('http://') || responseText.startsWith('https://')) {
            return responseText.trim();
        }
        if (responseText.startsWith('data:image/')) {
            return responseText.trim();
        }
        // Check if it looks like base64
        if (/^[A-Za-z0-9+/=]+$/.test(responseText.trim().substring(0, 100))) {
            return `data:image/png;base64,${responseText.trim()}`;
        }
        throw new Error(`Invalid response format: ${responseText.substring(0, 100)}`);
    }

    // Handle chat completions response format (for useChatCompletions mode)
    if (data.choices && data.choices[0]) {
        const choice = data.choices[0];
        const content = choice.message?.content || choice.delta?.content;
        if (content) {
            // Check if content is a URL
            if (content.startsWith('http://') || content.startsWith('https://')) {
                return content.trim();
            }
            // Check if content is a data URL
            if (content.startsWith('data:image/')) {
                return content.trim();
            }
            // Check if content contains a markdown image
            const markdownMatch = content.match(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/);
            if (markdownMatch) {
                return markdownMatch[1];
            }
            // Check if content contains a URL somewhere
            const urlMatch = content.match(/(https?:\/\/[^\s"'<>]+\.(png|jpg|jpeg|gif|webp)[^\s"'<>]*)/i);
            if (urlMatch) {
                return urlMatch[1];
            }
            // Check if content looks like base64
            if (/^[A-Za-z0-9+/=]{100,}$/.test(content.trim())) {
                return `data:image/png;base64,${content.trim()}`;
            }
        }
    }

    // Handle OpenAI-style response: { data: [{ url: "..." }] } or { data: [{ b64_json: "..." }] }
    if (data.data && data.data[0]) {
        const imageData = data.data[0];
        if (imageData.url) return imageData.url;
        if (imageData.b64_json) return `data:image/png;base64,${imageData.b64_json}`;
    }

    // Handle direct URL in response
    if (data.url) return data.url;
    if (data.image_url) return data.image_url;
    if (data.output) return data.output;

    // Handle base64 in various formats
    if (data.b64_json) return `data:image/png;base64,${data.b64_json}`;
    if (data.image) return data.image.startsWith('data:') ? data.image : `data:image/png;base64,${data.image}`;
    if (data.base64) return `data:image/png;base64,${data.base64}`;

    throw new Error('Could not find image URL or data in response');
}
