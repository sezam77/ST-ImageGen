/**
 * ST-ImageGen UI Components
 * Handles loading states, popups, and modals
 */

import { getAbortController, setAbortController, setIsGenerating, setCurrentPrompt } from './settings.js';

/**
 * Show loading overlay with text
 * @param {string} [text='Generating...'] - The loading text to display
 */
export function showLoading(text = 'Generating...') {
    const loading = document.getElementById('st_imagegen_loading');
    const loadingText = loading?.querySelector('.st-imagegen-loading-text');
    if (loading) {
        if (loadingText) loadingText.textContent = text;
        loading.style.display = 'flex';
    }
}

/**
 * Hide loading overlay
 */
export function hideLoading() {
    const loading = document.getElementById('st_imagegen_loading');
    if (loading) loading.style.display = 'none';
}

/**
 * Cancel the current generation
 */
export function cancelGeneration() {
    const controller = getAbortController();
    if (controller) {
        controller.abort();
        setAbortController(null);
    }
    hideLoading();
    setIsGenerating(false);
    toastr.info('Image generation cancelled', 'Image Generator');
}

/**
 * Show image preview popup for approval
 * @param {string} imageUrl - The generated image URL
 * @param {string} prompt - The prompt used to generate the image
 * @param {number} messageIndex - The message index this image is for
 * @returns {Promise<{accepted: boolean, imageUrl?: string, messageIndex?: number, prompt?: string, reason?: string}>}
 */
export function showImagePopup(imageUrl, prompt, messageIndex) {
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
        setCurrentPrompt(prompt);

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
                cleanup();
                // The regeneration will be handled by generation.js
                // We resolve with a special flag to indicate regeneration
                resolve({ accepted: false, reason: 'Regenerating', shouldRegenerate: true, messageIndex, prompt });
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

/**
 * Show a popup to edit the image prompt before sending to the image API
 * @param {string} prompt - The generated prompt to edit
 * @returns {Promise<{accepted: boolean, prompt?: string}>}
 */
export function showPromptEditPopup(prompt) {
    return new Promise((resolve) => {
        const popup = document.getElementById('st_imagegen_edit_prompt_popup');
        const textarea = document.getElementById('st_imagegen_edit_prompt_textarea');
        if (!popup || !textarea) {
            resolve({ accepted: true, prompt: prompt }); // Fall back to original prompt if popup not found
            return;
        }

        textarea.value = prompt;
        popup.style.display = 'flex';
        textarea.focus();

        const acceptBtn = document.getElementById('st_imagegen_edit_accept');
        const discardBtn = document.getElementById('st_imagegen_edit_discard');

        const cleanup = () => {
            popup.style.display = 'none';
            if (acceptBtn) acceptBtn.onclick = null;
            if (discardBtn) discardBtn.onclick = null;
        };

        if (acceptBtn) {
            acceptBtn.onclick = () => {
                const editedPrompt = textarea.value.trim();
                cleanup();
                resolve({ accepted: true, prompt: editedPrompt || prompt });
            };
        }

        if (discardBtn) {
            discardBtn.onclick = () => {
                cleanup();
                resolve({ accepted: false });
            };
        }

        // Close on clicking outside
        popup.onclick = (e) => {
            if (e.target === popup) {
                cleanup();
                resolve({ accepted: false });
            }
        };

        // ESC to discard
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                cleanup();
                document.removeEventListener('keydown', escHandler);
                resolve({ accepted: false });
            }
        };
        document.addEventListener('keydown', escHandler);
    });
}
