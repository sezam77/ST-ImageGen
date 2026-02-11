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
                const config = MODEL_CONFIGS[modelId];
                for (const [paramName, paramConfig] of Object.entries(config.parameters)) {
                    settings.imageGen.modelParams[modelId][paramName] = paramConfig.default || '';
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

