
import React, { useState, useCallback, useRef, useEffect, ChangeEvent, DragEvent, ClipboardEvent } from 'react';
import { 
    Image as ImageIcon, 
    UploadCloud, 
    FileJson, 
    Sparkles, 
    Wand2, 
    Download, 
    Maximize, 
    Edit, 
    X, 
    ChevronDown, 
    Loader, 
    Check, 
    AlertCircle,
    Copy,
    Trash2,
    FileText
} from 'lucide-react';
import JSZip from 'jszip';
import piexif from 'piexifjs';
import { GoogleGenAI, Type } from "@google/genai";

// --- SETUP ---
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });

// --- TYPES & CONSTANTS ---
const CATEGORIES: Record<string, string> = {
    "1": "Animals",
    "2": "Buildings and Architecture",
    "3": "Business",
    "4": "Drinks",
    "5": "The Environment",
    "6": "States of Mind",
    "7": "Food",
    "8": "Graphic Resources",
    "9": "Hobbies and Leisure",
    "10": "Industry",
    "11": "Landscapes",
    "12": "Lifestyle",
    "13": "People",
    "14": "Plants and Flowers",
    "15": "Culture and Religion",
    "16": "Science",
    "17": "Social Issues",
    "18": "Sports",
    "19": "Technology",
    "20": "Transport",
    "21": "Travel"
};

const CATEGORY_PROMPT_LIST = Object.entries(CATEGORIES).map(([id, name]) => `${id}. ${name}`).join('\n');


type UpscaleInfo = {
  upscaled_url: string;
  original_filename: string;
  upscaled_filename: string;
  file_size?: number;
};

type CardData = {
  id: string;
  imageUrl: string;
  title: string;
  author: string;
  prompt: string;
  description: string;
  keywords: string[];
  isUpscaled: boolean;
  upscaleFactor?: 2 | 4;
  aspectRatio: string;
  category: number;
  upscaleInfo?: UpscaleInfo;
};

type EnhancedMeta = {
  enhanced_prompt: string;
  title: string;
  description: string;
  keywords: string[];
  category: number;
};

type ToastMessage = {
    id: number;
    message: string;
    type: 'info' | 'success' | 'error';
};

const UPSCALE_API_URL = "https://semenjana.biz.id/multiapi/auto_upscaler.php";

const enhancerSchema = {
  type: Type.OBJECT,
  properties: {
    enhanced_prompt: { type: Type.STRING, description: "A very detailed, specific, and creative prompt for image generation, including subject, composition, lighting, style, and negative prompts." },
    title: { type: Type.STRING, description: "An SEO-friendly title under 70 characters, without brand names or special characters." },
    description: { type: Type.STRING, description: "A concise, human-readable description of the image content (1-2 sentences), suitable for captions or alt-text." },
    keywords: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Exactly 49 English keywords, with the 10 most important first, excluding brand names." },
    category: { type: Type.INTEGER, description: "The most relevant category ID number from the provided list." }
  },
  required: ["enhanced_prompt", "title", "description", "keywords", "category"]
};

const metadataOnlySchema = {
    type: Type.OBJECT,
    properties: {
      title: { type: Type.STRING, description: "An SEO-friendly title under 70 characters, without brand names or special characters, based on the prompt." },
      description: { type: Type.STRING, description: "A concise, human-readable description of the image content (1-2 sentences), suitable for captions or alt-text." },
      keywords: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Exactly 49 English keywords, with the 10 most important first, excluding brand names, based on the prompt." },
      category: { type: Type.INTEGER, description: "The most relevant category ID number from the provided list." }
    },
    required: ["title", "description", "keywords", "category"]
};


const nicheInspirations = [
    "Futuristic Cityscape", "Enchanted Forest", "Cyberpunk Alley", "Steampunk Animal",
    "Watercolor Portrait", "Abstract Emotions", "Minimalist Landscape", "Vintage Robot",
    "Gothic Architecture", "Cosmic Horror"
];

const ASPECT_RATIOS = ["1:1", "16:9", "9:16", "4:3", "3:2"];
const IMAGEN_MODELS = ["imagen-3.0-generate-002","imagen-4.0-generate-001","imagen-4.0-ultra-generate-001","imagen-4.0-fast-generate-001"];
const GEMINI_TEXT_MODELS = ['gemini-2.5-flash', 'gemini-2.5-pro']; // Primary and fallback models

// --- HELPER COMPONENTS (defined outside main component to prevent re-creation) ---

interface ToastProps {
    toast: ToastMessage | null;
    onDismiss: () => void;
}
const Toast: React.FC<ToastProps> = ({ toast, onDismiss }) => {
    useEffect(() => {
        if (toast) {
            const timer = setTimeout(onDismiss, 5000);
            return () => clearTimeout(timer);
        }
    }, [toast, onDismiss]);

    if (!toast) return null;

    const bgColor = {
        info: 'bg-blue-500/90',
        success: 'bg-green-500/90',
        error: 'bg-red-500/90',
    }[toast.type];

    const Icon = {
        info: <AlertCircle className="w-5 h-5" />,
        success: <Check className="w-5 h-5" />,
        error: <AlertCircle className="w-5 h-5" />,
    }[toast.type];

    return (
        <div className={`fixed top-5 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 p-4 rounded-lg text-white shadow-lg animate-fade-in-down ${bgColor}`}>
            {Icon}
            <span>{toast.message}</span>
            <button onClick={onDismiss} className="p-1 -mr-2 rounded-full hover:bg-white/20">
                <X className="w-4 h-4" />
            </button>
        </div>
    );
};


// --- MAIN COMPONENT ---
export default function ImageCreator() {
    // STATE
    const [activeTab, setActiveTab] = useState<'single' | 'batch'>('single');
    const [prompt, setPrompt] = useState('');
    const [batchInput, setBatchInput] = useState('');
    const [uploadedImage, setUploadedImage] = useState<string | null>(null);
    const [aspectRatio, setAspectRatio] = useState('16:9');
    const [model, setModel] = useState(IMAGEN_MODELS[0]);
    const [sampleCount, setSampleCount] = useState(1);
    const [autoUpscale, setAutoUpscale] = useState(false);
    const [upscaleFactor, setUpscaleFactor] = useState<2 | 4>(4);
    const [fileFormat, setFileFormat] = useState<'jpg' | 'png'>('jpg');
    
    const [cards, setCards] = useState<Map<string, CardData>>(new Map());
    const [selected, setSelected] = useState<Set<string>>(new Set());
    
    const [isGenerating, setIsGenerating] = useState(false);
    const [isEnhancing, setIsEnhancing] = useState(false);
    const [isUpscaling, setIsUpscaling] = useState<Record<string, { attempt: number } | boolean>>({});
    const [isBatchUpscaling, setIsBatchUpscaling] = useState(false);
    
    const [toast, setToast] = useState<ToastMessage | null>(null);
    const [tempEnhanced, setTempEnhanced] = useState<EnhancedMeta | null>(null);
    
    const [modal, setModal] = useState<{ type: 'preview' | 'metadata'; cardId: string | null }>({ type: 'preview', cardId: null });
    const [metadataEdit, setMetadataEdit] = useState<{ title: string; author: string; category: number }>({ title: '', author: '', category: 8 });
    const [modelBlacklist, setModelBlacklist] = useState<Map<string, number>>(new Map());
    const [imagenModelBlacklist, setImagenModelBlacklist] = useState<Map<string, number>>(new Map());

    // Batch Auto-Gen State
    const [autoGenTheme, setAutoGenTheme] = useState('');
    const [autoGenCount, setAutoGenCount] = useState(5);
    const [isBatchGeneratingPrompts, setIsBatchGeneratingPrompts] = useState(false);


    const fileInputRef = useRef<HTMLInputElement>(null);
    const batchPromptCount = batchInput.split('\n').filter(p => p.trim()).length;

    // --- UTILS ---
    const showToast = useCallback((message: string, type: 'info' | 'success' | 'error' = 'info') => {
        setToast({ id: Date.now(), message, type });
    }, []);

    const createSeoFilename = (title: string): string => {
        return title
            .replace(/\s*\(4x\s*upscaled\)/gi, '')
            .toLowerCase()
            .replace(/\s+/g, '-')
            .replace(/[^a-z0-9-]/g, '')
            .replace(/--+/g, '-')
            .replace(/^-|-$/g, '')
            .trim();
    };

    const imageUrlToDataUrl = useCallback(async (url: string): Promise<string> => {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Network response was not ok.');
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }, []);
    
    const convertPngToJpg = (dataUrl: string): Promise<string> => {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.fillStyle = '#FFFFFF';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    ctx.drawImage(img, 0, 0);
                    resolve(canvas.toDataURL('image/jpeg', 1.0)); // Use 1.0 for max quality
                } else {
                    reject(new Error('Could not get canvas context for image conversion.'));
                }
            };
            img.onerror = () => {
                reject(new Error('Image failed to load for conversion.'));
            };
            img.src = dataUrl;
        });
    };
    
    const createExifData = (card: CardData): string => {
        const zeroth: { [key: number]: any } = {};
        const exif: { [key: number]: any } = {};
        const gps: { [key: number]: any } = {};
        
        zeroth[piexif.ImageIFD.ImageDescription] = card.title;
        zeroth[piexif.ImageIFD.Artist] = card.author;
        zeroth[piexif.ImageIFD.Software] = "IMAGE CREATOR BY firdausokeh";
        zeroth[piexif.ImageIFD.DateTime] = new Date().toISOString().slice(0, 19).replace('T', ' ');
        zeroth[piexif.ImageIFD.Copyright] = `Copyright (c) ${new Date().getFullYear()} ${card.author}. All rights reserved.`;

        // UNICODE UserComment
        const commentPrefix = [0x55, 0x4E, 0x49, 0x43, 0x4F, 0x44, 0x45, 0x00]; // "UNICODE\0"
        const commentChars = Array.from(card.prompt).flatMap(c => {
            const code = c.charCodeAt(0);
            return [code & 0xff, code >> 8];
        });
        exif[piexif.ExifIFD.UserComment] = [...commentPrefix, ...commentChars];

        const exifObj = { "0th": zeroth, "Exif": exif, "GPS": gps };
        return piexif.dump(exifObj);
    };

    // --- API CALLS ---
    const callApiWithRetry = useCallback(async <T,>(
        apiCall: () => Promise<T>, 
        retries = 3, 
        delay = 2000
    ): Promise<T> => {
        for (let i = 0; i < retries; i++) {
            try {
                return await apiCall();
            } catch (error: any) {
                const errorMessage = (error?.message || '').toLowerCase();
                const errorString = error.toString();
                const isRateLimitError = errorString.includes("429") || errorMessage.includes('rate limit') || errorMessage.includes('resource_exhausted') || errorMessage.includes('quota');
    
                if (isRateLimitError && i < retries - 1) {
                    const backoffDelay = delay * Math.pow(2, i);
                    console.log(`Rate limit hit. Retrying in ${Math.round(backoffDelay / 1000)}s...`);
                    await new Promise(res => setTimeout(res, backoffDelay));
                } else {
                    throw error;
                }
            }
        }
        throw new Error('API call failed after multiple retries.');
    }, []);

    const fetchWithRetry = useCallback(async (url: string, options: RequestInit, retries = 3, delay = 1000): Promise<Response> => {
        for (let i = 0; i < retries; i++) {
            try {
                const response = await fetch(url, options);
                if (response.status === 429) { // Too Many Requests
                    console.log(`Rate limited on fetch. Retrying in ${delay / 1000}s... (Attempt ${i + 1})`);
                    await new Promise(res => setTimeout(res, delay * (i + 1))); // Exponential backoff
                    continue;
                }
                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
                }
                return response;
            } catch (error) {
                if (i === retries - 1) throw error;
            }
        }
        throw new Error('All retries failed.');
    }, []);

    const callGeminiApi = useCallback(async (userPrompt: string, schema?: object, multimodal?: { mimeType: string, dataUrl: string } | null) => {
        if (!process.env.API_KEY) {
            showToast("Google Generative AI API key is missing.", 'error');
            throw new Error("API key missing");
        }
    
        const availableModels = GEMINI_TEXT_MODELS.filter(model => {
            const expiry = modelBlacklist.get(model);
            return !expiry || Date.now() > expiry;
        });

        if (availableModels.length === 0) {
            showToast("All AI models are temporarily on cooldown. Please wait a moment.", 'error');
            throw new Error("All models are on cooldown.");
        }

        const parts: any[] = [];
        if (multimodal) {
            parts.push({
                inlineData: {
                    mimeType: multimodal.mimeType,
                    data: multimodal.dataUrl.split(',')[1]
                }
            });
        }
        parts.push({ text: userPrompt });
    
        let lastError: any;

        for (const model of availableModels) {
            const apiCall = () => ai.models.generateContent({
                model: model,
                contents: { parts },
                config: schema ? {
                    responseMimeType: "application/json",
                    responseSchema: schema,
                } : undefined,
            });

            try {
                const response = await callApiWithRetry(apiCall, 2, 1500);
                const text = response.text;
                if (text === undefined) {
                     throw new Error("Invalid response structure from Gemini API.");
                }

                if (model !== GEMINI_TEXT_MODELS[0]) {
                    showToast(`Successfully used fallback model: ${model}`, 'success');
                }
                
                return text;
            } catch (error) {
                lastError = error;
                const errorMessage = (error?.message || '').toLowerCase();
                const errorString = error.toString();
                const isRateLimitError = errorString.includes("429") || errorMessage.includes('rate limit') || errorMessage.includes('resource_exhausted') || errorMessage.includes('quota');
    
                if (isRateLimitError) {
                    const expiryTime = Date.now() + 60 * 1000; // 1 minute cooldown
                    setModelBlacklist(prev => new Map(prev).set(model, expiryTime));

                    const isLastAvailableModel = availableModels.indexOf(model) === availableModels.length - 1;
                    if (!isLastAvailableModel) {
                        console.warn(`Model ${model} is busy, blacklisted for 1 min. Trying fallback...`);
                        showToast(`Model ${model} is busy. Trying fallback...`, 'info');
                    } else {
                        showToast(`Model ${model} is on cooldown. No more fallbacks available.`, 'error');
                    }
                } else {
                    console.error(`Gemini API call failed for model ${model} with a non-retriable error:`, error);
                    const message = error instanceof Error ? error.message : "An unknown error occurred";
                    showToast(`Gemini API error: ${message}`, 'error');
                    throw error;
                }
            }
        }
        
        const finalMessage = lastError instanceof Error ? lastError.message : "Unknown API error.";
        showToast(`All available models are busy. Please try again later.`, 'error');
        throw new Error(`All available models failed. Last error: ${finalMessage}`);

    }, [showToast, callApiWithRetry, modelBlacklist, setModelBlacklist]);
    
    const generateImagesForPrompt = useCallback(async (userPrompt: string, count: number) => {
        if (!process.env.API_KEY) {
            showToast("Google Generative AI API key is missing.", 'error');
            throw new Error("API key missing");
        }
    
        // Prioritize the user-selected model, then the rest
        const prioritizedModels = [model, ...IMAGEN_MODELS.filter(m => m !== model)];
        
        const availableModels = prioritizedModels.filter(m => {
            const expiry = imagenModelBlacklist.get(m);
            return !expiry || Date.now() > expiry;
        });
    
        if (availableModels.length === 0) {
            showToast("All image generation models are temporarily on cooldown. Please wait a moment.", 'error');
            throw new Error("All image models are on cooldown.");
        }
    
        let lastError: any;
    
        for (const currentModel of availableModels) {
            const apiCall = () => {
                const config: {
                    numberOfImages: number;
                    aspectRatio: string;
                    imageSize?: string;
                } = {
                    numberOfImages: count,
                    aspectRatio: aspectRatio,
                };
        
                if (currentModel === "imagen-4.0-generate-001" || currentModel === "imagen-4.0-ultra-generate-001") {
                    config.imageSize = "2K";
                }
    
                return ai.models.generateImages({
                    model: currentModel,
                    prompt: userPrompt + " High quality, sharp details, max resolution.",
                    config,
                });
            };
    
            try {
                const response = await callApiWithRetry(apiCall);
                
                if (currentModel !== model) {
                    showToast(`Successfully used fallback image model: ${currentModel}`, 'success');
                }
    
                return response.generatedImages.map(img => ({
                    bytesBase64Encoded: img.image.imageBytes
                }));
            } catch (error) {
                lastError = error;
                const errorMessage = (error?.message || '').toLowerCase();
                const errorString = error.toString();
                const isRateLimitError = errorString.includes("429") || errorMessage.includes('rate limit') || errorMessage.includes('resource_exhausted') || errorMessage.includes('quota');
    
                if (isRateLimitError) {
                    const expiryTime = Date.now() + 60 * 1000; // 1 min cooldown
                    setImagenModelBlacklist(prev => new Map(prev).set(currentModel, expiryTime));
    
                    const isLastAvailableModel = availableModels.indexOf(currentModel) === availableModels.length - 1;
                    if (!isLastAvailableModel) {
                        console.warn(`Imagen model ${currentModel} is busy, blacklisted for 1 min. Trying fallback...`);
                        showToast(`Image model ${currentModel} is busy. Trying fallback...`, 'info');
                    } else {
                        showToast(`Image model ${currentModel} is on cooldown. No more fallbacks.`, 'error');
                    }
                } else {
                    console.error(`Imagen API call failed for model ${currentModel} with a non-retriable error:`, error);
                    const message = error instanceof Error ? error.message : "An unknown error occurred";
                    showToast(`Imagen API error: ${message}`, 'error');
                    throw error; // Re-throw non-retriable error
                }
            }
        }
        
        const finalMessage = lastError instanceof Error ? lastError.message : "Unknown API error.";
        showToast(`All available image models are busy. Please try again later.`, 'error');
        throw new Error(`All available image models failed. Last error: ${finalMessage}`);
    
    }, [model, aspectRatio, showToast, callApiWithRetry, imagenModelBlacklist, setImagenModelBlacklist]);
    
    const upscaleImage = useCallback(async (imageDataUrl: string, originalFilename: string, scale: 2 | 4) => {
        const imageBlob = await (await fetch(imageDataUrl)).blob();
        const formData = new FormData();
        formData.append('image', imageBlob, originalFilename);
        formData.append('scale', scale.toString());

        try {
            const response = await fetchWithRetry(UPSCALE_API_URL, {
                method: 'POST',
                body: formData,
            }, 3, 2000);
            const data = await response.json();
            if (!data.success || !data.upscaled_file?.download_url) {
                throw new Error(data.message || 'Upscale failed');
            }
            return {
                upscaled_url: data.upscaled_file.download_url,
                original_filename: originalFilename,
                upscaled_filename: data.upscaled_file.filename,
                file_size: data.upscaled_file.size,
            };
        } catch (error) {
             console.error("Upscale API call failed:", error);
            showToast(`Upscale error: ${(error as Error).message}`, 'error');
            throw error;
        }
    }, [fetchWithRetry, showToast]);


    // --- HANDLERS ---
    const handleEnhancePrompt = useCallback(async () => {
        if (!prompt.trim()) {
            showToast("Prompt cannot be empty.", 'error');
            return;
        }
        setIsEnhancing(true);
        try {
            const enhancerPrompt = `
                You are a world-class prompt engineer for generative AI. Based on the user's prompt, create a fully enhanced, highly detailed prompt. Also provide an SEO-friendly title, a concise description, exactly 49 relevant keywords, and select a category.

                Available categories:
                ${CATEGORY_PROMPT_LIST}

                User Prompt: "${prompt}"

                Follow these strict instructions:
                1.  **Enhanced Prompt:** Create a super specific and descriptive prompt. Mention subject, composition details (e.g., rule of thirds, leading lines), camera lens (e.g., 35mm, 85mm f/1.4), lighting (e.g., golden hour, cinematic lighting), and artistic style (e.g., photorealistic, impressionistic, cyberpunk). ALWAYS append this exact negative prompt at the end: "Negative: no watermark, no logo, no brand, no text, no copyrighted characters, no extra fingers, no distortions."
                2.  **Title:** Create an SEO-friendly title, under 70 characters. Do not include brand names or special characters.
                3.  **Description:** Create a concise, human-readable description (1-2 sentences) for the image, suitable for a caption or alt-text.
                4.  **Keywords:** Provide exactly 49 comma-separated keywords in English. The first 10 should be the most important. Do not include brand names or copyrighted terms.
                5.  **Category:** Choose the single most relevant category ID number from the list above based on the prompt.
            `;
            const responseText = await callGeminiApi(enhancerPrompt, enhancerSchema);
            const enhancedData: EnhancedMeta = JSON.parse(responseText);
            
            if (enhancedData.keywords.length !== 49) {
                console.warn("Gemini did not return exactly 49 keywords. It returned:", enhancedData.keywords.length);
            }

            setTempEnhanced(enhancedData);
            setPrompt(enhancedData.enhanced_prompt);
            showToast("Prompt enhanced successfully!", 'success');
        } catch (error) {
            // Error is already shown by callGeminiApi
        } finally {
            setIsEnhancing(false);
        }
    }, [prompt, callGeminiApi, showToast]);
    
    const handleSurpriseMe = useCallback(async () => {
        setIsEnhancing(true);
        try {
            const surprisePrompt = "Generate one unique, creative, and visually interesting image generation prompt. Just the prompt text, nothing else.";
            const newPrompt = await callGeminiApi(surprisePrompt);
            setPrompt(newPrompt.trim().replace(/"/g, ''));
            setTempEnhanced(null);
            showToast("Here's a surprise prompt!", 'info');
        } catch (error) {
            // Error is already shown
        } finally {
            setIsEnhancing(false);
        }
    }, [callGeminiApi, showToast]);

    const handleAutoMetadata = useCallback(async (cardId: string, originalPrompt: string) => {
        let meta: { title: string, description: string, keywords: string[], category: number } | null = null;
    
        if (tempEnhanced) {
            meta = { ...tempEnhanced };
        } else {
            try {
                const metadataPrompt = `
                    You are an expert in SEO and image metadata. Analyze the following image generation prompt and generate the required metadata in JSON format.

                    **Prompt to Analyze:**
                    "${originalPrompt}"

                    **Instructions:**
                    1.  **Title:** Create a compelling, SEO-friendly title. It must be under 70 characters and should not contain brand names or special characters.
                    2.  **Description:** Write a concise, human-readable description of the *resulting image* (not the prompt itself). This should be 1-2 sentences long, perfect for a caption or alt-text.
                    3.  **Keywords:** Generate exactly 49 relevant English keywords. The first 10 should be the most important. Do not use brand names.
                    4.  **Category:** Select the single most relevant category ID from the provided list.

                    **Available Categories:**
                    ${CATEGORY_PROMPT_LIST}
                `;
                const responseText = await callGeminiApi(metadataPrompt, metadataOnlySchema);
                meta = JSON.parse(responseText);
            } catch (error) {
                console.error("Auto-metadata failed:", error);
                showToast("AI metadata generation failed, using fallback.", "error");
            }
        }
    
        setCards(prev => {
            const newCards = new Map(prev);
            const card = newCards.get(cardId);
            if (card) {
                const fallbackTitle = originalPrompt.substring(0, 65) + (originalPrompt.length > 65 ? '...' : '');
                card.title = meta?.title || fallbackTitle;
                card.description = meta?.description || fallbackTitle;
                card.keywords = meta?.keywords || [];
                card.category = meta?.category || 8;
                newCards.set(cardId, { ...card });
            }
            return newCards;
        });
    }, [callGeminiApi, showToast, tempEnhanced]);


    const handleUpscale = useCallback(async (card: CardData) => {
        if (!card || card.isUpscaled) return;

        setIsUpscaling(prev => ({ ...prev, [card.id]: { attempt: 1 } }));

        for (let i = 1; i <= 3; i++) {
            try {
                const originalFilename = createSeoFilename(card.title) + '.png';
                const upscaleInfo = await upscaleImage(card.imageUrl, originalFilename, upscaleFactor);

                setCards(prev => {
                    const newCards = new Map(prev);
                    const currentCard = newCards.get(card.id);
                    if (currentCard) {
                        newCards.set(card.id, {
                            ...currentCard,
                            imageUrl: upscaleInfo.upscaled_url,
                            isUpscaled: true,
                            upscaleFactor: upscaleFactor,
                            upscaleInfo,
                        });
                    }
                    return newCards;
                });
                setIsUpscaling(prev => ({ ...prev, [card.id]: false }));
                showToast(`Image "${card.title}" upscaled successfully!`, 'success');
                return; // Exit loop on success
            } catch (error) {
                if (i < 3) {
                     setIsUpscaling(prev => ({ ...prev, [card.id]: { attempt: i + 1 } }));
                } else {
                     setIsUpscaling(prev => ({ ...prev, [card.id]: false }));
                    showToast(`Failed to upscale "${card.title}" after 3 attempts.`, 'error');
                    throw error; // Throw error to be caught by batch handler
                }
            }
        }
    }, [upscaleImage, showToast, upscaleFactor]);

    const handleBatchUpscale = useCallback(async () => {
        const cardsToUpscale = Array.from(selected)
            .map(id => cards.get(id)!)
            .filter(card => card && !card.isUpscaled);

        if (cardsToUpscale.length === 0) {
            showToast("No un-upscaled images selected.", 'info');
            return;
        }

        setIsBatchUpscaling(true);
        showToast(`Starting batch upscale for ${cardsToUpscale.length} images...`, 'info');

        const chunkSize = 5;
        let successfulCount = 0;

        for (let i = 0; i < cardsToUpscale.length; i += chunkSize) {
            const chunk = cardsToUpscale.slice(i, i + chunkSize);
            const chunkNumber = i / chunkSize + 1;
            const totalChunks = Math.ceil(cardsToUpscale.length / chunkSize);

            showToast(`Upscaling batch ${chunkNumber}/${totalChunks}...`, 'info');

            const results = await Promise.allSettled(chunk.map(card => handleUpscale(card)));

            results.forEach(result => {
                if (result.status === 'fulfilled') {
                    successfulCount++;
                }
            });
        }

        showToast(`Batch upscale finished. ${successfulCount}/${cardsToUpscale.length} successful.`, successfulCount === cardsToUpscale.length ? 'success' : 'info');
        setIsBatchUpscaling(false);

    }, [selected, cards, handleUpscale, showToast]);


    const handleGenerate = useCallback(async () => {
        const promptsToProcess = activeTab === 'single' 
            ? [{ prompt: prompt.trim() }] 
            : batchInput.split('\n').map(p => p.trim()).filter(Boolean).map(p => ({ prompt: p }));

        if (promptsToProcess.length === 0 || promptsToProcess.every(p => !p.prompt)) {
            showToast("Please provide at least one valid prompt.", "error");
            return;
        }

        setIsGenerating(true);
        setTempEnhanced(null); // Reset after use
        const generatedCards: CardData[] = [];

        for (const p of promptsToProcess) {
            try {
                const predictions = await generateImagesForPrompt(p.prompt, sampleCount);
                const newCards: [string, CardData][] = predictions.map((pred: any, i: number) => {
                    const id = `${Date.now()}-${i}`;
                    const cardData: CardData = {
                        id,
                        imageUrl: `data:image/png;base64,${pred.bytesBase64Encoded}`,
                        title: `Generated Image ${cards.size + i + 1}`,
                        author: 'firdausokeh',
                        prompt: p.prompt,
                        description: '',
                        keywords: [],
                        isUpscaled: false,
                        aspectRatio: aspectRatio,
                        category: 8,
                    };
                    generatedCards.push(cardData);
                    return [id, cardData];
                });

                setCards(prev => new Map([...prev.entries(), ...newCards]));
                showToast(`Generated ${newCards.length} image(s) for prompt.`, 'success');

                // Auto-metadata for new cards
                for (const [id, card] of newCards) {
                    await handleAutoMetadata(id, card.prompt);
                }

            } catch (error) {
                // Error toast is shown in generateImagesForPrompt
            }
        }
        
        setIsGenerating(false);

        if (autoUpscale && generatedCards.length > 0) {
            showToast(`Auto-upscaling ${generatedCards.length} new images...`, 'info');
            // Use the new batch upscaler for auto-upscaling too
            const generatedCardIds = new Set(generatedCards.map(c => c.id));
            const cardsToUpscale = generatedCards.filter(card => generatedCardIds.has(card.id) && !card.isUpscaled);
            
            const chunkSize = 5;
            for (let i = 0; i < cardsToUpscale.length; i += chunkSize) {
                const chunk = cardsToUpscale.slice(i, i + chunkSize);
                await Promise.allSettled(chunk.map(card => handleUpscale(card)));
            }

            showToast('Auto-upscaling complete.', 'success');
        }

    }, [activeTab, prompt, batchInput, sampleCount, generateImagesForPrompt, cards.size, showToast, handleAutoMetadata, autoUpscale, aspectRatio, handleUpscale]);
    
    const handleDownloadImage = useCallback(async (card: CardData, format: "jpg" | "png") => {
        try {
            const isExternalUrl = card.imageUrl.startsWith('http');
            let dataUrl = card.imageUrl;

            if (isExternalUrl) {
                try {
                    dataUrl = await imageUrlToDataUrl(card.imageUrl);
                } catch (corsError) {
                    showToast("CORS error. Opening image in new tab for manual download.", 'error');
                    const link = document.createElement('a');
                    link.href = card.imageUrl;
                    link.target = '_blank';
                    link.download = createSeoFilename(card.title) + `.${format}`;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    return;
                }
            }
            
            let finalDataUrl = dataUrl;
            let filename = createSeoFilename(card.title);
            
            if (format === 'jpg') {
                filename += ".jpg";
                try {
                    const jpgDataUrl = await convertPngToJpg(dataUrl);
                    const exifStr = createExifData(card);
                    finalDataUrl = piexif.insert(exifStr, jpgDataUrl);
                } catch (conversionError) {
                    console.error("JPG Conversion failed:", conversionError);
                    showToast('Failed to convert to JPG, downloading as PNG instead.', 'error');
                    filename = createSeoFilename(card.title) + '.png';
                    finalDataUrl = dataUrl;
                }
            } else {
                filename += ".png";
            }
            
            const link = document.createElement('a');
            link.href = finalDataUrl;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

        } catch (error) {
            showToast(`Download failed: ${(error as Error).message}`, 'error');
        }
    }, [showToast, imageUrlToDataUrl]);
    
    const handleDownloadZip = useCallback(async (type: 'all' | 'selected') => {
        const cardsToZip = type === 'all' ? Array.from(cards.values()) : Array.from(selected).map(id => cards.get(id)!).filter(Boolean);
        if (cardsToZip.length === 0) {
            showToast("No images to download.", 'info');
            return;
        }

        showToast(`Zipping ${cardsToZip.length} images... This may take a moment.`, 'info');
        const zip = new JSZip();
        let skipped = 0;
        let conversionFailed = 0;

        for (const card of cardsToZip) {
            try {
                let dataUrl = card.imageUrl;
                if (card.imageUrl.startsWith('http')) {
                    try {
                        dataUrl = await imageUrlToDataUrl(card.imageUrl);
                    } catch (corsError) {
                        console.warn(`Skipping ${card.title} due to CORS error.`);
                        skipped++;
                        continue;
                    }
                }
                
                let filename = createSeoFilename(card.title);
                let finalDataUrl = dataUrl;

                if (fileFormat === 'jpg') {
                    try {
                        const jpgDataUrl = await convertPngToJpg(dataUrl);
                        const exifStr = createExifData(card);
                        finalDataUrl = piexif.insert(exifStr, jpgDataUrl);
                        filename += '.jpg';
                    } catch (conversionError) {
                        console.warn(`JPG conversion failed for ${card.title}, adding as PNG.`);
                        conversionFailed++;
                        finalDataUrl = dataUrl;
                        filename += '.png';
                    }
                } else {
                    filename += '.png';
                }
                
                const blob = await (await fetch(finalDataUrl)).blob();
                zip.file(filename, blob);

            } catch (error) {
                console.error(`Failed to process ${card.title} for ZIP:`, error);
                skipped++;
            }
        }
        
        if (skipped > 0) {
            showToast(`Skipped ${skipped} files due to errors (e.g., CORS).`, 'error');
        }
        if (conversionFailed > 0) {
            showToast(`${conversionFailed} files failed JPG conversion and were zipped as PNGs.`, 'info');
        }

        const content = await zip.generateAsync({ type: "blob" });
        const timestamp = Date.now();
        const link = document.createElement('a');
        link.href = URL.createObjectURL(content);
        link.download = `image_${timestamp}.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
        
        showToast("ZIP download started.", 'success');

    }, [cards, selected, imageUrlToDataUrl, showToast, fileFormat]);

    const handleDownloadCsv = useCallback(() => {
        const cardsToExport = Array.from(cards.values());
        if (cardsToExport.length === 0) {
            showToast("No data to export.", 'info');
            return;
        }
    
        const formatCsvField = (input: string) => {
            const cleaned = (input || '').trim().replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ');
            const escaped = cleaned.replace(/"/g, '""');
            return `"${escaped}"`;
        };
    
        const header = "Filename,Title,Keywords,Description,Category\n";
        const processedFilenames = new Set<string>();

        const rows = cardsToExport.reduce<string[]>((acc, card) => {
            const filename = createSeoFilename(card.title);
            const fullFilenameWithExt = `${filename}.${fileFormat}`;

            // Prevent duplicates based on the generated filename
            if (processedFilenames.has(filename)) {
                return acc;
            }
            processedFilenames.add(filename);
            
            const title = formatCsvField(card.title);
            const keywords = formatCsvField(card.keywords.map(k => k.trim()).filter(Boolean).join(', '));
            const description = formatCsvField(card.description);
            const categoryId = card.category; // Use the numeric ID directly

            acc.push([`"${fullFilenameWithExt}"`, title, keywords, description, categoryId].join(','));
            return acc;
        }, []);

        if (rows.length === 0) {
            showToast("No unique data to export.", 'info');
            return;
        }
    
        const csvContent = header + rows.join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        const timestamp = Date.now();
        link.download = `metadata_${timestamp}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
    }, [cards, showToast, fileFormat]);
    
    const handleImageDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (event) => setUploadedImage(event.target?.result as string);
            reader.readAsDataURL(file);
        }
    }, []);
    
    const handleImagePaste = useCallback((e: ClipboardEvent<HTMLTextAreaElement>) => {
        const item = Array.from(e.clipboardData.items).find(i => i.type.startsWith('image/'));
        if (item) {
            const file = item.getAsFile();
            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => setUploadedImage(event.target?.result as string);
                reader.readAsDataURL(file);
            }
        }
    }, []);
    
    const handleCreatePromptFromImage = useCallback(async () => {
        if (!uploadedImage) return;
        setIsEnhancing(true);
        try {
            const mimeType = uploadedImage.match(/data:(.*);base64,/)?.[1] || 'image/jpeg';
            const userPrompt = "Describe this image in detail to create a prompt for an image generator. Focus on subject, composition, colors, lighting, and style.";
            const newPrompt = await callGeminiApi(userPrompt, undefined, { mimeType, dataUrl: uploadedImage });
            setPrompt(newPrompt);
            showToast("Prompt created from image!", 'success');
        } catch(error) {
            // Toast shown in API call
        } finally {
            setIsEnhancing(false);
        }
    }, [uploadedImage, callGeminiApi, showToast]);

    const handleParseBatchJson = useCallback(() => {
        if (!batchInput.trim()) {
            showToast("Input is empty.", 'info');
            return;
        }
        try {
            const parsed = JSON.parse(batchInput);
            if (!Array.isArray(parsed)) {
                throw new Error("Invalid JSON: The content must be a JSON array.");
            }
    
            let prompts: string[] = [];
            
            // This function ensures each prompt is a single line, fixing the counting bug.
            const sanitizePrompt = (p: string) => p.replace(/[\r\n]+/g, ' ').trim();
    
            if (parsed.every(item => typeof item === 'object' && item !== null && typeof item.prompt === 'string')) {
                prompts = parsed.map(item => sanitizePrompt(item.prompt));
            } 
            else if (parsed.every(item => typeof item === 'string')) {
                prompts = parsed.map(item => sanitizePrompt(item));
            } 
            else {
                throw new Error("Invalid JSON structure. Expected an array of strings (e.g., [\"prompt one\"]), or an array of objects with a 'prompt' key (e.g., [{\"prompt\": \"...\"}]).");
            }
    
            setBatchInput(prompts.join('\n'));
            showToast(`Parsed and loaded ${prompts.length} prompts.`, 'success');
            
        } catch (error) {
             if (error instanceof SyntaxError) {
                 showToast(`JSON Parse Error: ${error.message}`, 'error');
            } else {
                 showToast((error as Error).message, 'error');
            }
        }
    }, [batchInput, showToast]);

    const handleEnhanceAllBatch = useCallback(async () => {
        const promptsToEnhance = batchInput.split('\n').filter(p => p.trim());
        if (promptsToEnhance.length === 0) return;

        setIsEnhancing(true);
        showToast(`Enhancing ${promptsToEnhance.length} prompts...`, 'info');

        const enhancedResults: string[] = [];
        for (const p of promptsToEnhance) {
            try {
                const enhancerPrompt = `Based on the user's prompt "${p}", create a fully enhanced, highly detailed prompt. Also provide an SEO-friendly title and exactly 49 relevant keywords.`;
                const responseText = await callGeminiApi(enhancerPrompt, enhancerSchema);
                const enhancedData: EnhancedMeta = JSON.parse(responseText);
                enhancedResults.push(enhancedData.enhanced_prompt);
            } catch (error) {
                enhancedResults.push(p); // Push original back on error
                showToast(`Failed to enhance prompt: "${p.substring(0, 20)}..."`, 'error');
            }
            // Update textarea progressively to give user feedback
            setBatchInput(enhancedResults.concat(promptsToEnhance.slice(enhancedResults.length)).join('\n'));
        }
        
        setIsEnhancing(false);
        showToast("Batch enhancement complete.", 'success');
    }, [batchInput, callGeminiApi, showToast]);
    
    const handleAutoGenBatchPrompts = useCallback(async () => {
        setIsBatchGeneratingPrompts(true);
        showToast(`Generating ${autoGenCount} prompts...`, 'info');
        try {
            const themeInstruction = autoGenTheme.trim() ? ` about the theme "${autoGenTheme.trim()}"` : " on a variety of creative and visually interesting subjects";

            const generationPrompt = `Generate exactly ${autoGenCount} unique, creative, and detailed image generation prompts${themeInstruction}. Each prompt should be a single, complete sentence. Do not number them or add any other text. Return ONLY a valid JSON array of strings.`;

            const schema = {
                type: Type.ARRAY,
                items: { type: Type.STRING }
            };

            const responseText = await callGeminiApi(generationPrompt, schema);
            const promptsArray: string[] = JSON.parse(responseText);

            if (!Array.isArray(promptsArray) || promptsArray.length === 0) {
                throw new Error("AI did not return a valid array of prompts.");
            }
            
            const sanitizedPrompts = promptsArray.map(p => p.replace(/[\r\n]+/g, ' ').trim()).filter(Boolean);

            setBatchInput(sanitizedPrompts.join('\n'));
            showToast(`Successfully generated ${sanitizedPrompts.length} prompts.`, 'success');

        } catch (error) {
            console.error("Batch prompt generation failed:", error);
            showToast(`Failed to generate prompts: ${(error as Error).message}`, 'error');
        } finally {
            setIsBatchGeneratingPrompts(false);
        }
    }, [autoGenCount, autoGenTheme, callGeminiApi, showToast]);

    const toggleSelect = useCallback((id: string) => {
        setSelected(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) newSet.delete(id);
            else newSet.add(id);
            return newSet;
        });
    }, []);

    const toggleSelectAll = (e: ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            setSelected(new Set(cards.keys()));
        } else {
            setSelected(new Set());
        }
    };
    
    const openMetadataModal = useCallback((cardId: string) => {
        const card = cards.get(cardId);
        if (card) {
            setMetadataEdit({ title: card.title, author: card.author, category: card.category });
            setModal({ type: 'metadata', cardId });
        }
    }, [cards]);

    const openPreviewModal = useCallback((cardId: string) => {
        setModal({ type: 'preview', cardId: cardId });
    }, []);

    const saveMetadata = () => {
        if (modal.cardId) {
            setCards(prev => {
                const newCards = new Map(prev);
                const card = newCards.get(modal.cardId!);
                if (card) {
                    newCards.set(modal.cardId!, { ...card, ...metadataEdit });
                }
                return newCards;
            });
            closeModal();
            showToast("Metadata saved.", "success");
        }
    };

    const closeModal = () => setModal({ type: 'preview', cardId: null });

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') closeModal();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const unupscaledSelectedCount = Array.from(selected)
        .map(id => cards.get(id))
        .filter(card => card && !card.isUpscaled)
        .length;

    // RENDER
    const renderCard = useCallback((card: CardData) => {
        const isSelected = selected.has(card.id);
        const upscalingState = isUpscaling[card.id];
        const isCurrentlyUpscaling = typeof upscalingState === 'object';

        return (
            <div key={card.id} className="relative group rounded-lg overflow-hidden shadow-lg transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl bg-slate-700">
                <img src={card.imageUrl} alt={card.title} className="w-full h-auto block aspect-video object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                {/* Info Overlay */}
                <div className="absolute bottom-0 left-0 p-3 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-300 w-full">
                    <h3 className="font-bold text-sm truncate">{card.title}</h3>
                    <p className="text-xs text-slate-300">by {card.author}</p>
                </div>
                
                {/* Actions & Checkbox */}
                <div className="absolute top-2 left-2">
                     <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(card.id)} className="form-checkbox h-5 w-5 rounded bg-slate-900/50 text-purple-500 border-slate-400 focus:ring-purple-500 transition" />
                </div>
                <div className="absolute top-2 right-2 flex gap-2 opacity-70 group-hover:opacity-100 transition-opacity duration-300">
                   {!card.isUpscaled && !isCurrentlyUpscaling && (
                        <button onClick={() => handleUpscale(card)} className="p-2 rounded-full bg-black/50 hover:bg-purple-600 transition" title={`Upscale ${upscaleFactor}x`}><Sparkles className="w-4 h-4" /></button>
                    )}
                     <button onClick={() => openPreviewModal(card.id)} className="p-2 rounded-full bg-black/50 hover:bg-purple-600 transition" title="Preview"><Maximize className="w-4 h-4" /></button>
                     <button onClick={() => openMetadataModal(card.id)} className="p-2 rounded-full bg-black/50 hover:bg-purple-600 transition" title="Edit Metadata"><Edit className="w-4 h-4" /></button>
                     <button onClick={() => handleDownloadImage(card, 'jpg')} className="p-2 rounded-full bg-black/50 hover:bg-purple-600 transition" title="Download JPG"><Download className="w-4 h-4" /></button>
                     <button onClick={() => handleDownloadImage(card, 'png')} className="p-2 rounded-full bg-black/50 hover:bg-blue-600 transition" title="Download PNG"><ImageIcon className="w-4 h-4" /></button>
                </div>

                {card.isUpscaled && <div className="absolute bottom-2 right-2 bg-green-500/80 text-white text-xs font-bold px-2 py-1 rounded-md">{card.upscaleFactor || 4}x UPSCALED</div>}
                
                {isCurrentlyUpscaling && (
                    <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center text-white gap-2">
                        <Loader className="w-8 h-8 animate-spin" />
                        <span className="text-sm">Upscaling...</span>
                        <span className="text-xs text-slate-400">Attempt {(upscalingState as {attempt: number}).attempt} of 3</span>
                    </div>
                )}
            </div>
        );
    }, [selected, isUpscaling, upscaleFactor, handleUpscale, openPreviewModal, openMetadataModal, handleDownloadImage, toggleSelect]);

    return (
        <>
            <Toast toast={toast} onDismiss={() => setToast(null)} />

            {/* MODALS */}
            {modal.cardId && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-40 flex items-center justify-center p-4" onClick={closeModal}>
                    {(() => {
                        const card = cards.get(modal.cardId!);
                        if (!card) return null;
                        
                        if (modal.type === 'preview') {
                            return (
                                <div className="relative max-w-4xl max-h-[90vh] bg-slate-800 rounded-lg shadow-2xl p-4 animate-zoom-in" onClick={e => e.stopPropagation()}>
                                    <img src={card.imageUrl} alt={card.title} className="max-w-full max-h-[calc(90vh-80px)] object-contain rounded" />
                                    <div className="mt-4 flex justify-between items-center">
                                        <p className="text-slate-300 text-sm truncate">{card.title}</p>
                                        <div className="flex gap-2">
                                            <button onClick={() => handleDownloadImage(card, 'jpg')} className="flex items-center gap-2 bg-purple-600 px-4 py-2 rounded-md hover:bg-purple-700 transition"><Download className="w-4 h-4"/>Download JPG</button>
                                            <button onClick={() => handleDownloadImage(card, 'png')} className="flex items-center gap-2 bg-blue-600 px-4 py-2 rounded-md hover:bg-blue-700 transition"><ImageIcon className="w-4 h-4"/>Download PNG</button>
                                        </div>
                                    </div>
                                    <button onClick={closeModal} className="absolute -top-3 -right-3 p-2 bg-slate-700 rounded-full hover:bg-red-500 transition"><X className="w-5 h-5"/></button>
                                </div>
                            );
                        }

                        if (modal.type === 'metadata') {
                             return (
                                <div className="w-full max-w-lg bg-slate-800 rounded-lg shadow-2xl p-6 space-y-4 animate-zoom-in" onClick={e => e.stopPropagation()}>
                                    <h2 className="text-xl font-bold">Edit Metadata</h2>
                                    <div>
                                        <label htmlFor="meta-title" className="block text-sm font-medium text-slate-300 mb-1">Title</label>
                                        <input id="meta-title" type="text" value={metadataEdit.title} onChange={e => setMetadataEdit(p => ({...p, title: e.target.value}))} className="w-full bg-slate-900 border border-slate-600 rounded-md p-2 focus:ring-2 focus:ring-purple-500 focus:border-purple-500" />
                                    </div>
                                     <div>
                                        <label htmlFor="meta-author" className="block text-sm font-medium text-slate-300 mb-1">Author</label>
                                        <input id="meta-author" type="text" value={metadataEdit.author} onChange={e => setMetadataEdit(p => ({...p, author: e.target.value}))} className="w-full bg-slate-900 border border-slate-600 rounded-md p-2 focus:ring-2 focus:ring-purple-500 focus:border-purple-500" />
                                    </div>
                                    <div>
                                        <label htmlFor="meta-category" className="block text-sm font-medium text-slate-300 mb-1">Category</label>
                                        <select 
                                            id="meta-category" 
                                            value={metadataEdit.category} 
                                            onChange={e => setMetadataEdit(p => ({...p, category: parseInt(e.target.value, 10)}))} 
                                            className="w-full bg-slate-900 border border-slate-600 rounded-md p-2 focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                                        >
                                            {Object.entries(CATEGORIES).map(([id, name]) => (
                                                <option key={id} value={id}>{name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="flex justify-end gap-3 pt-4">
                                        <button onClick={closeModal} className="px-4 py-2 rounded-md bg-slate-600 hover:bg-slate-700 transition">Cancel</button>
                                        <button onClick={saveMetadata} className="px-4 py-2 rounded-md bg-purple-600 hover:bg-purple-700 transition">Save Changes</button>
                                    </div>
                                    <button onClick={closeModal} className="absolute top-4 right-4 p-2 text-slate-400 rounded-full hover:bg-slate-700 transition"><X className="w-5 h-5"/></button>
                                </div>
                             );
                        }
                    })()}
                </div>
            )}


            <main className="max-w-[1200px] mx-auto bg-slate-800/50 backdrop-blur-lg rounded-xl border border-white/10 shadow-2xl p-6 sm:p-8">
                {/* HEADER */}
                <header className="text-center mb-8">
                    <h1 className="text-4xl sm:text-5xl font-extrabold bg-gradient-to-r from-purple-400 to-indigo-400 bg-clip-text text-transparent pb-2">IMAGE CREATOR BY firdausokeh</h1>
                    <p className="max-w-2xl mx-auto text-slate-400 mt-2">Generate stunning visuals with AI. From single prompts to batch processing, bring your creative ideas to life with powerful generation and upscaling tools.</p>
                    <div className="inline-flex items-center gap-2 bg-green-500/20 text-green-300 px-3 py-1 rounded-full text-sm mt-4">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                        </span>
                        AI-Powered Generation
                    </div>
                </header>

                {/* TABS */}
                <div className="flex justify-center mb-6">
                    <div className="bg-slate-900/50 p-1 rounded-lg flex gap-1">
                        <button onClick={() => setActiveTab('single')} className={`px-6 py-2 rounded-md text-sm font-medium transition ${activeTab === 'single' ? 'bg-white/10' : 'text-slate-400 hover:bg-white/5'}`}>Single Prompt</button>
                        <button onClick={() => setActiveTab('batch')} className={`px-6 py-2 rounded-md text-sm font-medium transition ${activeTab === 'batch' ? 'bg-white/10' : 'text-slate-400 hover:bg-white/5'}`}>Batch Prompts</button>
                    </div>
                </div>

                {/* MAIN CONTENT AREA */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {/* LEFT PANEL: INPUTS */}
                    <div className="md:col-span-1 space-y-6">
                        
                        {/* TAB CONTENT */}
                        {activeTab === 'single' ? (
                             <div className="space-y-4">
                                <label className="text-lg font-semibold block" htmlFor="prompt">Your Prompt</label>
                                <div className="relative">
                                    <textarea
                                        id="prompt"
                                        value={prompt}
                                        onChange={e => setPrompt(e.target.value)}
                                        onPaste={handleImagePaste}
                                        placeholder="e.g., A cinematic shot of a steampunk owl wearing goggles..."
                                        className="w-full bg-slate-900 border border-slate-600 rounded-md p-3 resize-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 h-40 custom-scrollbar"
                                        disabled={isGenerating}
                                    ></textarea>
                                    {tempEnhanced && <div className="absolute top-2 right-2 text-green-400" title="Prompt has been enhanced"><Check className="w-5 h-5"/></div>}
                                </div>
                                <div className="flex gap-2 flex-wrap">
                                    <button onClick={handleEnhancePrompt} disabled={isEnhancing || isGenerating} className="flex-1 flex items-center justify-center gap-2 bg-purple-600 px-4 py-2 rounded-md hover:bg-purple-700 transition disabled:opacity-50 text-sm">
                                        {isEnhancing ? <Loader className="w-4 h-4 animate-spin"/> : <Sparkles className="w-4 h-4"/>} Enhance
                                    </button>
                                    <button onClick={handleSurpriseMe} disabled={isEnhancing || isGenerating} className="flex-1 flex items-center justify-center gap-2 bg-slate-700 px-4 py-2 rounded-md hover:bg-slate-600 transition disabled:opacity-50 text-sm">
                                        <Wand2 className="w-4 h-4"/> Surprise Me
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <label className="text-lg font-semibold block">Batch Prompts ({batchPromptCount})</label>
                                    <button onClick={() => setBatchInput('')} className="text-slate-400 hover:text-red-400 transition" title="Clear All"><Trash2 className="w-4 h-4"/></button>
                                </div>
                                <textarea
                                    value={batchInput}
                                    onChange={e => setBatchInput(e.target.value)}
                                    placeholder="Enter one prompt per line, or use the auto-generator below."
                                    className="w-full bg-slate-900 border border-slate-600 rounded-md p-3 resize-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 h-40 custom-scrollbar"
                                    disabled={isGenerating || isEnhancing || isBatchGeneratingPrompts}
                                ></textarea>
                                <div className="flex gap-2">
                                    <button onClick={handleParseBatchJson} disabled={isEnhancing || isGenerating || isBatchGeneratingPrompts} className="flex-1 flex items-center justify-center gap-2 bg-slate-700 px-4 py-2 rounded-md hover:bg-slate-600 transition disabled:opacity-50 text-sm">
                                        <FileJson className="w-4 h-4" /> Parse JSON
                                    </button>
                                    <button onClick={handleEnhanceAllBatch} disabled={isEnhancing || isGenerating || isBatchGeneratingPrompts || batchPromptCount === 0} className="flex-1 flex items-center justify-center gap-2 bg-purple-600 px-4 py-2 rounded-md hover:bg-purple-700 transition disabled:opacity-50 text-sm">
                                        {isEnhancing ? <Loader className="w-4 h-4 animate-spin"/> : <Sparkles className="w-4 h-4"/>} Enhance All
                                    </button>
                                </div>
                                {/* Auto-generate Prompts */}
                                <div className="space-y-3 pt-4 border-t border-slate-700">
                                    <h3 className="text-lg font-semibold">Auto-generate Prompts</h3>
                                    <div>
                                        <label htmlFor="autogen-theme" className="block text-sm font-medium text-slate-300 mb-1">Theme (optional)</label>
                                        <input id="autogen-theme" type="text" value={autoGenTheme} onChange={e => setAutoGenTheme(e.target.value)} placeholder="e.g., cyberpunk animals" className="w-full bg-slate-900 border border-slate-600 rounded-md p-2 focus:ring-2 focus:ring-purple-500" disabled={isBatchGeneratingPrompts || isGenerating || isEnhancing} />
                                    </div>
                                    <div>
                                        <label htmlFor="autogen-count" className="block text-sm font-medium text-slate-300 mb-1">Quantity ({autoGenCount})</label>
                                        <input id="autogen-count" type="range" min="1" max="50" value={autoGenCount} onChange={e => setAutoGenCount(parseInt(e.target.value))} className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer" disabled={isBatchGeneratingPrompts || isGenerating || isEnhancing} />
                                    </div>
                                    <button onClick={handleAutoGenBatchPrompts} disabled={isBatchGeneratingPrompts || isGenerating || isEnhancing} className="w-full flex items-center justify-center gap-2 bg-indigo-600 px-4 py-2 rounded-md hover:bg-indigo-700 transition disabled:opacity-50 text-sm">
                                        {isBatchGeneratingPrompts ? <Loader className="w-4 h-4 animate-spin"/> : <Wand2 className="w-4 h-4"/>} Generate Prompts
                                    </button>
                                </div>
                            </div>
                        )}
                        
                        {/* IMAGE TO PROMPT */}
                        <div className="space-y-3">
                            <h3 className="text-lg font-semibold">Image to Prompt</h3>
                            <div 
                                onDrop={handleImageDrop} 
                                onDragOver={e => e.preventDefault()}
                                className="border-2 border-dashed border-slate-600 rounded-lg p-4 text-center cursor-pointer hover:border-purple-500 transition"
                                onClick={() => fileInputRef.current?.click()}
                            >
                                {uploadedImage ? (
                                    <div className="relative group">
                                        <img src={uploadedImage} alt="Uploaded preview" className="max-h-40 mx-auto rounded-md" />
                                        <button onClick={(e) => { e.stopPropagation(); setUploadedImage(null); }} className="absolute top-1 right-1 p-1 bg-red-600 rounded-full opacity-0 group-hover:opacity-100 transition"><X className="w-4 h-4"/></button>
                                    </div>
                                ) : (
                                    <>
                                        <UploadCloud className="mx-auto w-10 h-10 text-slate-400" />
                                        <p className="text-slate-400 mt-2 text-sm">Drop, paste, or click to upload an image</p>
                                    </>
                                )}
                                <input type="file" ref={fileInputRef} onChange={e => {
                                    const file = e.target.files?.[0];
                                    if(file) {
                                        const reader = new FileReader();
                                        reader.onload = (event) => setUploadedImage(event.target?.result as string);
                                        reader.readAsDataURL(file);
                                    }
                                }} accept="image/*" className="hidden" />
                            </div>
                            <button onClick={handleCreatePromptFromImage} disabled={!uploadedImage || isEnhancing || isGenerating} className="w-full flex items-center justify-center gap-2 bg-slate-700 px-4 py-2 rounded-md hover:bg-slate-600 transition disabled:opacity-50 text-sm">
                                 {isEnhancing && uploadedImage ? <Loader className="w-4 h-4 animate-spin"/> : <Wand2 className="w-4 h-4"/>} Create Prompt
                            </button>
                        </div>

                        {/* SETTINGS */}
                        <div className="space-y-4 pt-4 border-t border-slate-700">
                             <h3 className="text-lg font-semibold">Generation Settings</h3>
                             <div>
                                <label htmlFor="model-select" className="block text-sm font-medium text-slate-300 mb-1">AI Model</label>
                                <select id="model-select" value={model} onChange={e => setModel(e.target.value)} className="w-full bg-slate-900 border border-slate-600 rounded-md p-2 focus:ring-2 focus:ring-purple-500 focus:border-purple-500">
                                    {IMAGEN_MODELS.map(m => <option key={m} value={m}>{m}</option>)}
                                </select>
                             </div>
                             <div>
                                <label htmlFor="aspect-ratio" className="block text-sm font-medium text-slate-300 mb-1">Aspect Ratio</label>
                                <select id="aspect-ratio" value={aspectRatio} onChange={e => setAspectRatio(e.target.value)} className="w-full bg-slate-900 border border-slate-600 rounded-md p-2 focus:ring-2 focus:ring-purple-500 focus:border-purple-500">
                                    {ASPECT_RATIOS.map(ar => <option key={ar} value={ar}>{ar}</option>)}
                                </select>
                             </div>
                             <div>
                                <label htmlFor="sample-count" className="block text-sm font-medium text-slate-300 mb-1">Number of Images ({sampleCount})</label>
                                <input id="sample-count" type="range" min="1" max="8" value={sampleCount} onChange={e => setSampleCount(parseInt(e.target.value))} className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer" />
                             </div>
                             <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1">Upscale Factor</label>
                                <div className="flex bg-slate-900 border border-slate-600 rounded-md p-1 gap-1">
                                    <button onClick={() => setUpscaleFactor(2)} className={`flex-1 text-center py-1 rounded-md text-sm transition ${upscaleFactor === 2 ? 'bg-purple-600 text-white' : 'hover:bg-slate-700'}`}>
                                        2x
                                    </button>
                                    <button onClick={() => setUpscaleFactor(4)} className={`flex-1 text-center py-1 rounded-md text-sm transition ${upscaleFactor === 4 ? 'bg-purple-600 text-white' : 'hover:bg-slate-700'}`}>
                                        4x
                                    </button>
                                </div>
                            </div>
                             <div className="flex items-center justify-between">
                                <label htmlFor="auto-upscale" className="text-sm font-medium text-slate-300">Auto {upscaleFactor}x Upscale</label>
                                <button
                                    id="auto-upscale"
                                    onClick={() => setAutoUpscale(!autoUpscale)}
                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${autoUpscale ? 'bg-purple-600' : 'bg-slate-700'}`}
                                >
                                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${autoUpscale ? 'translate-x-6' : 'translate-x-1'}`} />
                                </button>
                            </div>
                        </div>

                        {/* MAIN ACTION BUTTON */}
                        <div>
                            <button onClick={handleGenerate} disabled={isGenerating || isBatchGeneratingPrompts} className="w-full py-3 text-lg font-bold bg-gradient-to-r from-purple-600 to-indigo-600 rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-all duration-300 transform hover:scale-[1.01] flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed">
                               {isGenerating ? (
                                   <>
                                   <Loader className="w-6 h-6 animate-spin"/> Generating...
                                   </>
                               ) : (
                                   `Generate (${activeTab === 'single' ? sampleCount : batchPromptCount * sampleCount})`
                               )}
                            </button>
                        </div>
                    </div>
                    
                    {/* RIGHT PANEL: GALLERY */}
                    <div className="md:col-span-2 bg-slate-900/50 p-4 rounded-lg border border-slate-700">
                        {cards.size === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-center text-slate-500">
                                <ImageIcon size={64} className="mb-4" />
                                <h3 className="text-xl font-semibold">Your creations will appear here</h3>
                                <p className="max-w-xs">Start by entering a prompt, or use "Surprise Me" for inspiration.</p>
                            </div>
                        ) : (
                            <>
                                {/* GALLERY ACTIONS */}
                                <div className="flex flex-wrap gap-2 justify-between items-center mb-4 p-2 bg-slate-800 rounded-md">
                                    <div className="flex items-center gap-3">
                                        <input type="checkbox" onChange={toggleSelectAll} checked={selected.size > 0 && selected.size === cards.size} className="form-checkbox h-5 w-5 rounded bg-slate-700 text-purple-500 border-slate-500 focus:ring-purple-500 transition" />
                                        <span className="text-sm text-slate-300">{selected.size} of {cards.size} selected</span>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                         <div className="flex items-center gap-2">
                                            <span className="text-sm text-slate-300">Format:</span>
                                            <div className="bg-slate-700 p-0.5 rounded-md flex gap-0.5">
                                                <button onClick={() => setFileFormat('jpg')} className={`px-2 py-0.5 text-xs rounded ${fileFormat === 'jpg' ? 'bg-purple-600' : ''}`}>JPG</button>
                                                <button onClick={() => setFileFormat('png')} className={`px-2 py-0.5 text-xs rounded ${fileFormat === 'png' ? 'bg-blue-600' : ''}`}>PNG</button>
                                            </div>
                                        </div>
                                        <button
                                            onClick={handleBatchUpscale}
                                            disabled={unupscaledSelectedCount === 0 || isBatchUpscaling}
                                            className="flex items-center gap-2 bg-purple-600/80 px-3 py-1.5 rounded-md hover:bg-purple-700 transition text-sm disabled:opacity-50"
                                            title="Upscale all selected images that are not yet upscaled"
                                        >
                                            {isBatchUpscaling ? <Loader className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                                            Upscale ({unupscaledSelectedCount})
                                        </button>
                                        <div className="relative group">
                                            <button disabled={selected.size === 0 && cards.size === 0} onClick={() => {}} className="flex items-center gap-2 bg-slate-700 px-3 py-1.5 rounded-md hover:bg-slate-600 transition text-sm disabled:opacity-50"><Download className="w-4 h-4"/> Download</button>
                                            <div className="absolute top-full mt-2 right-0 w-48 bg-slate-700 rounded-md shadow-lg py-1 z-10 opacity-0 group-hover:opacity-100 transition-opacity invisible group-hover:visible">
                                                <button onClick={() => handleDownloadZip('selected')} disabled={selected.size === 0} className="w-full text-left px-3 py-2 text-sm hover:bg-slate-600 disabled:opacity-50">Download Selected ({selected.size})</button>
                                                <button onClick={() => handleDownloadZip('all')} disabled={cards.size === 0} className="w-full text-left px-3 py-2 text-sm hover:bg-slate-600 disabled:opacity-50">Download All ({cards.size})</button>
                                            </div>
                                        </div>
                                        <button onClick={handleDownloadCsv} disabled={cards.size === 0} className="flex items-center gap-2 bg-green-600/80 px-3 py-1.5 rounded-md hover:bg-green-700 transition text-sm disabled:opacity-50"><FileText className="w-4 h-4"/> Export CSV</button>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 max-h-[70vh] overflow-y-auto custom-scrollbar pr-2">
                                    {Array.from(cards.values()).map(renderCard)}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </main>
        </>
    );
}