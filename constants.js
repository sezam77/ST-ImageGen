/**
 * ST-ImageGen Constants and Configuration
 * Contains module name, model configurations, and default settings
 */

export const MODULE_NAME = 'st-imagegen';

// Model configurations with their specific parameters
export const MODEL_CONFIGS = Object.freeze({
    'z-image': {
        name: 'Z-Image',
        parameters: {
            size: { type: 'text', default: '1024x1024', placeholder: 'e.g., 1024x1024', label: 'Size' },
            aspectRatio: { type: 'text', default: '16:9', placeholder: 'e.g., 16:9, 1:1, 4:3', label: 'Aspect Ratio' }
        }
    },
    'nano-banana-pro': {
        name: 'Nano Banana Pro',
        parameters: {
            size: { type: 'text', default: '1024x1024', placeholder: 'e.g., 1024x1024', label: 'Size' },
            aspectRatio: { type: 'text', default: '1:1', placeholder: 'e.g., 16:9, 1:1, 4:3', label: 'Aspect Ratio' },
            resolution: { type: 'text', default: '1k', placeholder: 'e.g., 1k, 2k, 4k', label: 'Resolution' },
            image_urls: { type: 'textarea', maxItems: 8, placeholder: 'Enter image URLs, one per line (max 8)', label: 'Image URLs (optional)', optional: true }
        }
    },
    'seedream-4.5': {
        name: 'Seedream 4.5',
        parameters: {
            size: { type: 'text', default: '1024x1024', placeholder: 'e.g., 1024x1024', label: 'Size' },
            aspectRatio: { type: 'text', default: '1:1', placeholder: 'e.g., 16:9, 1:1, 4:3', label: 'Aspect Ratio' },
            quality: { type: 'select', options: ['basic', 'high'], default: 'basic', label: 'Quality' },
            image_urls: { type: 'textarea', maxItems: 14, placeholder: 'Enter image URLs, one per line (max 14)', label: 'Image URLs (optional)', optional: true }
        }
    },
    'firefrost': {
        name: 'Firefrost',
        parameters: {
            size: { type: 'text', default: '1024x1024', placeholder: 'e.g., 1024x1024', label: 'Size' },
            aspectRatio: { type: 'text', default: 'square_1_1', placeholder: 'e.g., square_1_1, landscape_16_9', label: 'Aspect Ratio' },
            resolution: { type: 'text', default: '4k', placeholder: 'e.g., 1k, 2k, 4k', label: 'Resolution' },
            image_urls: { type: 'textarea', maxItems: 8, placeholder: 'Enter image URLs, one per line', label: 'Image URLs (optional)', optional: true }
        }
    },
    'chroma': {
        name: 'Chroma',
        parameters: {
            resolution: { type: 'text', default: '1024x576', placeholder: 'e.g., 1024x576, 1024x1024', label: 'Resolution' },
            showExplicitContent: { type: 'checkbox', default: false, label: 'Show Explicit Content' },
            nImages: { type: 'number', default: 1, min: 1, max: 4, placeholder: '1-4', label: 'Number of Images' },
            seed: { type: 'text', default: '', placeholder: 'Optional seed value', label: 'Seed (optional)', optional: true },
            negative_prompt: { type: 'textarea', default: '', placeholder: 'What to avoid in the image', label: 'Negative Prompt (optional)', optional: true },
            guidance_scale: { type: 'number', default: 4.5, min: 1, max: 20, step: 0.5, placeholder: '1-20', label: 'Guidance Scale' },
            num_inference_steps: { type: 'number', default: 25, min: 1, max: 100, placeholder: '1-100', label: 'Inference Steps' }
        }
    },
    'qwen-image-2512': {
        name: 'Qwen Image 2512',
        parameters: {
            resolution: { type: 'text', default: '1024x1024', placeholder: 'e.g., 1024x1024, 512x512', label: 'Resolution' },
            showExplicitContent: { type: 'checkbox', default: false, label: 'Show Explicit Content' },
            nImages: { type: 'number', default: 1, min: 1, max: 4, placeholder: '1-4', label: 'Number of Images' },
            seed: { type: 'text', default: '', placeholder: 'Optional seed value', label: 'Seed (optional)', optional: true },
            output_format: { type: 'select', options: ['jpeg', 'png', 'webp'], default: 'jpeg', label: 'Output Format' }
        }
    },
    'qwen-image': {
        name: 'Qwen Image',
        parameters: {
            resolution: { type: 'text', default: '512x512', placeholder: 'e.g., 512x512, 1024x1024', label: 'Resolution' },
            showExplicitContent: { type: 'checkbox', default: false, label: 'Show Explicit Content' },
            nImages: { type: 'number', default: 1, min: 1, max: 4, placeholder: '1-4', label: 'Number of Images' },
            seed: { type: 'text', default: '', placeholder: 'Optional seed value', label: 'Seed (optional)', optional: true },
            negative_prompt: { type: 'textarea', default: '', placeholder: 'What to avoid in the image', label: 'Negative Prompt (optional)', optional: true },
            guidance_scale: { type: 'number', default: 4, min: 1, max: 20, step: 0.5, placeholder: '1-20', label: 'Guidance Scale' },
            num_inference_steps: { type: 'number', default: 23, min: 1, max: 100, placeholder: '1-100', label: 'Inference Steps' },
            enable_safety_checker: { type: 'checkbox', default: true, label: 'Enable Safety Checker' }
        }
    },
    'hidream': {
        name: 'HiDream',
        parameters: {
            resolution: { type: 'text', default: '1024x1024', placeholder: 'e.g., 1024x1024, 512x512', label: 'Resolution' },
            showExplicitContent: { type: 'checkbox', default: false, label: 'Show Explicit Content' },
            nImages: { type: 'number', default: 1, min: 1, max: 6, placeholder: '1-6', label: 'Number of Images' },
            guidance_scale: { type: 'number', default: 9.5, min: 1, max: 20, step: 0.5, placeholder: '1-20', label: 'Guidance Scale' },
            num_inference_steps: { type: 'number', default: 40, min: 1, max: 100, placeholder: '1-100', label: 'Inference Steps' }
        }
    },
    'custom': {
        name: 'Custom',
        parameters: {}
    }
});

export const defaultSettings = Object.freeze({
    enabled: true,
    mode: 'manual', // 'manual', 'auto', 'fullAuto'
    includeCharacterCard: true,
    includeUserPersona: false, // Include user persona description in prompt generation
    includeCharacterImage: false, // Include character avatar as reference image
    editPromptBeforeSending: false, // Show popup to edit prompt before sending to image API
    manualPromptMode: false, // Skip LLM generation, let user type prompt directly
    useSillyTavernApi: true, // Use SillyTavern's built-in API instead of custom endpoint
    // Lorebook settings
    lorebook: {
        enabled: false, // Enable lorebook keyword scanning
        includeInPrompt: true, // Include triggered lorebook content in the image prompt
        includeConstant: false, // Include constant (always-on) lorebook entries
        scanDepth: 5, // Number of recent messages to scan for keywords (0 = use global setting)
        maxEntries: 10, // Maximum number of lorebook entries to include
        maxTokens: 500, // Maximum tokens of lorebook content to include
    },
    textLlm: {
        apiUrl: '',
        apiKey: '',
        model: 'gpt-4',
        systemPrompt: `You are an image prompt generator. Transform the given roleplay message into a detailed image generation prompt.
Focus on visual elements: character appearance, setting, actions, mood, lighting.
Output ONLY the image prompt, no explanations or additional text.
Keep the prompt concise but descriptive, suitable for image generation AI.`,
        temperature: 0.7,
        maxTokens: 300,
        usePreset: false,           // Enable/disable preset injection
        uploadedPreset: null,       // Uploaded preset data: { name: string, prompts: array }
        postProcessing: 'none',     // Prompt post-processing mode: 'none', 'semi-strict', 'strict'
        usePrefill: false,          // Enable/disable prefill assistant message
        prefillContent: '',         // Content for the prefill assistant message
        enableReasoning: true,      // Enable reasoning/thinking for models that support it
        reasoningEffort: 'medium',  // Reasoning effort level: 'low', 'medium', 'high'
    },
    imageGen: {
        apiUrl: '',
        apiKey: '',
        model: 'seedream-4.5',
        customModelName: '', // Custom model name when 'custom' is selected
        useChatCompletions: false, // Use /v1/chat/completions format instead of /v1/images/generations
        // Model-specific parameters stored here
        modelParams: {
            'z-image': { size: '1024x1024', aspectRatio: '16:9' },
            'nano-banana-pro': { size: '1024x1024', aspectRatio: '1:1', resolution: '1k', image_urls: '' },
            'seedream-4.5': { size: '1024x1024', aspectRatio: '1:1', quality: 'basic', image_urls: '' },
            'firefrost': { size: '1024x1024', aspectRatio: 'square_1_1', resolution: '4k', image_urls: '' },
            'chroma': { resolution: '1024x576', showExplicitContent: false, nImages: 1, seed: '', negative_prompt: '', guidance_scale: 4.5, num_inference_steps: 25 },
            'qwen-image-2512': { resolution: '1024x1024', showExplicitContent: false, nImages: 1, seed: '', output_format: 'jpeg' },
            'qwen-image': { resolution: '512x512', showExplicitContent: false, nImages: 1, seed: '', negative_prompt: '', guidance_scale: 4, num_inference_steps: 23, enable_safety_checker: true },
            'hidream': { resolution: '1024x1024', showExplicitContent: false, nImages: 1, guidance_scale: 9.5, num_inference_steps: 40 }
        },
        n: 1,
        responseFormat: 'b64_json',
        sse: true,
    },
});
