/**
 * SillyTavern Image Generator Extension
 * Automatically generates images from AI character messages using OpenAI-compatible APIs
 *
 * This is the main entry point that imports and initializes all modules.
 */

import { eventSource, event_types } from '../../../../script.js';

// Import UI setup functions
import { createSettingsHtml, createGlobalHtml, loadSettingsUI, bindSettingsListeners } from './settings-ui.js';

// Import message handling functions
import { addMessageButton, addButtonsToAllMessages, renderSavedImages, registerSlashCommand } from './messages.js';

// Import generation event handler
import { onMessageReceived } from './generation.js';

// Import UI cancel function
import { cancelGeneration } from './ui.js';

// Initialize extension when jQuery is ready
jQuery(async () => {
    // Create and append settings panel HTML
    const settingsHtml = createSettingsHtml();
    $('#extensions_settings').append(settingsHtml);

    // Create and append global popup/modal HTML
    const globalHtml = createGlobalHtml();
    $('body').append(globalHtml);

    // Load saved settings into UI
    loadSettingsUI();

    // Bind all event listeners for settings
    bindSettingsListeners();

    // Register slash command
    registerSlashCommand();

    // Bind cancel button
    $('#st_imagegen_cancel').on('click', cancelGeneration);

    // Subscribe to SillyTavern events
    eventSource.on(event_types.MESSAGE_RECEIVED, onMessageReceived);
    eventSource.on(event_types.CHAT_CHANGED, () => {
        addButtonsToAllMessages();
        // Render saved images after a short delay to ensure DOM is ready
        setTimeout(renderSavedImages, 100);
    });

    // Add buttons to existing messages
    addButtonsToAllMessages();

    // Render saved images on initial load
    setTimeout(renderSavedImages, 500);

    // Observe chat for new messages to add buttons
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
});
