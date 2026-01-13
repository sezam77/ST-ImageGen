/**
 * ST-ImageGen Generation Workflow
 * Handles the core image generation workflow and message creation
 */

import { chat } from '../../../../script.js';
import { saveBase64AsFile } from '../../../utils.js';
import { getSettings, getIsGenerating, setIsGenerating, setAbortController } from './settings.js';
import { getCharacterData, getCharacterMessage } from './character.js';
import { transformMessageToImagePrompt, generateImage } from './api.js';
import { showLoading, hideLoading, showImagePopup, showPromptEditPopup, showManualPromptPopup } from './ui.js';

/**
 * Create an image message in the chat
 * @param {string} imageUrl - The image URL or data URL
 * @param {number} afterMessageIndex - The message index to insert after
 * @param {string} prompt - The prompt used to generate the image
 */
export async function createImageMessage(imageUrl, afterMessageIndex, prompt) {
    // Get the SillyTavern context
    const context = SillyTavern.getContext();

    // Check if this is a base64 data URL
    const isBase64 = imageUrl.startsWith('data:');
    let finalImageUrl = imageUrl;

    // If it's a base64 image, save it to the server using SillyTavern's utility
    if (isBase64) {
        try {
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

    toastr.success('Image added to chat!', 'Image Generator');
}

/**
 * Generate an image for a specific message
 * @param {number} [messageIndex] - The message index to generate for (defaults to last character message)
 * @param {string|null} [existingPrompt=null] - An existing prompt to use (for regeneration)
 */
export async function generateImageForMessage(messageIndex, existingPrompt = null) {
    if (getIsGenerating()) {
        toastr.warning('Already generating an image, please wait...', 'Image Generator');
        return;
    }
    const settings = getSettings();
    if (!settings.enabled) {
        toastr.info('Image Generator is disabled', 'Image Generator');
        return;
    }
    if (!settings.textLlm.apiUrl && !existingPrompt && !settings.manualPromptMode) {
        toastr.error('Text LLM API URL is not configured', 'Image Generator');
        return;
    }
    if (!settings.imageGen.apiUrl) {
        toastr.error('Image Generation API URL is not configured', 'Image Generator');
        return;
    }
    setIsGenerating(true);
    try {
        const messageData = getCharacterMessage(messageIndex);
        if (!messageData) {
            toastr.warning('No character message found', 'Image Generator');
            return;
        }
        let imagePrompt = existingPrompt;
        if (!imagePrompt) {
            if (settings.manualPromptMode) {
                // Manual mode: ask user to type prompt directly
                const manualResult = await showManualPromptPopup();
                if (!manualResult.accepted || !manualResult.prompt) {
                    toastr.info('Image generation cancelled', 'Image Generator');
                    return;
                }
                imagePrompt = manualResult.prompt;
            } else {
                // Normal mode: use LLM to generate prompt
                showLoading('Generating image prompt...');
                const characterData = getCharacterData();
                imagePrompt = await transformMessageToImagePrompt(messageData.message, characterData);
            }
        }
        hideLoading();

        // Show edit prompt popup if enabled
        if (settings.editPromptBeforeSending) {
            const editResult = await showPromptEditPopup(imagePrompt);
            if (!editResult.accepted) {
                toastr.info('Image generation cancelled', 'Image Generator');
                return;
            }
            imagePrompt = editResult.prompt;
        }

        showLoading('Generating image...');
        const imageUrl = await generateImage(imagePrompt);
        hideLoading();
        const result = await showImagePopup(imageUrl, imagePrompt, messageData.index);
        if (result.accepted) {
            await createImageMessage(result.imageUrl, result.messageIndex, result.prompt);
        } else if (result.shouldRegenerate) {
            // Handle regeneration - reset flag and call ourselves again
            setIsGenerating(false);
            await generateImageForMessage(result.messageIndex, result.prompt);
            return;
        }
    } catch (error) {
        if (error.name === 'AbortError') {
            return;
        }
        console.error('[ST-ImageGen] Error:', error);
        toastr.error(error.message || 'Failed to generate image', 'Image Generator');
    } finally {
        hideLoading();
        setIsGenerating(false);
        setAbortController(null);
    }
}

/**
 * Generate image for a message in Full Auto mode (no popups, no confirmations)
 * @param {number} messageIndex - The message index to generate an image for
 */
export async function generateImageForMessageFullAuto(messageIndex) {
    if (getIsGenerating()) {
        // Silently skip if already generating
        return;
    }
    const settings = getSettings();
    if (!settings.enabled) {
        return;
    }
    if (!settings.textLlm.apiUrl) {
        console.warn('[ST-ImageGen] Full Auto: Text LLM API URL is not configured');
        return;
    }
    if (!settings.imageGen.apiUrl) {
        console.warn('[ST-ImageGen] Full Auto: Image Generation API URL is not configured');
        return;
    }
    setIsGenerating(true);
    try {
        const messageData = getCharacterMessage(messageIndex);
        if (!messageData) {
            return;
        }

        // Generate prompt silently (no loading popup)
        const characterData = getCharacterData();
        const imagePrompt = await transformMessageToImagePrompt(messageData.message, characterData);

        // Generate image silently (no loading popup)
        const imageUrl = await generateImage(imagePrompt);

        // Auto-accept the image (no confirmation popup)
        await createImageMessage(imageUrl, messageData.index, imagePrompt);

    } catch (error) {
        if (error.name === 'AbortError') {
            return;
        }
        console.error('[ST-ImageGen] Full Auto Error:', error);
        // Show error toastr even in full auto mode so user knows something went wrong
        toastr.error(error.message || 'Failed to generate image', 'Image Generator (Full Auto)');
    } finally {
        setIsGenerating(false);
        setAbortController(null);
    }
}

/**
 * Handle MESSAGE_RECEIVED event - trigger auto generation if enabled
 * @param {number} messageIndex - The received message index
 */
export function onMessageReceived(messageIndex) {
    const settings = getSettings();
    if (settings.enabled && settings.mode === 'auto') {
        setTimeout(() => generateImageForMessage(messageIndex), 500);
    } else if (settings.enabled && settings.mode === 'fullAuto') {
        setTimeout(() => generateImageForMessageFullAuto(messageIndex), 500);
    }
}
