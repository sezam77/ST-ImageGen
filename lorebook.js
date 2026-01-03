/**
 * ST-ImageGen Lorebook / World Info Functions
 * Handles lorebook keyword scanning and content extraction
 */

import { chat } from '../../../../script.js';
import {
    getWorldInfoSettings,
    getSortedEntries,
    world_info_case_sensitive,
    world_info_match_whole_words,
} from '../../../world-info.js';
import { getSettings } from './settings.js';

/**
 * Check if a keyword matches in the given text
 * Supports regex patterns (wrapped in /.../) and plain text keywords
 * @param {string} keyword - The keyword or regex pattern to match
 * @param {string} text - The text to search in
 * @param {boolean} caseSensitive - Whether matching is case-sensitive
 * @param {boolean} matchWholeWords - Whether to match whole words only
 * @returns {boolean} True if the keyword matches
 */
function matchKeyword(keyword, text, caseSensitive, matchWholeWords) {
    if (!keyword || !text) return false;

    // Check if it's a regex pattern (wrapped in /.../flags)
    const regexMatch = keyword.match(/^\/(.+?)\/([gimsuy]*)$/);
    if (regexMatch) {
        try {
            let flags = regexMatch[2] || '';
            if (!caseSensitive && !flags.includes('i')) {
                flags += 'i';
            }
            const regex = new RegExp(regexMatch[1], flags);
            return regex.test(text);
        } catch (e) {
            console.warn('[ST-ImageGen] Invalid regex pattern:', keyword, e);
            return false;
        }
    }

    // Plain text matching
    let searchText = text;
    let searchKeyword = keyword;

    if (!caseSensitive) {
        searchText = text.toLowerCase();
        searchKeyword = keyword.toLowerCase();
    }

    if (matchWholeWords) {
        // Use word boundary matching
        const escapedKeyword = searchKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const wordBoundaryRegex = new RegExp(`\\b${escapedKeyword}\\b`, caseSensitive ? '' : 'i');
        return wordBoundaryRegex.test(text);
    }

    return searchText.includes(searchKeyword);
}

/**
 * Check if an entry's keys match the given text
 * @param {Object} entry - The lorebook entry
 * @param {string} text - The text to match against
 * @param {boolean} caseSensitive - Global case sensitivity setting
 * @param {boolean} matchWholeWords - Global whole word matching setting
 * @param {boolean} includeConstant - Whether to include constant entries
 * @returns {boolean} True if the entry should be triggered
 */
function entryMatchesText(entry, text, caseSensitive, matchWholeWords, includeConstant) {
    // Use entry-specific settings if defined, otherwise use global
    const useCaseSensitive = entry.caseSensitive !== null ? entry.caseSensitive : caseSensitive;
    const useWholeWords = entry.matchWholeWords !== null ? entry.matchWholeWords : matchWholeWords;

    // Check if entry is disabled
    if (entry.disable) return false;

    // Constant entries - only include if setting is enabled
    if (entry.constant) return includeConstant;

    // Get primary keys
    const keys = entry.key || [];
    if (!keys.length) return false;

    // Check if any primary key matches
    const primaryMatch = keys.some(key => matchKeyword(key, text, useCaseSensitive, useWholeWords));

    if (!primaryMatch) return false;

    // Check secondary keys if selective mode is enabled
    if (entry.selective && entry.keysecondary && entry.keysecondary.length > 0) {
        const secondaryKeys = entry.keysecondary;
        const logic = entry.selectiveLogic || 0; // 0 = AND_ANY, 1 = NOT_ALL, 2 = NOT_ANY, 3 = AND_ALL

        const secondaryMatches = secondaryKeys.map(key => matchKeyword(key, text, useCaseSensitive, useWholeWords));

        switch (logic) {
            case 0: // AND_ANY - at least one secondary key must match
                if (!secondaryMatches.some(m => m)) return false;
                break;
            case 1: // NOT_ALL - not all secondary keys should match
                if (secondaryMatches.every(m => m)) return false;
                break;
            case 2: // NOT_ANY - none of the secondary keys should match
                if (secondaryMatches.some(m => m)) return false;
                break;
            case 3: // AND_ALL - all secondary keys must match
                if (!secondaryMatches.every(m => m)) return false;
                break;
        }
    }

    return true;
}

/**
 * Get triggered lorebook entries based on recent chat messages
 * Uses SillyTavern's getSortedEntries to get all available entries, then scans for matches
 * @returns {Promise<{entries: Array<{uid: number, comment: string, content: string, keys: string[]}>, totalTokens: number}>}
 */
export async function getTriggeredLorebookEntries() {
    const settings = getSettings();

    if (!settings.lorebook.enabled) {
        return { entries: [], totalTokens: 0 };
    }

    try {
        // Get the world info settings
        const wiSettings = getWorldInfoSettings();

        // Get all available lorebook entries using ST's built-in function
        const allEntries = await getSortedEntries();

        if (!allEntries || allEntries.length === 0) {
            return { entries: [], totalTokens: 0 };
        }

        // Build the text to scan from recent messages
        const scanDepth = settings.lorebook.scanDepth || wiSettings.world_info_depth || 5;
        const recentMessages = chat.slice(-scanDepth);

        // Combine message text for scanning
        const chatText = recentMessages
            .map(msg => msg.mes || '')
            .join('\n');

        // Get global settings for matching
        const caseSensitive = world_info_case_sensitive;
        const matchWholeWords = world_info_match_whole_words;
        const includeConstant = settings.lorebook.includeConstant;

        // Find entries that match - process constant entries first, then keyword-triggered
        const triggeredEntries = [];
        let totalTokens = 0;
        const maxEntries = settings.lorebook.maxEntries || 10;
        const maxTokens = settings.lorebook.maxTokens || 500;

        // Separate constant and keyword entries
        const constantEntries = allEntries.filter(e => e.constant && !e.disable && e.content?.trim());
        const keywordEntries = allEntries.filter(e => !e.constant);

        // First, add constant entries if enabled
        if (includeConstant) {
            for (const entry of constantEntries) {
                if (triggeredEntries.length >= maxEntries) break;
                if (totalTokens >= maxTokens) break;

                const entryTokens = Math.ceil((entry.content || '').length / 4);

                if (totalTokens + entryTokens <= maxTokens) {
                    triggeredEntries.push({
                        uid: entry.uid,
                        comment: entry.comment || `Entry ${entry.uid}`,
                        content: entry.content,
                        keys: entry.key || [],
                        world: entry.world || 'Unknown',
                        isConstant: true
                    });
                    totalTokens += entryTokens;
                }
            }
        }

        // Then, add keyword-triggered entries
        for (const entry of keywordEntries) {
            if (triggeredEntries.length >= maxEntries) break;
            if (totalTokens >= maxTokens) break;

            // Skip entries without content
            if (!entry.content || !entry.content.trim()) continue;

            // Skip disabled entries
            if (entry.disable) continue;

            // Check probability (if useProbability is true)
            if (entry.useProbability && entry.probability < 100) {
                const roll = Math.random() * 100;
                if (roll > entry.probability) {
                    continue;
                }
            }

            // Check if entry matches keywords
            if (entryMatchesText(entry, chatText, caseSensitive, matchWholeWords, false)) {
                const entryTokens = Math.ceil((entry.content || '').length / 4);

                if (totalTokens + entryTokens <= maxTokens) {
                    triggeredEntries.push({
                        uid: entry.uid,
                        comment: entry.comment || `Entry ${entry.uid}`,
                        content: entry.content,
                        keys: entry.key || [],
                        world: entry.world || 'Unknown',
                        isConstant: false
                    });
                    totalTokens += entryTokens;
                }
            }
        }

        return { entries: triggeredEntries, totalTokens };

    } catch (error) {
        console.error('[ST-ImageGen] Error scanning lorebook:', error);
        return { entries: [], totalTokens: 0 };
    }
}

/**
 * Manually scan lorebook and display results in the UI
 */
export async function scanLorebookAndShowResults() {
    const previewEl = document.getElementById('st_imagegen_lorebook_preview');
    const countEl = document.getElementById('st_imagegen_lorebook_count');
    const entriesEl = document.getElementById('st_imagegen_lorebook_entries');

    if (!previewEl || !countEl || !entriesEl) {
        console.error('[ST-ImageGen] Lorebook preview elements not found');
        return;
    }

    // Show loading state
    entriesEl.innerHTML = '<div class="st-imagegen-lorebook-loading"><i class="fa-solid fa-spinner fa-spin"></i> Scanning...</div>';
    previewEl.style.display = 'block';

    try {
        const result = await getTriggeredLorebookEntries();

        countEl.textContent = result.entries.length;

        if (result.entries.length === 0) {
            entriesEl.innerHTML = '<div class="st-imagegen-lorebook-empty">No entries triggered. Check that lorebooks are active and keywords match recent messages.</div>';
        } else {
            let html = '';
            for (const entry of result.entries) {
                const keysStr = Array.isArray(entry.keys) ? entry.keys.slice(0, 3).join(', ') : '';
                const contentPreview = (entry.content || '').substring(0, 150) + ((entry.content || '').length > 150 ? '...' : '');
                html += `
                    <div class="st-imagegen-lorebook-entry">
                        <div class="st-imagegen-lorebook-entry-header">
                            <span class="st-imagegen-lorebook-entry-name">${entry.comment}</span>
                            ${keysStr ? `<span class="st-imagegen-lorebook-entry-keys">[${keysStr}]</span>` : ''}
                        </div>
                        <div class="st-imagegen-lorebook-entry-content">${contentPreview}</div>
                    </div>
                `;
            }
            html += `<div class="st-imagegen-lorebook-total">Total: ~${result.totalTokens} tokens</div>`;
            entriesEl.innerHTML = html;
        }

        toastr.info(`Found ${result.entries.length} triggered lorebook entries`, 'Lorebook Scan');

    } catch (error) {
        console.error('[ST-ImageGen] Error in lorebook scan:', error);
        entriesEl.innerHTML = `<div class="st-imagegen-lorebook-error">Error: ${error.message}</div>`;
        toastr.error('Failed to scan lorebook: ' + error.message, 'Lorebook Scan');
    }
}

/**
 * Build lorebook content string for inclusion in the image prompt
 * @returns {Promise<string>} The lorebook content to add to the prompt
 */
export async function buildLorebookPromptContent() {
    const settings = getSettings();

    if (!settings.lorebook.enabled || !settings.lorebook.includeInPrompt) {
        return '';
    }

    const result = await getTriggeredLorebookEntries();

    if (result.entries.length === 0) {
        return '';
    }

    // Build a formatted string of lorebook content
    const contentParts = result.entries.map(entry => {
        if (entry.comment && entry.comment !== 'Combined Lorebook Content') {
            return `[${entry.comment}]: ${entry.content}`;
        }
        return entry.content;
    });

    return contentParts.join('\n\n');
}
