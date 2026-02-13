/**
 * ST-ImageGen Settings Management
 * Handles settings retrieval, storage, and module-level state
 */

import { saveSettingsDebounced } from '../../../../script.js';
import { extension_settings } from '../../../extensions.js';
import { MODULE_NAME, defaultSettings, MODEL_CONFIGS } from './constants.js';

// Module-level state
let isGenerating = false;
let currentGenerationPrompt = '';
let abortController = null;

// State getters and setters
export function getIsGenerating() {
    return isGenerating;
}

export function setIsGenerating(value) {
    isGenerating = value;
}

export function getCurrentPrompt() {
    return currentGenerationPrompt;
}

export function setCurrentPrompt(value) {
    currentGenerationPrompt = value;
}

export function getAbortController() {
    return abortController;
}

export function setAbortController(value) {
    abortController = value;
}

/**
 * Get settings with defaults applied (thread-safe)
 * @returns {Object} The current settings object
 */
export function getSettings() {
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
            }
            const config = MODEL_CONFIGS[modelId];
            for (const [paramName, paramConfig] of Object.entries(config.parameters)) {
                if (!Object.hasOwn(settings.imageGen.modelParams[modelId], paramName)) {
                    const defaultValue = paramConfig.default !== undefined ? paramConfig.default : '';
                    settings.imageGen.modelParams[modelId][paramName] = structuredClone(defaultValue);
                }
            }

            // Migrate legacy NovelAI multiline vibe fields into vibe library entries.
            const modelParams = settings.imageGen.modelParams[modelId];
            const hasVibeLibrary = config.parameters?.vibeReferences?.type === 'vibeLibrary';
            if (hasVibeLibrary && Array.isArray(modelParams.vibeReferences) && modelParams.vibeReferences.length === 0) {
                const legacyImages = String(modelParams.reference_image_multiple || '')
                    .split('\n')
                    .map(item => item.trim())
                    .filter(Boolean)
                    .slice(0, 16);
                if (legacyImages.length > 0) {
                    const legacyInfo = String(modelParams.reference_information_extracted_multiple || '')
                        .split('\n')
                        .map(item => item.trim());
                    const legacyStrength = String(modelParams.reference_strength_multiple || '')
                        .split('\n')
                        .map(item => item.trim());
                    modelParams.vibeReferences = legacyImages.map((image, idx) => ({
                        name: `Vibe ${idx + 1}`,
                        image,
                        infoExtracted: Number.isFinite(Number(legacyInfo[idx])) ? Number(legacyInfo[idx]) : 1,
                        strength: Number.isFinite(Number(legacyStrength[idx])) ? Number(legacyStrength[idx]) : 0.6,
                    }));
                }
            }
        }
    }
    // Ensure lorebook settings exist
    if (!settings.lorebook) {
        settings.lorebook = structuredClone(defaultSettings.lorebook);
    } else {
        for (const key of Object.keys(defaultSettings.lorebook)) {
            if (!Object.hasOwn(settings.lorebook, key)) {
                settings.lorebook[key] = defaultSettings.lorebook[key];
            }
        }
    }
    return settings;
}

/**
 * Get current model's parameters from settings
 * @returns {Object} The parameters for the currently selected model
 */
export function getCurrentModelParams() {
    const settings = getSettings();
    const model = settings.imageGen.model;
    return settings.imageGen.modelParams[model] || {};
}

/**
 * Set a parameter value for the current model
 * @param {string} paramName - The parameter name
 * @param {*} value - The value to set
 */
export function setCurrentModelParam(paramName, value) {
    const settings = getSettings();
    const model = settings.imageGen.model;
    if (!settings.imageGen.modelParams[model]) {
        settings.imageGen.modelParams[model] = {};
    }
    settings.imageGen.modelParams[model][paramName] = value;
    saveSettings();
}

/**
 * Save settings (debounced)
 */
export function saveSettings() {
    saveSettingsDebounced();
}

/**
 * Get character references for the current model
 * @returns {Array<{name: string, url: string}>} Array of character references
 */
export function getCharacterReferences() {
    const settings = getSettings();
    const model = settings.imageGen.model;
    const modelParams = settings.imageGen.modelParams[model] || {};
    return Array.isArray(modelParams.characterReferences) ? modelParams.characterReferences : [];
}

/**
 * Add a character reference for the current model
 * @param {string} name - Character name
 * @param {string} url - Image URL
 * @returns {boolean} Success status
 */
export function addCharacterReference(name, url) {
    const settings = getSettings();
    const model = settings.imageGen.model;
    const modelConfig = MODEL_CONFIGS[model];
    const maxItems = modelConfig?.parameters?.characterReferences?.maxItems || 8;

    if (!settings.imageGen.modelParams[model]) {
        settings.imageGen.modelParams[model] = {};
    }
    if (!Array.isArray(settings.imageGen.modelParams[model].characterReferences)) {
        settings.imageGen.modelParams[model].characterReferences = [];
    }

    const refs = settings.imageGen.modelParams[model].characterReferences;
    if (refs.length >= maxItems) {
        return false; // Max limit reached
    }

    refs.push({ name: name.trim(), url: url.trim() });
    saveSettings();
    return true;
}

/**
 * Update a character reference for the current model
 * @param {number} index - Index of the reference to update
 * @param {string} name - New character name
 * @param {string} url - New image URL
 */
export function updateCharacterReference(index, name, url) {
    const settings = getSettings();
    const model = settings.imageGen.model;
    const refs = settings.imageGen.modelParams[model]?.characterReferences;

    if (refs && index >= 0 && index < refs.length) {
        refs[index] = { name: name.trim(), url: url.trim() };
        saveSettings();
    }
}

/**
 * Remove a character reference for the current model
 * @param {number} index - Index of the reference to remove
 */
export function removeCharacterReference(index) {
    const settings = getSettings();
    const model = settings.imageGen.model;
    const refs = settings.imageGen.modelParams[model]?.characterReferences;

    if (refs && index >= 0 && index < refs.length) {
        refs.splice(index, 1);
        saveSettings();
    }
}

/**
 * Get vibe references for the current model
 * @returns {Array<{name: string, image: string, infoExtracted: number, strength: number}>}
 */
export function getVibeReferences() {
    const settings = getSettings();
    const model = settings.imageGen.model;
    const modelParams = settings.imageGen.modelParams[model] || {};
    return Array.isArray(modelParams.vibeReferences) ? modelParams.vibeReferences : [];
}

/**
 * Add a vibe reference for the current model
 * @param {{name?: string, image?: string, infoExtracted?: number, strength?: number}} [reference={}]
 * @returns {boolean} Success status
 */
export function addVibeReference(reference = {}) {
    const settings = getSettings();
    const model = settings.imageGen.model;
    const modelConfig = MODEL_CONFIGS[model];
    const maxItems = modelConfig?.parameters?.vibeReferences?.maxItems || 16;

    if (!settings.imageGen.modelParams[model]) {
        settings.imageGen.modelParams[model] = {};
    }
    if (!Array.isArray(settings.imageGen.modelParams[model].vibeReferences)) {
        settings.imageGen.modelParams[model].vibeReferences = [];
    }

    const refs = settings.imageGen.modelParams[model].vibeReferences;
    if (refs.length >= maxItems) {
        return false;
    }

    refs.push({
        name: (reference.name || '').trim(),
        image: (reference.image || '').trim(),
        infoExtracted: Number.isFinite(Number(reference.infoExtracted)) ? Number(reference.infoExtracted) : 1,
        strength: Number.isFinite(Number(reference.strength)) ? Number(reference.strength) : 0.6,
    });
    saveSettings();
    return true;
}

/**
 * Update a vibe reference for the current model
 * @param {number} index - Index of the reference to update
 * @param {{name?: string, image?: string, infoExtracted?: number, strength?: number}} reference
 */
export function updateVibeReference(index, reference) {
    const settings = getSettings();
    const model = settings.imageGen.model;
    const refs = settings.imageGen.modelParams[model]?.vibeReferences;

    if (refs && index >= 0 && index < refs.length) {
        const current = refs[index] || {};
        refs[index] = {
            name: reference.name !== undefined ? String(reference.name).trim() : (current.name || ''),
            image: reference.image !== undefined ? String(reference.image).trim() : (current.image || ''),
            infoExtracted: reference.infoExtracted !== undefined
                ? Number(reference.infoExtracted)
                : (Number.isFinite(Number(current.infoExtracted)) ? Number(current.infoExtracted) : 1),
            strength: reference.strength !== undefined
                ? Number(reference.strength)
                : (Number.isFinite(Number(current.strength)) ? Number(current.strength) : 0.6),
        };
        saveSettings();
    }
}

/**
 * Remove a vibe reference for the current model
 * @param {number} index - Index of the reference to remove
 */
export function removeVibeReference(index) {
    const settings = getSettings();
    const model = settings.imageGen.model;
    const refs = settings.imageGen.modelParams[model]?.vibeReferences;

    if (refs && index >= 0 && index < refs.length) {
        refs.splice(index, 1);
        saveSettings();
    }
}

