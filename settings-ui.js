/**
 * ST-ImageGen Settings UI
 * Handles settings panel HTML generation and event bindings
 */

import { MODEL_CONFIGS } from './constants.js';
import { getSettings, saveSettings, setCurrentModelParam } from './settings.js';
import { handlePresetUpload, clearUploadedPreset, updatePresetUI } from './presets.js';
import { scanLorebookAndShowResults } from './lorebook.js';

/**
 * Generate model dropdown options HTML
 * @returns {string} HTML string of option elements
 */
function generateModelOptionsHtml() {
    let html = '';
    for (const [modelId, config] of Object.entries(MODEL_CONFIGS)) {
        html += `<option value="${modelId}">${config.name}</option>`;
    }
    return html;
}

/**
 * Generate HTML for model-specific parameter fields
 * @returns {string} HTML string for parameter fields
 */
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
        } else if (paramConfig.type === 'checkbox') {
            html += `<input type="checkbox" id="${fieldId}" />`;
        } else if (paramConfig.type === 'number') {
            const min = paramConfig.min !== undefined ? `min="${paramConfig.min}"` : '';
            const max = paramConfig.max !== undefined ? `max="${paramConfig.max}"` : '';
            const step = paramConfig.step !== undefined ? `step="${paramConfig.step}"` : '';
            html += `<input type="number" id="${fieldId}" ${min} ${max} ${step} placeholder="${paramConfig.placeholder || ''}" />`;
        } else {
            html += `<input type="text" id="${fieldId}" placeholder="${paramConfig.placeholder || ''}" />`;
        }

        html += '</div>';
    }

    html += '</div>';
    return html;
}

/**
 * Create the settings panel HTML
 * @returns {string} HTML string for the settings panel
 */
export function createSettingsHtml() {
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
                        <label>
                            <input type="radio" name="st_imagegen_mode" value="fullAuto" />
                            <span>Full Auto</span>
                        </label>
                    </div>
                    <div class="st-imagegen-row-inline">
                        <input type="checkbox" id="st_imagegen_include_char" />
                        <label for="st_imagegen_include_char">Include character card in prompt generation</label>
                    </div>
                    <div class="st-imagegen-row-inline">
                        <input type="checkbox" id="st_imagegen_include_persona" />
                        <label for="st_imagegen_include_persona">Include user persona in prompt generation</label>
                    </div>
                    <div class="st-imagegen-row-inline">
                        <input type="checkbox" id="st_imagegen_include_char_image" />
                        <label for="st_imagegen_include_char_image">Include character image as reference</label>
                    </div>
                    <div class="st-imagegen-row-inline">
                        <input type="checkbox" id="st_imagegen_edit_prompt" />
                        <label for="st_imagegen_edit_prompt">Edit image prompts before sending</label>
                    </div>
                </div>
                <div class="st-imagegen-section">
                    <h4 class="st-imagegen-collapsible">
                        Lorebook Settings
                        <i class="fa-solid fa-chevron-down"></i>
                    </h4>
                    <div class="st-imagegen-collapsible-content">
                        <div class="st-imagegen-row-inline">
                            <input type="checkbox" id="st_imagegen_lorebook_enabled" />
                            <label for="st_imagegen_lorebook_enabled">Enable Lorebook keyword scanning</label>
                        </div>
                        <div class="st-imagegen-lorebook-options" style="display: none;">
                            <div class="st-imagegen-row-inline">
                                <input type="checkbox" id="st_imagegen_lorebook_include" />
                                <label for="st_imagegen_lorebook_include">Include triggered lorebook content in prompt</label>
                            </div>
                            <div class="st-imagegen-row-inline">
                                <input type="checkbox" id="st_imagegen_lorebook_constant" />
                                <label for="st_imagegen_lorebook_constant">Include constant (always-on) entries</label>
                            </div>
                            <div class="st-imagegen-row-half">
                                <div class="st-imagegen-row">
                                    <label for="st_imagegen_lorebook_depth">Scan Depth</label>
                                    <input type="number" id="st_imagegen_lorebook_depth" min="0" max="100" placeholder="0 = use global" />
                                    <small class="st-imagegen-hint">Messages to scan (0 = global setting)</small>
                                </div>
                                <div class="st-imagegen-row">
                                    <label for="st_imagegen_lorebook_max_entries">Max Entries</label>
                                    <input type="number" id="st_imagegen_lorebook_max_entries" min="1" max="50" />
                                </div>
                            </div>
                            <div class="st-imagegen-row">
                                <label for="st_imagegen_lorebook_max_tokens">Max Tokens</label>
                                <input type="number" id="st_imagegen_lorebook_max_tokens" min="50" max="4096" />
                                <small class="st-imagegen-hint">Maximum tokens of lorebook content to include</small>
                            </div>
                            <div class="st-imagegen-lorebook-status">
                                <button type="button" id="st_imagegen_lorebook_scan_btn" class="menu_button">
                                    <i class="fa-solid fa-book"></i> Scan Lorebook Now
                                </button>
                                <div id="st_imagegen_lorebook_preview" class="st-imagegen-lorebook-preview" style="display: none;">
                                    <div class="st-imagegen-lorebook-preview-header">
                                        <span>Triggered Entries:</span>
                                        <span id="st_imagegen_lorebook_count">0</span>
                                    </div>
                                    <div id="st_imagegen_lorebook_entries" class="st-imagegen-lorebook-entries"></div>
                                </div>
                            </div>
                        </div>
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
                        <div class="st-imagegen-reasoning-section">
                            <div class="st-imagegen-row-inline">
                                <input type="checkbox" id="st_imagegen_enable_reasoning" />
                                <label for="st_imagegen_enable_reasoning">Enable Reasoning/Thinking</label>
                            </div>
                            <div class="st-imagegen-row st-imagegen-reasoning-options" style="display: none;">
                                <label for="st_imagegen_reasoning_effort">Reasoning Effort</label>
                                <select id="st_imagegen_reasoning_effort">
                                    <option value="low">Low</option>
                                    <option value="medium">Medium</option>
                                    <option value="high">High</option>
                                </select>
                                <small class="st-imagegen-hint">Controls how much effort the model puts into reasoning (for supported models)</small>
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
                        <div class="st-imagegen-row st-imagegen-custom-model-row" style="display: none;">
                            <label for="st_imagegen_img_custom_model">Custom Model Name</label>
                            <input type="text" id="st_imagegen_img_custom_model" placeholder="Enter custom model name..." />
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
                        <div class="st-imagegen-row-inline">
                            <input type="checkbox" id="st_imagegen_use_chat_completions" />
                            <label for="st_imagegen_use_chat_completions">Use Chat Completions Format (/v1/chat/completions)</label>
                        </div>
                        <small class="st-imagegen-hint" style="margin-top: -8px;">Enable for APIs that generate images via chat completions endpoint instead of /v1/images/generations</small>
                    </div>
                </div>
            </div>
        </div>
    </div>
    `;
}

/**
 * Create the global popup/modal HTML
 * @returns {string} HTML string for popups and loading overlay
 */
export function createGlobalHtml() {
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
    <div id="st_imagegen_edit_prompt_popup" class="st-imagegen-popup">
        <div class="st-imagegen-popup-content st-imagegen-edit-prompt-content">
            <div class="st-imagegen-edit-prompt-header">
                <i class="fa-solid fa-pen-to-square"></i>
                <span>Edit Image Prompt</span>
            </div>
            <div class="st-imagegen-edit-prompt-body">
                <textarea id="st_imagegen_edit_prompt_textarea" rows="8" placeholder="Edit the generated prompt before sending to image API..."></textarea>
            </div>
            <div class="st-imagegen-popup-buttons">
                <button id="st_imagegen_edit_accept" class="menu_button">Accept</button>
                <button id="st_imagegen_edit_discard" class="menu_button">Discard</button>
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

/**
 * Update visibility of dynamic parameter fields based on selected model
 * @param {string} modelId - The model ID
 */
export function updateModelParamsVisibility(modelId) {
    const modelConfig = MODEL_CONFIGS[modelId];
    if (!modelConfig) return;

    // Hide all dynamic param fields first
    $('.st-imagegen-dynamic-param').hide();

    // Show only the fields for the selected model
    for (const paramName of Object.keys(modelConfig.parameters)) {
        $(`.st-imagegen-dynamic-param[data-param="${paramName}"]`).show();
    }
}

/**
 * Load model-specific parameter values into the UI
 */
export function loadModelParamsUI() {
    const settings = getSettings();
    const model = settings.imageGen.model;
    const modelConfig = MODEL_CONFIGS[model];
    const modelParams = settings.imageGen.modelParams[model] || {};

    // Load values for all parameters
    for (const [paramName, value] of Object.entries(modelParams)) {
        const $field = $(`#st_imagegen_param_${paramName}`);
        // Check parameter type from config
        const paramConfig = modelConfig?.parameters?.[paramName];
        if (paramConfig?.type === 'checkbox') {
            $field.prop('checked', value);
        } else {
            $field.val(value);
        }
    }

    // Update visibility
    updateModelParamsVisibility(model);
}

/**
 * Load all settings into the UI
 */
export function loadSettingsUI() {
    const settings = getSettings();
    $('#st_imagegen_enabled').prop('checked', settings.enabled);
    $(`input[name="st_imagegen_mode"][value="${settings.mode}"]`).prop('checked', true);
    $('#st_imagegen_include_char').prop('checked', settings.includeCharacterCard);
    $('#st_imagegen_include_persona').prop('checked', settings.includeUserPersona);
    $('#st_imagegen_include_char_image').prop('checked', settings.includeCharacterImage);
    $('#st_imagegen_edit_prompt').prop('checked', settings.editPromptBeforeSending);
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

    // Load reasoning settings
    $('#st_imagegen_enable_reasoning').prop('checked', settings.textLlm.enableReasoning);
    $('#st_imagegen_reasoning_effort').val(settings.textLlm.reasoningEffort || 'medium');
    if (settings.textLlm.enableReasoning) {
        $('.st-imagegen-reasoning-options').show();
    }

    $('#st_imagegen_img_url').val(settings.imageGen.apiUrl);
    $('#st_imagegen_img_key').val(settings.imageGen.apiKey);
    $('#st_imagegen_img_model').val(settings.imageGen.model);
    $('#st_imagegen_img_custom_model').val(settings.imageGen.customModelName || '');
    $('#st_imagegen_img_n').val(settings.imageGen.n);
    $('#st_imagegen_img_format').val(settings.imageGen.responseFormat);
    $('#st_imagegen_img_sse').prop('checked', settings.imageGen.sse);
    $('#st_imagegen_use_chat_completions').prop('checked', settings.imageGen.useChatCompletions);

    // Show custom model input if custom model is selected
    if (settings.imageGen.model === 'custom') {
        $('.st-imagegen-custom-model-row').show();
    }

    // Load model-specific parameters
    loadModelParamsUI();

    // Load lorebook settings
    $('#st_imagegen_lorebook_enabled').prop('checked', settings.lorebook.enabled);
    $('#st_imagegen_lorebook_include').prop('checked', settings.lorebook.includeInPrompt);
    $('#st_imagegen_lorebook_constant').prop('checked', settings.lorebook.includeConstant);
    $('#st_imagegen_lorebook_depth').val(settings.lorebook.scanDepth);
    $('#st_imagegen_lorebook_max_entries').val(settings.lorebook.maxEntries);
    $('#st_imagegen_lorebook_max_tokens').val(settings.lorebook.maxTokens);
    if (settings.lorebook.enabled) {
        $('.st-imagegen-lorebook-options').show();
    }
}

/**
 * Bind all settings event listeners
 */
export function bindSettingsListeners() {
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
    $('#st_imagegen_include_persona').on('change', function () {
        settings.includeUserPersona = $(this).prop('checked');
        saveSettings();
    });
    $('#st_imagegen_include_char_image').on('change', function () {
        settings.includeCharacterImage = $(this).prop('checked');
        saveSettings();
    });
    $('#st_imagegen_edit_prompt').on('change', function () {
        settings.editPromptBeforeSending = $(this).prop('checked');
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

    // Reasoning checkbox handler
    $('#st_imagegen_enable_reasoning').on('change', function () {
        const isChecked = $(this).prop('checked');
        settings.textLlm.enableReasoning = isChecked;
        saveSettings();

        if (isChecked) {
            $('.st-imagegen-reasoning-options').slideDown(200);
        } else {
            $('.st-imagegen-reasoning-options').slideUp(200);
        }
    });

    // Reasoning effort dropdown handler
    $('#st_imagegen_reasoning_effort').on('change', function () {
        settings.textLlm.reasoningEffort = $(this).val();
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

        // Show/hide custom model name input
        if (newModel === 'custom') {
            $('.st-imagegen-custom-model-row').slideDown(200);
        } else {
            $('.st-imagegen-custom-model-row').slideUp(200);
        }

        // Load the parameters for the new model and update visibility
        loadModelParamsUI();
    });

    // Custom model name input handler
    $('#st_imagegen_img_custom_model').on('input', function () {
        settings.imageGen.customModelName = $(this).val();
        saveSettings();
    });

    // Bind listeners for all dynamic model parameters
    for (const [modelId, config] of Object.entries(MODEL_CONFIGS)) {
        for (const [paramName, paramConfig] of Object.entries(config.parameters)) {
            const fieldId = `#st_imagegen_param_${paramName}`;
            // Use 'input' for text fields, textareas, and numbers; 'change' for selects and checkboxes
            $(fieldId).off('input change').on('input change', function () {
                let value;
                if (paramConfig.type === 'checkbox') {
                    value = $(this).prop('checked');
                } else if (paramConfig.type === 'number') {
                    value = parseFloat($(this).val()) || paramConfig.default || 0;
                } else {
                    value = $(this).val();
                }
                setCurrentModelParam(paramName, value);
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
    $('#st_imagegen_use_chat_completions').on('change', function () {
        settings.imageGen.useChatCompletions = $(this).prop('checked');
        saveSettings();
    });
    $('.st-imagegen-collapsible').on('click', function () {
        $(this).toggleClass('collapsed');
        $(this).next('.st-imagegen-collapsible-content').toggleClass('collapsed');
    });

    // Lorebook settings handlers
    $('#st_imagegen_lorebook_enabled').on('change', function () {
        const isChecked = $(this).prop('checked');
        settings.lorebook.enabled = isChecked;
        saveSettings();

        if (isChecked) {
            $('.st-imagegen-lorebook-options').slideDown(200);
        } else {
            $('.st-imagegen-lorebook-options').slideUp(200);
        }
    });

    $('#st_imagegen_lorebook_include').on('change', function () {
        settings.lorebook.includeInPrompt = $(this).prop('checked');
        saveSettings();
    });

    $('#st_imagegen_lorebook_constant').on('change', function () {
        settings.lorebook.includeConstant = $(this).prop('checked');
        saveSettings();
    });

    $('#st_imagegen_lorebook_depth').on('input', function () {
        settings.lorebook.scanDepth = parseInt($(this).val()) || 0;
        saveSettings();
    });

    $('#st_imagegen_lorebook_max_entries').on('input', function () {
        settings.lorebook.maxEntries = parseInt($(this).val()) || 10;
        saveSettings();
    });

    $('#st_imagegen_lorebook_max_tokens').on('input', function () {
        settings.lorebook.maxTokens = parseInt($(this).val()) || 500;
        saveSettings();
    });

    // Lorebook scan button handler
    $('#st_imagegen_lorebook_scan_btn').on('click', scanLorebookAndShowResults);
}
