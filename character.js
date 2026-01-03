/**
 * ST-ImageGen Character and Message Utilities
 * Handles character data, user persona, avatar, and message processing
 */

import { characters, this_chid, chat, name1 } from '../../../../script.js';
import { getContext } from '../../../extensions.js';
import { power_user } from '../../../power-user.js';
import { getBase64Async } from '../../../utils.js';

/**
 * Get character data for the current chat
 * @returns {{name: string, description: string, personality: string, scenario: string, avatar: string} | null}
 */
export function getCharacterData() {
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

/**
 * Get user persona data
 * @returns {{name: string, description: string} | null}
 */
export function getUserPersonaData() {
    const context = getContext();
    const userName = name1 || context.name1 || 'User';
    const personaDescription = power_user?.persona_description || '';

    if (!personaDescription) return null;

    return {
        name: userName,
        description: personaDescription,
    };
}

/**
 * Get character avatar as base64
 * @returns {Promise<{mimeType: string, data: string, name: string} | null>}
 */
export async function getCharacterAvatar() {
    const context = getContext();
    const character = context.characters?.[context.characterId];
    if (!character?.avatar) return null;

    try {
        const avatarUrl = `/characters/${encodeURIComponent(character.avatar)}`;
        const response = await fetch(avatarUrl);
        if (!response.ok) return null;

        const blob = await response.blob();
        const base64 = await getBase64Async(blob);
        const parts = base64.split(',');
        const mimeType = parts[0]?.match(/data:([^;]+)/)?.[1] || 'image/png';

        return {
            mimeType,
            data: parts[1] || base64,
            name: context.name2 || character.name || 'Character',
        };
    } catch (error) {
        console.warn('[ST-ImageGen] Error fetching character avatar:', error);
        return null;
    }
}

/**
 * Clean message content by removing HTML elements except font and span
 * - <font> tags are kept entirely (for dialogue coloring)
 * - <span> tags are removed but their text content is kept
 * - All other HTML tags and their contents are removed
 * @param {string} message - Raw message content
 * @returns {string} - Cleaned message
 */
export function cleanMessageContent(message) {
    if (!message) return message;

    let cleaned = message;

    // Remove <span> tags but keep their text content (handle nested by repeating)
    let prev = '';
    while (prev !== cleaned) {
        prev = cleaned;
        cleaned = cleaned.replace(/<span[^>]*>([\s\S]*?)<\/span>/gi, '$1');
    }

    // Remove all other HTML tags WITH their content, except <font>
    // Match opening tag, content, closing tag for any tag that's not font
    // Repeat to handle nested tags
    prev = '';
    while (prev !== cleaned) {
        prev = cleaned;
        cleaned = cleaned.replace(/<(?!font\b)(\w+)[^>]*>[\s\S]*?<\/\1>/gi, '');
    }

    // Remove any remaining self-closing or orphaned tags (except font)
    cleaned = cleaned.replace(/<(?!\/?font\b)[^>]+>/gi, '');

    // Clean up excessive whitespace/newlines left behind
    cleaned = cleaned.replace(/\n{4,}/g, '\n\n\n');
    cleaned = cleaned.trim();

    return cleaned;
}

/**
 * Get the most recent character message or a specific message by index
 * @param {number} [messageIndex] - Optional specific message index
 * @returns {{message: string, index: number} | null}
 */
export function getCharacterMessage(messageIndex) {
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
