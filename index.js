
/**
 * SillyTavern Image Generator Extension
 * Automatically generates images from AI character messages using OpenAI-compatible APIs
 */

import { eventSource, event_types, saveSettingsDebounced, characters, this_chid, chat, saveChatDebounced, reloadCurrentChat } from '../../../../script.js';
import { extension_settings, getContext } from '../../../extensions.js';
// promptManager import removed - using uploaded preset files instead
import { SlashCommandParser } from '../../../slash-commands/SlashCommandParser.js';
import { SlashCommand } from '../../../slash-commands/SlashCommand.js';
import { ARGUMENT_TYPE, SlashCommandNamedArgument } from '../../../slash-commands/SlashCommandArgument.js';
import { saveBase64AsFile } from '../../../utils.js';

const MODULE_NAME = 'st-imagegen';

// Model configurations with their specific parameters
const MODEL_CONFIGS = Object.freeze({
    'z-image': {
        name: 'Z-Image',
        parameters: {
            size: { type: 'text', default: '1024x1024', placeholder: 'e.g., 1024x1024', label: 'Size' },
            aspectRatio: { type: 'text', default: '16:9', placeholder: 'e.g., 16:9, 1:1, 4:3', label: 'Aspect Ratio' }
        }
    },
    'nano-banana-pro': {
        name: 'Nano Banana Pro',
        parameters: {
            size: { type: 'text', default: '1024x1024', placeholder: 'e.g., 1024x1024', label: 'Size' },
            aspectRatio: { type: 'text', default: '1:1', placeholder: 'e.g., 16:9, 1:1, 4:3', label: 'Aspect Ratio' },
            resolution: { type: 'text', default: '1k', placeholder: 'e.g., 1k, 2k, 4k', label: 'Resolution' },
            image_urls: { type: 'textarea', maxItems: 8, placeholder: 'Enter image URLs, one per line (max 8)', label: 'Image URLs (optional)', optional: true }
        }
    },
    'seedream-4.5': {
        name: 'Seedream 4.5',
        parameters: {
            size: { type: 'text', default: '1024x1024', placeholder: 'e.g., 1024x1024', label: 'Size' },
            aspectRatio: { type: 'text', default: '1:1', placeholder: 'e.g., 16:9, 1:1, 4:3', label: 'Aspect Ratio' },
            quality: { type: 'select', options: ['basic', 'high'], default: 'basic', label: 'Quality' },
            image_urls: { type: 'textarea', maxItems: 14, placeholder: 'Enter image URLs, one per line (max 14)', label: 'Image URLs (optional)', optional: true }
        }
    }
});

const defaultSettings = Object.freeze({
    enabled: true,
    mode: 'manual',
    includeCharacterCard: true,
    useSillyTavernApi: true, // Use SillyTavern's built-in API instead of custom endpoint
    textLlm: {
        apiUrl: '',
        apiKey: '',
        model: 'gpt-4',
        systemPrompt: `You are an image prompt generator. Transform the given roleplay message into a detailed image generation prompt.
Focus on visual elements: character appearance, setting, actions, mood, lighting.
Output ONLY the image prompt, no explanations or additional text.
Keep the prompt concise but descriptive, suitable for image generation AI.`,
        temperature: 0.7,
        maxTokens: 300,
        usePreset: false,           // Enable/disable preset injection
        uploadedPreset: null,       // Uploaded preset data: { name: string, prompts: array }
        postProcessing: 'none',     // Prompt post-processing mode: 'none', 'semi-strict', 'strict'
        usePrefill: false,          // Enable/disable prefill assistant message
        prefillContent: '',         // Content for the prefill assistant message
    },
    imageGen: {
        apiUrl: '',
        apiKey: '',
        model: 'seedream-4.5',
        // Model-specific parameters stored here
        modelParams: {
            'z-image': { size: '1024x1024', aspectRatio: '16:9' },
            'nano-banana-pro': { size: '1024x1024', aspectRatio: '1:1', resolution: '1k', image_urls: '' },
            'seedream-4.5': { size: '1024x1024', aspectRatio: '1:1', quality: 'basic', image_urls: '' }
        },
        n: 1,
        responseFormat: 'b64_json',
        sse: true,
    },
});

let isGenerating = false;
let currentGenerationPrompt = '';
let abortController = null;

function getSettings() {
    if (!extension_settings[MODULE_NAME]) {
        extension_settings[MODULE_NAME] = structuredClone(defaultSettings);
    }
    const settings = extension_settings[MODULE_NAME];
    for (const key of Object.keys(defaultSettings)) {
        if (!Object.hasOwn(settings, key)) {
            settings[key] = structuredClone(defaultSettings[key]);
        }
    }
    if (settings.textLlm) {
        for (const key of Object.keys(defaultSettings.textLlm)) {
            if (!Object.hasOwn(settings.textLlm, key)) {
                settings.textLlm[key] = defaultSettings.textLlm[key];
            }
        }
    }
    if (settings.imageGen) {
        for (const key of Object.keys(defaultSettings.imageGen)) {
            if (!Object.hasOwn(settings.imageGen, key)) {
                settings.imageGen[key] = defaultSettings.imageGen[key];
            }
        }
        // Ensure modelParams exists and has all models
        if (!settings.imageGen.modelParams) {
            settings.imageGen.modelParams = structuredClone(defaultSettings.imageGen.modelParams);
        }
        for (const modelId of Object.keys(MODEL_CONFIGS)) {
            if (!settings.imageGen.modelParams[modelId]) {
                settings.imageGen.modelParams[modelId] = {};
                const config = MODEL_CONFIGS[modelId];
                for (const [paramName, paramConfig] of Object.entries(config.parameters)) {
                    settings.imageGen.modelParams[modelId][paramName] = paramConfig.default || '';
                }
            }
        }
    }
    return settings;
}

// Get current model's parameters from settings
function getCurrentModelParams() {
    const settings = getSettings();
    const model = settings.imageGen.model;
    return settings.imageGen.modelParams[model] || {};
}

// Set a parameter value for the current model
function setCurrentModelParam(paramName, value) {
    const settings = getSettings();
    const model = settings.imageGen.model;
    if (!settings.imageGen.modelParams[model]) {
        settings.imageGen.modelParams[model] = {};
    }
    settings.imageGen.modelParams[model][paramName] = value;
    saveSettings();
}

function saveSettings() {
    saveSettingsDebounced();
}

// ============================================
// Preset Upload Utility Functions
// ============================================

/**
 * Check if a prompt content is meaningful (not just macros/comments/empty)
 * @param {string} content - The prompt content to check
 * @returns {boolean} True if the content has meaningful text
 */
function hasActualContent(content) {
    if (!content || typeof content !== 'string') return false;
    
    // Remove common SillyTavern macros and comments
    let cleaned = content
        // Remove {{// comment }} style comments
        .replace(/\{\{\/\/[^}]*\}\}/g, '')
        // Remove {{trim}} and similar utility macros
        .replace(/\{\{trim\}\}/gi, '')
        // Remove {{noop}} macros
        .replace(/\{\{noop\}\}/gi, '')
        // Trim whitespace
        .trim();
    
    // If after removing comments and utility macros there's still content, it's meaningful
    // But we should also check if the remaining content is just other macros
    // A prompt with actual instructions will have text outside of {{ }}
    const hasTextOutsideMacros = cleaned.replace(/\{\{[^}]*\}\}/g, '').trim().length > 0;
    
    // Or has macros that produce actual content (like {{char}}, {{user}}, etc.)
    const hasContentMacros = /\{\{(char|user|persona|scenario|personality|description|system|original|input|message)\}\}/i.test(cleaned);
    
    return cleaned.length > 0 && (hasTextOutsideMacros || hasContentMacros);
}

/**
 * Parse an uploaded preset file and extract enabled prompts
 * @param {File} file - The uploaded JSON file
 * @returns {Promise<{name: string, prompts: Array<{identifier: string, role: string, content: string}>}>}
 */
async function parsePresetFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = (event) => {
            try {
                const preset = JSON.parse(event.target.result);
                
                // Validate preset structure
                if (!preset.prompts || !Array.isArray(preset.prompts)) {
                    reject(new Error('Invalid preset format: missing prompts array'));
                    return;
                }
                
                if (!preset.prompt_order || !Array.isArray(preset.prompt_order)) {
                    reject(new Error('Invalid preset format: missing prompt_order array'));
                    return;
                }
                
                // Build a map of prompts by identifier for quick lookup
                const promptMap = new Map();
                for (const prompt of preset.prompts) {
                    if (prompt.identifier) {
                        promptMap.set(prompt.identifier, prompt);
                    }
                }
                
                // Find the custom prompt order (character_id: 100001)
                const customOrder = preset.prompt_order.find(po => po.character_id === 100001);
                if (!customOrder || !customOrder.order) {
                    reject(new Error('Invalid preset format: missing custom prompt order (character_id: 100001)'));
                    return;
                }
                
                // Extract enabled prompts in order
                const enabledPrompts = [];
                for (const entry of customOrder.order) {
                    if (entry.enabled && entry.identifier) {
                        const prompt = promptMap.get(entry.identifier);
                        if (prompt) {
                            // Skip markers - they don't have actual content
                            if (prompt.marker) {
                                console.log('[ST-ImageGen] Skipping marker prompt:', prompt.identifier);
                                continue;
                            }
                            
                            // Skip if no content or role
                            if (!prompt.content || !prompt.role) {
                                console.log('[ST-ImageGen] Skipping prompt without content/role:', prompt.identifier);
                                continue;
                            }
                            
                            // Skip if content is just macros/comments with no actual text
                            if (!hasActualContent(prompt.content)) {
                                console.log('[ST-ImageGen] Skipping prompt with no actual content:', prompt.identifier);
                                continue;
                            }
                            
                            console.log('[ST-ImageGen] Including prompt:', prompt.identifier, 'role:', prompt.role);
                            enabledPrompts.push({
                                identifier: prompt.identifier,
                                role: prompt.role,
                                content: prompt.content
                            });
                        }
                    }
                }
                
                // Extract preset name from filename (remove .json extension)
                const presetName = file.name.replace(/\.json$/i, '');
                
                console.log('[ST-ImageGen] Parsed preset:', presetName, 'with', enabledPrompts.length, 'enabled prompts');
                
                resolve({
                    name: presetName,
                    prompts: enabledPrompts
                });
            } catch (error) {
                reject(new Error('Failed to parse preset file: ' + error.message));
            }
        };
        
        reader.onerror = () => {
            reject(new Error('Failed to read preset file'));
        };
        
        reader.readAsText(file);
    });
}

/**
 * Handle preset file upload
 * @param {Event} event - The file input change event
 */
async function handlePresetUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    
    try {
        const presetData = await parsePresetFile(file);
        const settings = getSettings();
        
        // Store the extracted prompts (not the full JSON)
        settings.textLlm.uploadedPreset = presetData;
        saveSettings();
        
        // Update UI
        updatePresetUI(presetData);
        
        toastr.success(`Loaded preset "${presetData.name}" with ${presetData.prompts.length} prompts`, 'Image Generator');
    } catch (error) {
        console.error('[ST-ImageGen] Failed to load preset:', error);
        toastr.error(error.message, 'Image Generator');
    }
    
    // Reset the file input so the same file can be selected again
    event.target.value = '';
}

/**
 * Clear the uploaded preset
 */
function clearUploadedPreset() {
    const settings = getSettings();
    settings.textLlm.uploadedPreset = null;
    saveSettings();
    
    updatePresetUI(null);
    toastr.info('Preset cleared', 'Image Generator');
}

/**
 * Update the preset section UI based on loaded preset
 * @param {Object|null} presetData - The loaded preset data or null
 */
function updatePresetUI(presetData) {
    const infoContainer = $('#st_imagegen_preset_info');
    const uploadBtn = $('#st_imagegen_preset_upload_btn');
    const clearBtn = $('#st_imagegen_preset_clear_btn');
    
    if (presetData) {
        infoContainer.html(`
            <div class="st-imagegen-preset-loaded">
                <i class="fa-solid fa-check-circle"></i>
                <span class="st-imagegen-preset-name">${presetData.name}</span>
                <span class="st-imagegen-preset-count">(${presetData.prompts.length} prompts)</span>
            </div>
        `);
        uploadBtn.text('Change Preset');
        clearBtn.show();
    } else {
        infoContainer.html('<span class="st-imagegen-preset-none">No preset loaded</span>');
        uploadBtn.text('Upload Preset');
        clearBtn.hide();
    }
}

/**
 * Get prompts from the uploaded preset
 * @returns {Array<{role: string, content: string}>} Array of prompt messages
 */
function getUploadedPresetPrompts() {
    const settings = getSettings();
    const uploadedPreset = settings.textLlm.uploadedPreset;
    
    if (!uploadedPreset || !uploadedPreset.prompts) {
        return [];
    }
    
    // Return prompts in the format expected by the message builder
    return uploadedPreset.prompts.map(p => ({
        role: p.role,
        content: p.content
    }));
}

/**
 * Apply post-processing to messages array based on the selected mode
 * @param {Array<{role: string, content: string}>} messages - The messages array to process
 * @param {string} mode - The post-processing mode: 'none', 'semi-strict', 'strict'
 * @returns {Array<{role: string, content: string}>} The processed messages array
 */
function applyPostProcessing(messages, mode) {
    if (!messages || messages.length === 0 || mode === 'none') {
        return messages;
    }
    
    console.log('[ST-ImageGen] Applying post-processing mode:', mode);
    console.log('[ST-ImageGen] Messages before post-processing:', messages.map(m => ({ role: m.role, contentLength: m.content?.length })));
    
    if (mode === 'semi-strict') {
        // Semi-Strict: Convert ALL system messages to user messages
        const processed = messages.map(msg => {
            if (msg.role === 'system') {
                return { role: 'user', content: msg.content };
            }
            return msg;
        });
        console.log('[ST-ImageGen] Messages after semi-strict processing:', processed.map(m => ({ role: m.role, contentLength: m.content?.length })));
        return processed;
    }
    
    if (mode === 'strict') {
        // Strict: Only allow system messages at the very start, convert rest to user/assistant
        // First system message stays as system, subsequent ones become user
        let foundFirstSystem = false;
        const processed = messages.map(msg => {
            if (msg.role === 'system') {
                if (!foundFirstSystem) {
                    foundFirstSystem = true;
                    return msg; // Keep first system message
                }
                // Convert subsequent system messages to user
                return { role: 'user', content: msg.content };
            }
            return msg;
        });
        console.log('[ST-ImageGen] Messages after strict processing:', processed.map(m => ({ role: m.role, contentLength: m.content?.length })));
        return processed;
    }
    
    return messages;
}

function getCharacterData() {
    if (this_chid === undefined || this_chid === null) return null;
    const character = characters[this_chid];
    if (!character) return null;
    return {
        name: character.name || '',
        description: character.description || '',
        personality: character.personality || '',
        scenario: character.scenario || '',
        avatar: character.avatar || '',
    };
}

function getCharacterMessage(messageIndex) {
    if (!chat || chat.length === 0) return null;
    if (messageIndex !== undefined && messageIndex !== null) {
        const message = chat[messageIndex];
        if (message && !message.is_user) {
            return { message: message.mes, index: messageIndex };
        }
        return null;
    }
    for (let i = chat.length - 1; i >= 0; i--) {
        const message = chat[i];
        if (!message.is_user && !message.is_system) {
            return { message: message.mes, index: i };
        }
    }
    return null;
}

async function transformMessageToImagePrompt(message, characterData) {
    const settings = getSettings();
    if (!settings.textLlm.apiUrl) throw new Error('Text LLM API URL is not configured');
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
    
    console.log('[ST-ImageGen] System prompt with character data:', systemPrompt);
    console.log('[ST-ImageGen] Character data included:', settings.includeCharacterCard, characterData);
    
    // Build messages array
    const messages = [];
    
    // Inject preset prompts BEFORE system prompt if enabled
    if (settings.textLlm.usePreset && settings.textLlm.uploadedPreset) {
        const presetPrompts = getUploadedPresetPrompts();
        if (presetPrompts.length > 0) {
            console.log('[ST-ImageGen] Injecting', presetPrompts.length, 'preset prompts from uploaded preset');
            messages.push(...presetPrompts);
        }
    }
    
    // Add our system prompt
    messages.push({ role: 'system', content: systemPrompt });
    
    // Add user message
    messages.push({ role: 'user', content: `Transform this roleplay message into an image generation prompt:\n\n${message}` });
    
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
        // Add include_reasoning for Gemini Pro models with thinking enabled
        include_reasoning: true,
    };
    const headers = { 'Content-Type': 'application/json' };
    if (settings.textLlm.apiKey) headers['Authorization'] = `Bearer ${settings.textLlm.apiKey}`;
    
    abortController = new AbortController();
    const response = await fetch(settings.textLlm.apiUrl, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(requestBody),
        signal: abortController.signal,
    });
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Text LLM API error: ${response.status} - ${errorText}`);
    }
    const data = await response.json();
    console.log('[ST-ImageGen] Text LLM response:', JSON.stringify(data, null, 2));
    
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        throw new Error('Invalid response from Text LLM API: ' + JSON.stringify(data));
    }
    
    let content = data.choices[0].message.content;
    
    // Handle Gemini Pro thinking response format
    // Some proxies may return reasoning_content separately
    if (content === null || content === undefined) {
        console.log('[ST-ImageGen] Content is null, checking for alternative response formats...');
        
        // Check if there's reasoning_content (some proxies put the actual response there)
        const reasoningContent = data.choices[0].message.reasoning_content;
        if (reasoningContent && typeof reasoningContent === 'string') {
            console.log('[ST-ImageGen] Found reasoning_content, using it as content');
            content = reasoningContent;
        }
        
        // Check for responseContent (Gemini native format wrapped)
        if (!content && data.responseContent) {
            console.log('[ST-ImageGen] Found responseContent (Gemini format)');
            // Extract non-thought parts from Gemini response
            if (data.responseContent.parts && Array.isArray(data.responseContent.parts)) {
                const textParts = data.responseContent.parts
                    .filter(part => !part.thought && part.text)
                    .map(part => part.text);
                if (textParts.length > 0) {
                    content = textParts.join('\n\n');
                    console.log('[ST-ImageGen] Extracted content from responseContent parts');
                }
            }
        }
        
        // Check for text field directly in message
        if (!content && data.choices[0].message.text) {
            content = data.choices[0].message.text;
            console.log('[ST-ImageGen] Found content in message.text field');
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

async function generateImage(prompt) {
    const settings = getSettings();
    if (!settings.imageGen.apiUrl) throw new Error('Image Generation API URL is not configured');
    if (!prompt) throw new Error('No prompt provided for image generation');
    
    const model = settings.imageGen.model;
    const modelConfig = MODEL_CONFIGS[model];
    const modelParams = getCurrentModelParams();
    
    const requestBody = {
        model: model,
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
    
    const headers = { 'Content-Type': 'application/json' };
    if (settings.imageGen.apiKey) headers['Authorization'] = `Bearer ${settings.imageGen.apiKey}`;
    
    console.log('[ST-ImageGen] Image generation request:', {
        url: settings.imageGen.apiUrl,
        body: requestBody,
    });
    
    abortController = new AbortController();
    const response = await fetch(settings.imageGen.apiUrl, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(requestBody),
        signal: abortController.signal,
    });
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Image Generation API error: ${response.status} - ${errorText}`);
    }
    
    const responseText = await response.text();
    console.log('[ST-ImageGen] Raw API response (first 500 chars):', responseText.substring(0, 500));
    
    // Check if this is an SSE response (contains "data: " lines)
    let jsonText = responseText;
    if (responseText.includes('data: {') || responseText.includes(': keepalive')) {
        console.log('[ST-ImageGen] Detected SSE response format');
        // Extract JSON from SSE format - find lines starting with "data: " that contain JSON
        const lines = responseText.split('\n');
        for (const line of lines) {
            if (line.startsWith('data: ') && line.includes('{')) {
                jsonText = line.substring(6); // Remove "data: " prefix
                console.log('[ST-ImageGen] Extracted JSON from SSE:', jsonText.substring(0, 200));
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
            console.log('[ST-ImageGen] Response is a direct URL');
            return responseText.trim();
        }
        if (responseText.startsWith('data:image/')) {
            console.log('[ST-ImageGen] Response is a data URL');
            return responseText.trim();
        }
        // Check if it looks like base64
        if (/^[A-Za-z0-9+/=]+$/.test(responseText.trim().substring(0, 100))) {
            console.log('[ST-ImageGen] Response appears to be base64');
            return `data:image/png;base64,${responseText.trim()}`;
        }
        throw new Error(`Invalid response format: ${responseText.substring(0, 100)}`);
    }
    
    console.log('[ST-ImageGen] Parsed JSON response:', data);
    
    // DEBUG: Log how many images were returned vs requested
    if (data.data && Array.isArray(data.data)) {
        console.log('[ST-ImageGen] DEBUG: API returned', data.data.length, 'images. Requested n =', settings.imageGen.n);
        if (data.data.length > 1) {
            console.warn('[ST-ImageGen] WARNING: Multiple images returned but only first one will be used!');
            console.log('[ST-ImageGen] All returned images:', data.data.map((img, i) => ({
                index: i,
                hasUrl: !!img.url,
                hasB64: !!img.b64_json,
                url: img.url ? img.url.substring(0, 50) + '...' : null
            })));
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

function showLoading(text = 'Generating...') {
    const loading = document.getElementById('st_imagegen_loading');
    const loadingText = loading?.querySelector('.st-imagegen-loading-text');
    if (loading) {
        if (loadingText) loadingText.textContent = text;
        loading.style.display = 'flex';
    }
}

function hideLoading() {
    const loading = document.getElementById('st_imagegen_loading');
    if (loading) loading.style.display = 'none';
}

function cancelGeneration() {
    if (abortController) {
        abortController.abort();
        abortController = null;
    }
    hideLoading();
    isGenerating = false;
    toastr.info('Image generation cancelled', 'Image Generator');
}

function showImagePopup(imageUrl, prompt, messageIndex) {
    return new Promise((resolve) => {
        const popup = document.getElementById('st_imagegen_popup');
        const preview = document.getElementById('st_imagegen_preview');
        const promptPreview = document.getElementById('st_imagegen_prompt_text');
        if (!popup || !preview) {
            resolve({ accepted: false, reason: 'Popup elements not found' });
            return;
        }
        preview.src = imageUrl;
        if (promptPreview) promptPreview.textContent = prompt;
        popup.style.display = 'flex';
        currentGenerationPrompt = prompt;
        const acceptBtn = document.getElementById('st_imagegen_accept');
        const deleteBtn = document.getElementById('st_imagegen_delete');
        const regenerateBtn = document.getElementById('st_imagegen_regenerate');
        const cleanup = () => {
            popup.style.display = 'none';
            if (acceptBtn) acceptBtn.onclick = null;
            if (deleteBtn) deleteBtn.onclick = null;
            if (regenerateBtn) regenerateBtn.onclick = null;
        };
        if (acceptBtn) {
            acceptBtn.onclick = () => {
                cleanup();
                resolve({ accepted: true, imageUrl, messageIndex, prompt });
            };
        }
        if (deleteBtn) {
            deleteBtn.onclick = () => {
                cleanup();
                resolve({ accepted: false, reason: 'User deleted' });
            };
        }
        if (regenerateBtn) {
            regenerateBtn.onclick = async () => {
                console.log('[ST-ImageGen] Regenerate clicked. isGenerating:', isGenerating);
                cleanup();
                // Reset isGenerating flag before regenerating since we're intentionally starting a new generation
                console.log('[ST-ImageGen] Resetting isGenerating flag for regeneration');
                isGenerating = false;
                await generateImageForMessage(messageIndex, prompt);
                resolve({ accepted: false, reason: 'Regenerating' });
            };
        }
        popup.onclick = (e) => {
            if (e.target === popup) {
                cleanup();
                resolve({ accepted: false, reason: 'Closed' });
            }
        };
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                cleanup();
                document.removeEventListener('keydown', escHandler);
                resolve({ accepted: false, reason: 'Closed' });
            }
        };
        document.addEventListener('keydown', escHandler);
    });
}

async function createImageMessage(imageUrl, afterMessageIndex, prompt) {
    console.log('[ST-ImageGen] Creating image message after index:', afterMessageIndex);
    console.log('[ST-ImageGen] Image URL length:', imageUrl?.length);
    
    // Get the SillyTavern context
    const context = SillyTavern.getContext();
    
    // Check if this is a base64 data URL
    const isBase64 = imageUrl.startsWith('data:');
    let finalImageUrl = imageUrl;
    
    // If it's a base64 image, save it to the server using SillyTavern's utility
    if (isBase64) {
        try {
            console.log('[ST-ImageGen] Saving base64 image to server...');
            
            // Extract the base64 data and format from the data URL
            // Format: data:image/png;base64,iVBORw0KGgo...
            // NOTE: Using string operations instead of regex to avoid stack overflow with large base64 strings
            const dataPrefix = 'data:image/';
            const base64Marker = ';base64,';
            
            if (!imageUrl.startsWith(dataPrefix)) {
                throw new Error('Invalid base64 image format: missing data:image/ prefix');
            }
            
            const base64MarkerIndex = imageUrl.indexOf(base64Marker);
            if (base64MarkerIndex === -1) {
                throw new Error('Invalid base64 image format: missing ;base64, marker');
            }
            
            const format = imageUrl.substring(dataPrefix.length, base64MarkerIndex); // e.g., 'png', 'jpeg', 'webp'
            const base64Data = imageUrl.substring(base64MarkerIndex + base64Marker.length); // The actual base64 string without the prefix
            
            // Get character name for the subfolder
            const characterData = getCharacterData();
            const characterName = characterData?.name || 'Unknown';
            
            // Generate a unique filename using timestamp
            const timestamp = Date.now();
            const filename = `st_imagegen_${timestamp}`;
            
            // Save the image to the server
            // saveBase64AsFile(base64Data, subFolder, fileName, extension)
            const savedPath = await saveBase64AsFile(base64Data, characterName, filename, format);
            
            console.log('[ST-ImageGen] Image saved to server:', savedPath);
            finalImageUrl = savedPath;
        } catch (error) {
            console.error('[ST-ImageGen] Failed to save base64 image to server:', error);
            toastr.warning('Failed to save image to server. Image will not persist across reloads.', 'Image Generator');
            // Fall back to not saving the URL (old behavior)
            finalImageUrl = null;
        }
    }
    
    // Store the image URL in extra data
    const imageMessage = {
        name: 'System',
        is_user: false,
        is_system: true,
        send_date: new Date().toISOString(),
        mes: '[Generated Image]',
        extra: {
            isSmallSys: true,
            st_imagegen: {
                prompt: prompt,
                imageUrl: finalImageUrl,
                generatedAt: Date.now()
            },
        },
    };
    
    console.log('[ST-ImageGen] Message object created, final URL:', finalImageUrl ? finalImageUrl.substring(0, 100) + '...' : null);
    
    // Insert message at the correct position (after the target message)
    context.chat.splice(afterMessageIndex + 1, 0, imageMessage);
    
    // Save the chat
    await context.saveChat();
    
    // Manually add the image to the DOM instead of reloading
    // Find the target message element and insert after it
    const targetMessageElement = document.querySelector(`#chat .mes[mesid="${afterMessageIndex}"]`);
    if (targetMessageElement) {
        // Use the original imageUrl for display (it's still in memory), but the saved path for persistence
        const displayUrl = imageUrl; // Use original URL for immediate display
        
        // Create a simple image display element (no prompt shown to preserve immersion)
        const imageDiv = document.createElement('div');
        imageDiv.className = 'mes st-imagegen-image-message';
        imageDiv.setAttribute('is_system', 'true');
        imageDiv.innerHTML = `
            <div class="mes_block">
                <div class="mes_text">
                    <img src="${displayUrl}" alt="Generated Image" style="max-width: 100%; border-radius: 8px;" />
                </div>
            </div>
        `;
        targetMessageElement.insertAdjacentElement('afterend', imageDiv);
    }
    
    console.log('[ST-ImageGen] Message added and saved');
    toastr.success('Image added to chat!', 'Image Generator');
}

async function generateImageForMessage(messageIndex, existingPrompt = null) {
    if (isGenerating) {
        toastr.warning('Already generating an image, please wait...', 'Image Generator');
        return;
    }
    const settings = getSettings();
    if (!settings.enabled) {
        toastr.info('Image Generator is disabled', 'Image Generator');
        return;
    }
    if (!settings.textLlm.apiUrl && !existingPrompt) {
        toastr.error('Text LLM API URL is not configured', 'Image Generator');
        return;
    }
    if (!settings.imageGen.apiUrl) {
        toastr.error('Image Generation API URL is not configured', 'Image Generator');
        return;
    }
    isGenerating = true;
    try {
        const messageData = getCharacterMessage(messageIndex);
        if (!messageData) {
            toastr.warning('No character message found', 'Image Generator');
            return;
        }
        let imagePrompt = existingPrompt;
        if (!imagePrompt) {
            showLoading('Generating image prompt...');
            const characterData = getCharacterData();
            imagePrompt = await transformMessageToImagePrompt(messageData.message, characterData);
            console.log('[ST-ImageGen] Generated prompt:', imagePrompt);
        }
        showLoading('Generating image...');
        const imageUrl = await generateImage(imagePrompt);
        hideLoading();
        const result = await showImagePopup(imageUrl, imagePrompt, messageData.index);
        if (result.accepted) {
            await createImageMessage(result.imageUrl, result.messageIndex, result.prompt);
        }
    } catch (error) {
        if (error.name === 'AbortError') {
            console.log('[ST-ImageGen] Generation cancelled by user');
            return;
        }
        console.error('[ST-ImageGen] Error:', error);
        toastr.error(error.message || 'Failed to generate image', 'Image Generator');
    } finally {
        hideLoading();
        isGenerating = false;
        abortController = null;
    }
}

function onMessageReceived(messageIndex) {
    const settings = getSettings();
    if (settings.enabled && settings.mode === 'auto') {
        setTimeout(() => generateImageForMessage(messageIndex), 500);
    }
}

function addMessageButton(messageId) {
    const messageElement = document.querySelector(`#chat .mes[mesid="${messageId}"]`);
    if (!messageElement) return;
    const extraButtonsContainer = messageElement.querySelector('.mes_buttons .extraMesButtons');
    if (!extraButtonsContainer) return;
    if (extraButtonsContainer.querySelector('.st-imagegen-msg-btn')) return;
    
    // Don't add button to user messages or system messages
    const isUser = messageElement.getAttribute('is_user') === 'true';
    const isSystem = messageElement.getAttribute('is_system') === 'true';
    if (isUser || isSystem) return;
    
    // Also check if this is one of our generated image messages
    const mesId = parseInt(messageId);
    if (!isNaN(mesId) && chat[mesId]?.extra?.st_imagegen) return;
    const button = document.createElement('div');
    button.classList.add('mes_button', 'st-imagegen-msg-btn');
    button.title = 'Generate Image';
    button.innerHTML = '<i class="fa-solid fa-image"></i>';
    button.addEventListener('click', (e) => {
        e.stopPropagation();
        const mesId = parseInt(messageElement.getAttribute('mesid'));
        generateImageForMessage(mesId);
    });
    extraButtonsContainer.appendChild(button);
}

function addButtonsToAllMessages() {
    const messages = document.querySelectorAll('#chat .mes');
    messages.forEach((msg) => {
        const mesId = msg.getAttribute('mesid');
        if (mesId) addMessageButton(mesId);
    });
}

// Render images from saved chat messages that have st_imagegen data
function renderSavedImages() {
    if (!chat || chat.length === 0) return;
    
    chat.forEach((message, index) => {
        if (message.extra?.st_imagegen) {
            const messageElement = document.querySelector(`#chat .mes[mesid="${index}"]`);
            if (messageElement) {
                const mesText = messageElement.querySelector('.mes_text');
                if (mesText && !mesText.querySelector('.st-imagegen-saved-image')) {
                    const imageUrl = message.extra.st_imagegen.imageUrl;
                    if (imageUrl) {
                        // Replace the placeholder text with the actual image
                        mesText.innerHTML = `<img class="st-imagegen-saved-image" src="${imageUrl}" alt="Generated Image" style="max-width: 100%; border-radius: 8px;" />`;
                    } else {
                        // Image URL not available - show placeholder
                        mesText.innerHTML = `<div class="st-imagegen-placeholder" style="padding: 20px; text-align: center; color: var(--SmartThemeQuoteColor); border: 1px dashed var(--SmartThemeBorderColor); border-radius: 8px;">
                            <i class="fa-solid fa-image" style="font-size: 2em; margin-bottom: 10px;"></i>
                            <div>Image could not be loaded</div>
                        </div>`;
                    }
                }
            }
        }
    });
}

function registerSlashCommand() {
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'genimage',
        callback: async (namedArgs) => {
            const mesId = namedArgs.mesid ? parseInt(namedArgs.mesid) : undefined;
            await generateImageForMessage(mesId);
            return '';
        },
        aliases: ['generateimage', 'imggen'],
        returns: 'nothing',
        namedArgumentList: [
            SlashCommandNamedArgument.fromProps({
                name: 'mesid',
                description: 'Message ID to generate image for (defaults to last character message)',
                typeList: [ARGUMENT_TYPE.NUMBER],
                isRequired: false,
            }),
        ],
        unnamedArgumentList: [],
        helpString: '<div>Generates an image based on a character message.</div><div><strong>Example:</strong></div><ul><li><pre><code>/genimage</code></pre> - Generate image for last character message</li><li><pre><code>/genimage mesid=5</code></pre> - Generate image for message #5</li></ul>',
    }));
}

// Generate model dropdown options HTML
function generateModelOptionsHtml() {
    let html = '';
    for (const [modelId, config] of Object.entries(MODEL_CONFIGS)) {
        html += `<option value="${modelId}">${config.name}</option>`;
    }
    return html;
}

// Generate HTML for model-specific parameter fields
function generateModelParamsHtml() {
    let html = '<div id="st_imagegen_model_params" class="st-imagegen-model-params">';
    
    // Create fields for all possible parameters across all models
    const allParams = new Map();
    for (const [modelId, config] of Object.entries(MODEL_CONFIGS)) {
        for (const [paramName, paramConfig] of Object.entries(config.parameters)) {
            if (!allParams.has(paramName)) {
                allParams.set(paramName, paramConfig);
            }
        }
    }
    
    for (const [paramName, paramConfig] of allParams) {
        const fieldId = `st_imagegen_param_${paramName}`;
        html += `<div class="st-imagegen-row st-imagegen-dynamic-param" data-param="${paramName}">`;
        html += `<label for="${fieldId}">${paramConfig.label || paramName}</label>`;
        
        if (paramConfig.type === 'select') {
            html += `<select id="${fieldId}">`;
            for (const option of paramConfig.options || []) {
                html += `<option value="${option}">${option}</option>`;
            }
            html += '</select>';
        } else if (paramConfig.type === 'textarea') {
            html += `<textarea id="${fieldId}" rows="3" placeholder="${paramConfig.placeholder || ''}"></textarea>`;
        } else {
            html += `<input type="text" id="${fieldId}" placeholder="${paramConfig.placeholder || ''}" />`;
        }
        
        html += '</div>';
    }
    
    html += '</div>';
    return html;
}

function createSettingsHtml() {
    const modelOptionsHtml = generateModelOptionsHtml();
    const modelParamsHtml = generateModelParamsHtml();
    
    return `
    <div class="st-imagegen-settings">
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>Image Generator</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content">
                <div class="st-imagegen-enable-row">
                    <label>
                        <input type="checkbox" id="st_imagegen_enabled" />
                        <span>Enable Image Generator</span>
                    </label>
                </div>
                <div class="st-imagegen-section">
                    <h4>Mode</h4>
                    <div class="st-imagegen-mode-toggle">
                        <label>
                            <input type="radio" name="st_imagegen_mode" value="manual" />
                            <span>Manual</span>
                        </label>
                        <label>
                            <input type="radio" name="st_imagegen_mode" value="auto" />
                            <span>Auto</span>
                        </label>
                    </div>
                    <div class="st-imagegen-row-inline">
                        <input type="checkbox" id="st_imagegen_include_char" />
                        <label for="st_imagegen_include_char">Include character card in prompt generation</label>
                    </div>
                </div>
                <div class="st-imagegen-section">
                    <h4 class="st-imagegen-collapsible">
                        Text LLM Settings
                        <i class="fa-solid fa-chevron-down"></i>
                    </h4>
                    <div class="st-imagegen-collapsible-content">
                        <div class="st-imagegen-row">
                            <label for="st_imagegen_text_url">API URL</label>
                            <input type="text" id="st_imagegen_text_url" placeholder="https://api.example.com/v1/chat/completions" />
                        </div>
                        <div class="st-imagegen-row">
                            <label for="st_imagegen_text_key">API Key</label>
                            <input type="password" id="st_imagegen_text_key" placeholder="sk-..." />
                        </div>
                        <div class="st-imagegen-row">
                            <label for="st_imagegen_text_model">Model</label>
                            <input type="text" id="st_imagegen_text_model" placeholder="gpt-4" />
                        </div>
                        <div class="st-imagegen-row">
                            <label for="st_imagegen_text_prompt">System Prompt</label>
                            <textarea id="st_imagegen_text_prompt" rows="4" placeholder="Enter system prompt..."></textarea>
                        </div>
                        <div class="st-imagegen-row-half">
                            <div class="st-imagegen-row">
                                <label for="st_imagegen_text_temp">Temperature</label>
                                <input type="number" id="st_imagegen_text_temp" min="0" max="2" step="0.1" />
                            </div>
                            <div class="st-imagegen-row">
                                <label for="st_imagegen_text_tokens">Max Tokens</label>
                                <input type="number" id="st_imagegen_text_tokens" min="1" max="4096" />
                            </div>
                        </div>
                        <div class="st-imagegen-preset-section">
                            <div class="st-imagegen-row-inline">
                                <input type="checkbox" id="st_imagegen_use_preset" />
                                <label for="st_imagegen_use_preset">Use Preset Prompts</label>
                            </div>
                            <div class="st-imagegen-preset-upload" style="display: none;">
                                <div id="st_imagegen_preset_info">
                                    <span class="st-imagegen-preset-none">No preset loaded</span>
                                </div>
                                <div class="st-imagegen-preset-buttons">
                                    <input type="file" id="st_imagegen_preset_file" accept=".json" style="display: none;" />
                                    <button type="button" id="st_imagegen_preset_upload_btn" class="menu_button">Upload Preset</button>
                                    <button type="button" id="st_imagegen_preset_clear_btn" class="menu_button" style="display: none;">Clear</button>
                                </div>
                                <small class="st-imagegen-hint">Upload a SillyTavern preset JSON file. Only enabled prompts will be injected before the system prompt.</small>
                            </div>
                        </div>
                        <div class="st-imagegen-row">
                            <label for="st_imagegen_post_processing">Prompt Post-Processing</label>
                            <select id="st_imagegen_post_processing">
                                <option value="none">None</option>
                                <option value="semi-strict">Semi-Strict (All SYSTEM → USER)</option>
                                <option value="strict">Strict (Only first SYSTEM kept)</option>
                            </select>
                            <small class="st-imagegen-hint">Semi-Strict converts all system messages to user messages for proxy compatibility</small>
                        </div>
                        <div class="st-imagegen-prefill-section">
                            <div class="st-imagegen-row-inline">
                                <input type="checkbox" id="st_imagegen_use_prefill" />
                                <label for="st_imagegen_use_prefill">Use Prefill (Assistant Message)</label>
                            </div>
                            <div class="st-imagegen-row st-imagegen-prefill-content" style="display: none;">
                                <label for="st_imagegen_prefill_text">Prefill Content</label>
                                <textarea id="st_imagegen_prefill_text" rows="3" placeholder="Enter prefill content to append as assistant message..."></textarea>
                                <small class="st-imagegen-hint">This content will be added as an assistant message at the end of text requests</small>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="st-imagegen-section">
                    <h4 class="st-imagegen-collapsible">
                        Image Generation Settings
                        <i class="fa-solid fa-chevron-down"></i>
                    </h4>
                    <div class="st-imagegen-collapsible-content">
                        <div class="st-imagegen-row">
                            <label for="st_imagegen_img_url">API URL</label>
                            <input type="text" id="st_imagegen_img_url" placeholder="https://api.example.com/v1/images/generations" />
                        </div>
                        <div class="st-imagegen-row">
                            <label for="st_imagegen_img_key">API Key</label>
                            <input type="password" id="st_imagegen_img_key" placeholder="sk-..." />
                        </div>
                        <div class="st-imagegen-row">
                            <label for="st_imagegen_img_model">Model</label>
                            <select id="st_imagegen_img_model">
                                ${modelOptionsHtml}
                            </select>
                        </div>
                        
                        <!-- Dynamic Model Parameters -->
                        ${modelParamsHtml}
                        
                        <div class="st-imagegen-row">
                            <label for="st_imagegen_img_n">Count (n)</label>
                            <input type="number" id="st_imagegen_img_n" min="1" max="10" />
                        </div>
                        <div class="st-imagegen-row">
                            <label for="st_imagegen_img_format">Response Format</label>
                            <select id="st_imagegen_img_format">
                                <option value="url">URL</option>
                                <option value="b64_json">Base64 JSON</option>
                            </select>
                        </div>
                        <div class="st-imagegen-row-inline">
                            <input type="checkbox" id="st_imagegen_img_sse" />
                            <label for="st_imagegen_img_sse">Enable SSE (Server-Sent Events)</label>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
    `;
}

function createGlobalHtml() {
    return `
    <div id="st_imagegen_popup" class="st-imagegen-popup">
        <div class="st-imagegen-popup-content">
            <img id="st_imagegen_preview" src="" alt="Generated Image" />
            <div class="st-imagegen-prompt-preview">
                <div class="st-imagegen-prompt-preview-label">Generated Prompt:</div>
                <div id="st_imagegen_prompt_text"></div>
            </div>
            <div class="st-imagegen-popup-buttons">
                <button id="st_imagegen_accept" class="menu_button">Accept</button>
                <button id="st_imagegen_regenerate" class="menu_button">Regenerate</button>
                <button id="st_imagegen_delete" class="menu_button">Delete</button>
            </div>
        </div>
    </div>
    <div id="st_imagegen_loading" class="st-imagegen-loading">
        <div class="st-imagegen-loading-content">
            <div class="spinner"></div>
            <div class="st-imagegen-loading-text">Generating...</div>
        </div>
        <button id="st_imagegen_cancel" class="st-imagegen-cancel-btn" title="Cancel generation">
            <i class="fa-solid fa-xmark"></i>
        </button>
    </div>
    `;
}

// Update visibility of dynamic parameter fields based on selected model
function updateModelParamsVisibility(modelId) {
    const modelConfig = MODEL_CONFIGS[modelId];
    if (!modelConfig) return;
    
    // Hide all dynamic param fields first
    $('.st-imagegen-dynamic-param').hide();
    
    // Show only the fields for the selected model
    for (const paramName of Object.keys(modelConfig.parameters)) {
        $(`.st-imagegen-dynamic-param[data-param="${paramName}"]`).show();
    }
}

// Load model-specific parameter values into the UI
function loadModelParamsUI() {
    const settings = getSettings();
    const model = settings.imageGen.model;
    const modelParams = settings.imageGen.modelParams[model] || {};
    
    // Load values for all parameters
    for (const [paramName, value] of Object.entries(modelParams)) {
        $(`#st_imagegen_param_${paramName}`).val(value);
    }
    
    // Update visibility
    updateModelParamsVisibility(model);
}

function loadSettingsUI() {
    const settings = getSettings();
    $('#st_imagegen_enabled').prop('checked', settings.enabled);
    $(`input[name="st_imagegen_mode"][value="${settings.mode}"]`).prop('checked', true);
    $('#st_imagegen_include_char').prop('checked', settings.includeCharacterCard);
    $('#st_imagegen_text_url').val(settings.textLlm.apiUrl);
    $('#st_imagegen_text_key').val(settings.textLlm.apiKey);
    $('#st_imagegen_text_model').val(settings.textLlm.model);
    $('#st_imagegen_text_prompt').val(settings.textLlm.systemPrompt);
    $('#st_imagegen_text_temp').val(settings.textLlm.temperature);
    $('#st_imagegen_text_tokens').val(settings.textLlm.maxTokens);
    
    // Load preset settings
    $('#st_imagegen_use_preset').prop('checked', settings.textLlm.usePreset);
    if (settings.textLlm.usePreset) {
        $('.st-imagegen-preset-upload').show();
    }
    // Update preset UI with stored preset data
    updatePresetUI(settings.textLlm.uploadedPreset);
    
    // Load post-processing setting
    $('#st_imagegen_post_processing').val(settings.textLlm.postProcessing || 'none');
    
    // Load prefill settings
    $('#st_imagegen_use_prefill').prop('checked', settings.textLlm.usePrefill);
    $('#st_imagegen_prefill_text').val(settings.textLlm.prefillContent || '');
    if (settings.textLlm.usePrefill) {
        $('.st-imagegen-prefill-content').show();
    }
    
    $('#st_imagegen_img_url').val(settings.imageGen.apiUrl);
    $('#st_imagegen_img_key').val(settings.imageGen.apiKey);
    $('#st_imagegen_img_model').val(settings.imageGen.model);
    $('#st_imagegen_img_n').val(settings.imageGen.n);
    $('#st_imagegen_img_format').val(settings.imageGen.responseFormat);
    $('#st_imagegen_img_sse').prop('checked', settings.imageGen.sse);
    
    // Load model-specific parameters
    loadModelParamsUI();
}

function bindSettingsListeners() {
    const settings = getSettings();
    $('#st_imagegen_enabled').on('change', function () {
        settings.enabled = $(this).prop('checked');
        saveSettings();
    });
    $('input[name="st_imagegen_mode"]').on('change', function () {
        settings.mode = $(this).val();
        saveSettings();
    });
    $('#st_imagegen_include_char').on('change', function () {
        settings.includeCharacterCard = $(this).prop('checked');
        saveSettings();
    });
    $('#st_imagegen_text_url').on('input', function () {
        settings.textLlm.apiUrl = $(this).val();
        saveSettings();
    });
    $('#st_imagegen_text_key').on('input', function () {
        settings.textLlm.apiKey = $(this).val();
        saveSettings();
    });
    $('#st_imagegen_text_model').on('input', function () {
        settings.textLlm.model = $(this).val();
        saveSettings();
    });
    $('#st_imagegen_text_prompt').on('input', function () {
        settings.textLlm.systemPrompt = $(this).val();
        saveSettings();
    });
    $('#st_imagegen_text_temp').on('input', function () {
        settings.textLlm.temperature = parseFloat($(this).val()) || 0.7;
        saveSettings();
    });
    $('#st_imagegen_text_tokens').on('input', function () {
        settings.textLlm.maxTokens = parseInt($(this).val()) || 300;
        saveSettings();
    });
    
    // Preset checkbox handler
    $('#st_imagegen_use_preset').on('change', function () {
        const isChecked = $(this).prop('checked');
        settings.textLlm.usePreset = isChecked;
        saveSettings();
        
        if (isChecked) {
            $('.st-imagegen-preset-upload').slideDown(200);
        } else {
            $('.st-imagegen-preset-upload').slideUp(200);
        }
    });
    
    // Preset file upload button handler
    $('#st_imagegen_preset_upload_btn').on('click', function () {
        $('#st_imagegen_preset_file').click();
    });
    
    // Preset file input handler
    $('#st_imagegen_preset_file').on('change', handlePresetUpload);
    
    // Preset clear button handler
    $('#st_imagegen_preset_clear_btn').on('click', clearUploadedPreset);
    
    // Post-processing dropdown handler
    $('#st_imagegen_post_processing').on('change', function () {
        settings.textLlm.postProcessing = $(this).val();
        saveSettings();
        console.log('[ST-ImageGen] Post-processing mode:', settings.textLlm.postProcessing);
    });
    
    // Prefill checkbox handler
    $('#st_imagegen_use_prefill').on('change', function () {
        const isChecked = $(this).prop('checked');
        settings.textLlm.usePrefill = isChecked;
        saveSettings();
        
        if (isChecked) {
            $('.st-imagegen-prefill-content').slideDown(200);
        } else {
            $('.st-imagegen-prefill-content').slideUp(200);
        }
    });
    
    // Prefill textarea handler
    $('#st_imagegen_prefill_text').on('input', function () {
        settings.textLlm.prefillContent = $(this).val();
        saveSettings();
    });
    
    $('#st_imagegen_img_url').on('input', function () {
        settings.imageGen.apiUrl = $(this).val();
        saveSettings();
    });
    $('#st_imagegen_img_key').on('input', function () {
        settings.imageGen.apiKey = $(this).val();
        saveSettings();
    });
    
    // Model dropdown change handler
    $('#st_imagegen_img_model').on('change', function () {
        const newModel = $(this).val();
        settings.imageGen.model = newModel;
        saveSettings();
        
        // Load the parameters for the new model and update visibility
        loadModelParamsUI();
    });
    
    // Bind listeners for all dynamic model parameters
    for (const [modelId, config] of Object.entries(MODEL_CONFIGS)) {
        for (const paramName of Object.keys(config.parameters)) {
            const fieldId = `#st_imagegen_param_${paramName}`;
            // Use 'input' for text fields and textareas, 'change' for selects
            $(fieldId).off('input change').on('input change', function () {
                setCurrentModelParam(paramName, $(this).val());
            });
        }
    }
    
    $('#st_imagegen_img_n').on('input', function () {
        settings.imageGen.n = parseInt($(this).val()) || 1;
        saveSettings();
    });
    $('#st_imagegen_img_format').on('change', function () {
        settings.imageGen.responseFormat = $(this).val();
        saveSettings();
    });
    $('#st_imagegen_img_sse').on('change', function () {
        settings.imageGen.sse = $(this).prop('checked');
        saveSettings();
    });
    $('.st-imagegen-collapsible').on('click', function () {
        $(this).toggleClass('collapsed');
        $(this).next('.st-imagegen-collapsible-content').toggleClass('collapsed');
    });
}

jQuery(async () => {
    const settingsHtml = createSettingsHtml();
    $('#extensions_settings').append(settingsHtml);
    
    const globalHtml = createGlobalHtml();
    $('body').append(globalHtml);

    loadSettingsUI();
    bindSettingsListeners();
    registerSlashCommand();

    $('#st_imagegen_cancel').on('click', cancelGeneration);

    eventSource.on(event_types.MESSAGE_RECEIVED, onMessageReceived);
    eventSource.on(event_types.CHAT_CHANGED, () => {
        addButtonsToAllMessages();
        // Render saved images after a short delay to ensure DOM is ready
        setTimeout(renderSavedImages, 100);
    });

    addButtonsToAllMessages();
    // Also render saved images on initial load
    setTimeout(renderSavedImages, 500);

    const chatObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (node.nodeType === 1 && node.classList.contains('mes')) {
                    const mesId = node.getAttribute('mesid');
                    if (mesId) addMessageButton(mesId);
                }
            });
        });
    });

    const chatElement = document.getElementById('chat');
    if (chatElement) {
        chatObserver.observe(chatElement, { childList: true });
    }

    console.log('[ST-ImageGen] Extension loaded');
});