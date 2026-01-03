/**
 * ST-ImageGen Message Handling
 * Handles message buttons, saved image rendering, and slash commands
 */

import { chat } from '../../../../script.js';
import { SlashCommandParser } from '../../../slash-commands/SlashCommandParser.js';
import { SlashCommand } from '../../../slash-commands/SlashCommand.js';
import { ARGUMENT_TYPE, SlashCommandNamedArgument } from '../../../slash-commands/SlashCommandArgument.js';
import { generateImageForMessage } from './generation.js';

/**
 * Add image generation button to a message
 * @param {string} messageId - The message ID (mesid attribute)
 */
export function addMessageButton(messageId) {
    const messageElement = document.querySelector(`#chat .mes[mesid="${messageId}"]`);
    if (!messageElement) return;
    const extraButtonsContainer = messageElement.querySelector('.mes_buttons .extraMesButtons');
    if (!extraButtonsContainer) return;
    if (extraButtonsContainer.querySelector('.st-imagegen-custom-btn')) return;

    // Don't add button to user messages or system messages
    const isUser = messageElement.getAttribute('is_user') === 'true';
    const isSystem = messageElement.getAttribute('is_system') === 'true';
    if (isUser || isSystem) return;

    // Also check if this is one of our generated image messages
    const mesId = parseInt(messageId);
    if (!isNaN(mesId) && chat[mesId]?.extra?.st_imagegen) return;

    const button = document.createElement('div');
    button.classList.add('mes_button', 'st-imagegen-custom-btn');
    button.title = 'ST-ImageGen: Generate Image';
    button.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i>';
    button.addEventListener('click', (e) => {
        e.stopPropagation();
        const mesId = parseInt(messageElement.getAttribute('mesid'));
        generateImageForMessage(mesId);
    });
    extraButtonsContainer.appendChild(button);
}

/**
 * Add image generation buttons to all messages in the chat
 */
export function addButtonsToAllMessages() {
    const messages = document.querySelectorAll('#chat .mes');
    messages.forEach((msg) => {
        const mesId = msg.getAttribute('mesid');
        if (mesId) addMessageButton(mesId);
    });
}

/**
 * Render images from saved chat messages that have st_imagegen data
 */
export function renderSavedImages() {
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

/**
 * Register the /genimage slash command
 */
export function registerSlashCommand() {
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
