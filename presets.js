/**
 * ST-ImageGen Preset Upload and Processing
 * Handles SillyTavern preset file parsing and prompt injection
 */

import { substituteParams } from '../../../../script.js';
import { getSettings, saveSettings } from './settings.js';

/**
 * Check if a prompt content is meaningful (not just macros/comments/empty)
 * @param {string} content - The prompt content to check
 * @returns {boolean} True if the content has meaningful text
 */
export function hasActualContent(content) {
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
export async function parsePresetFile(file) {
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
                                continue;
                            }

                            // Skip if no content or role
                            if (!prompt.content || !prompt.role) {
                                continue;
                            }

                            // Skip if content is just macros/comments with no actual text
                            if (!hasActualContent(prompt.content)) {
                                continue;
                            }

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
export async function handlePresetUpload(event) {
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
export function clearUploadedPreset() {
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
export function updatePresetUI(presetData) {
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
 * Get prompts from the uploaded preset with ST macros substituted
 * @returns {Array<{role: string, content: string}>} Array of prompt messages with macros resolved
 */
export function getUploadedPresetPrompts() {
    const settings = getSettings();
    const uploadedPreset = settings.textLlm.uploadedPreset;

    if (!uploadedPreset || !uploadedPreset.prompts) {
        return [];
    }

    // Return prompts in the format expected by the message builder
    // Apply ST macro substitution to each prompt's content
    return uploadedPreset.prompts.map(p => {
        let content = p.content;

        // Apply SillyTavern macro substitution
        try {
            content = substituteParams(content);
        } catch (error) {
            console.warn('[ST-ImageGen] Failed to substitute macros for prompt:', p.identifier, error);
            // Fall back to original content if substitution fails
        }

        return {
            role: p.role,
            content: content
        };
    });
}

/**
 * Apply post-processing to messages array based on the selected mode
 * @param {Array<{role: string, content: string}>} messages - The messages array to process
 * @param {string} mode - The post-processing mode: 'none', 'semi-strict', 'strict'
 * @returns {Array<{role: string, content: string}>} The processed messages array
 */
export function applyPostProcessing(messages, mode) {
    if (!messages || messages.length === 0 || mode === 'none') {
        return messages;
    }

    if (mode === 'semi-strict') {
        // Semi-Strict: Convert ALL system messages to user messages
        return messages.map(msg => {
            if (msg.role === 'system') {
                return { role: 'user', content: msg.content };
            }
            return msg;
        });
    }

    if (mode === 'strict') {
        // Strict: Only allow system messages at the very start, convert rest to user/assistant
        // First system message stays as system, subsequent ones become user
        let foundFirstSystem = false;
        return messages.map(msg => {
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
    }

    return messages;
}
