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
