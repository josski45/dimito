
import React, { useState, useCallback, useEffect, useRef, DragEvent, ChangeEvent } from 'react';
import { Video, Wand2, Loader, Download, AlertCircle, Check, X, UploadCloud, Trash2, Combine, FileJson } from 'lucide-react';
import { GoogleGenAI } from "@google/genai";

// --- TYPES & CONSTANTS ---

type VideoData = {
    id: string;
    url: string;
    prompt: string;
};

type ToastMessage = {
    id: number;
    message: string;
    type: 'info' | 'success' | 'error';
};

const VIDEO_MODELS = ['veo-2.0-generate-001','veo-3.0-fast-generate-preview','veo-3.0-generate-preview'];

const loadingMessages = [
    "Contacting the video muse...",
    "Rendering digital dreams into reality...",
    "This can take a few minutes. Time for a coffee?",
    "Assembling pixels into motion...",
    "The AI is painting with light and time...",
    "Generating your masterpiece, please wait...",
    "Good things come to those who wait...",
    "Finalizing the cinematic touches...",
];

// --- HELPER COMPONENTS ---
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

    const bgColor = { info: 'bg-blue-500/90', success: 'bg-green-500/90', error: 'bg-red-500/90' }[toast.type];
    const Icon = { info: <AlertCircle className="w-5 h-5" />, success: <Check className="w-5 h-5" />, error: <AlertCircle className="w-5 h-5" /> }[toast.type];

    return (
        <div className={`fixed top-5 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 p-4 rounded-lg text-white shadow-lg animate-fade-in-down ${bgColor}`}>
            {Icon}
            <span>{toast.message}</span>
            <button onClick={onDismiss} className="p-1 -mr-2 rounded-full hover:bg-white/20"><X className="w-4 h-4" /></button>
        </div>
    );
};

// --- MAIN COMPONENT ---
interface VideoCreatorProps {
    apiKeys: string[];
    isAiStudio: boolean;
    openKeyManager: () => void;
}
export default function VideoCreator({ apiKeys, isAiStudio, openKeyManager }: VideoCreatorProps) {
    const [activeTab, setActiveTab] = useState<'single' | 'batch'>('single');
    const [prompt, setPrompt] = useState('');
    const [batchInput, setBatchInput] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [isEnhancing, setIsEnhancing] = useState(false);
    const [isMerging, setIsMerging] = useState(false);
    const [generatedVideos, setGeneratedVideos] = useState<VideoData[]>([]);
    const [selectedVideos, setSelectedVideos] = useState<Set<string>>(new Set());
    const [toast, setToast] = useState<ToastMessage | null>(null);
    const [loadingMessage, setLoadingMessage] = useState(loadingMessages[0]);

    const [model, setModel] = useState(VIDEO_MODELS[0]);
    const [numberOfVideos, setNumberOfVideos] = useState(1);
    const [inputImages, setInputImages] = useState<string[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const apiKeyIndex = useRef(0);

    const batchPromptCount = batchInput.split('\n').filter(p => p.trim()).length;
    const hasValidKey = apiKeys.length > 0;

    const showToast = useCallback((message: string, type: 'info' | 'success' | 'error' = 'info') => {
        setToast({ id: Date.now(), message, type });
    }, []);

    const getApiKey = useCallback(() => {
        if (apiKeys.length === 0) return null;
        const key = apiKeys[apiKeyIndex.current];
        apiKeyIndex.current = (apiKeyIndex.current + 1) % apiKeys.length;
        return key;
    }, [apiKeys]);
    
    const callGeminiApi = useCallback(async (userPrompt: string) => {
        const parts = [{ text: userPrompt }];

        const apiKey = getApiKey();
        if (!apiKey) {
            showToast("No API Key available. Please add one via 'Manage Keys'.", 'error');
            throw new Error("API Key is not configured.");
        }

        try {
            const ai = new GoogleGenAI({ apiKey });
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: { parts },
            });
            const text = response.text;
            if (text === undefined) {
                throw new Error("Invalid response structure from Gemini API.");
            }
            return text;
        } catch (error) {
            const message = error instanceof Error ? error.message : "An unknown error occurred";
            showToast(`Gemini API error: ${message}`, 'error');
            throw error;
        }
    }, [showToast, getApiKey]);

    // Loading message cycle effect
    useEffect(() => {
        let interval: number;
        if (isGenerating) {
            interval = window.setInterval(() => {
                setLoadingMessage(prev => {
                    const currentIndex = loadingMessages.indexOf(prev);
                    const nextIndex = (currentIndex + 1) % loadingMessages.length;
                    return loadingMessages[nextIndex];
                });
            }, 3000);
        }
        return () => {
            if (interval) clearInterval(interval);
        };
    }, [isGenerating]);
    
    const handleRemoveImage = (indexToRemove: number) => {
        setInputImages(prev => prev.filter((_, index) => index !== indexToRemove));
    };

    const readFiles = useCallback((files: File[]) => {
        if (files.length === 0) return;

        // In single mode, always replace. In batch mode, append.
        if (activeTab === 'single') {
            const file = files[0];
            const reader = new FileReader();
            reader.onload = (event) => {
                if (event.target?.result) {
                    setInputImages([event.target.result as string]);
                }
            };
            reader.readAsDataURL(file);
        } else {
            const readers = files.map(file => {
                return new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = (event) => resolve(event.target?.result as string);
                    reader.onerror = reject;
                    reader.readAsDataURL(file);
                });
            });

            Promise.all(readers).then(newImages => {
                setInputImages(prev => [...prev, ...newImages]);
            }).catch(error => {
                console.error("Error reading files:", error);
                showToast("Failed to read one or more images.", 'error');
            });
        }
    }, [activeTab, showToast]);

    const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            readFiles(Array.from(e.target.files));
        }
        // Reset file input to allow uploading the same file again
        e.target.value = '';
    };

    const handleImageDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer.files) {
            readFiles(Array.from(e.dataTransfer.files));
        }
    }, [readFiles]);


    const handleGenerateVideo = useCallback(async () => {
        const promptsToProcess = activeTab === 'single'
            ? [prompt.trim()]
            : batchInput.split('\n').map(p => p.trim()).filter(Boolean);

        if (promptsToProcess.length === 0 || promptsToProcess.every(p => !p)) {
            showToast("Please provide at least one valid prompt.", "error");
            return;
        }

        setIsGenerating(true);
        setGeneratedVideos([]);
        setSelectedVideos(new Set());
        setLoadingMessage(loadingMessages[0]);
        let totalSuccessCount = 0;

        for (const [index, currentPrompt] of promptsToProcess.entries()) {
            showToast(`Processing prompt ${index + 1} of ${promptsToProcess.length}...`, 'info');
            
            try {
                const apiKey = getApiKey();
                if (!apiKey) {
                    showToast("API Key is not configured.", 'error');
                    throw new Error("API Key is not configured.");
                }

                const ai = new GoogleGenAI({ apiKey });
                const params: any = {
                    model,
                    prompt: currentPrompt,
                    config: { numberOfVideos }
                };
                
                const imageForThisPrompt = activeTab === 'single'
                    ? (inputImages.length > 0 ? inputImages[0] : null)
                    : (inputImages.length > index ? inputImages[index] : null);

                if (imageForThisPrompt) {
                    params.image = {
                        imageBytes: imageForThisPrompt.split(',')[1],
                        mimeType: imageForThisPrompt.match(/data:(.*);base64,/)?.[1] || 'image/jpeg',
                    };
                }

                let operation = await ai.models.generateVideos(params);
                showToast("Video generation started. This can take several minutes.", 'info');

                while (!operation.done) {
                    await new Promise(resolve => setTimeout(resolve, 10000)); // Poll every 10 seconds
                    operation = await ai.operations.getVideosOperation({ operation: operation });
                }

                const videoUris = operation.response?.generatedVideos?.map(v => v.video?.uri).filter(Boolean) as string[];

                if (!videoUris || videoUris.length === 0) {
                    throw new Error("Video generation completed, but no download link was found.");
                }

                showToast(`Fetching ${videoUris.length} generated video(s)...`, 'info');

                const fetchedUrls = await Promise.all(
                    videoUris.map(async (uri) => {
                        const response = await fetch(`${uri}&key=${apiKey}`);
                        if (!response.ok) throw new Error(`Failed to fetch video: ${response.statusText}`);
                        const videoBlob = await response.blob();
                        return URL.createObjectURL(videoBlob);
                    })
                );
                
                const newVideos: VideoData[] = fetchedUrls.map((url, i) => ({
                    id: `${Date.now()}-${index}-${i}`,
                    url: url,
                    prompt: currentPrompt,
                }));

                setGeneratedVideos(prev => [...prev, ...newVideos]);
                totalSuccessCount += newVideos.length;

            } catch (error) {
                const message = error instanceof Error ? error.message : "An unknown error occurred";
                showToast(`Video generation error: ${message}`, 'error');
                showToast(`Failed to generate video for prompt: "${currentPrompt.substring(0, 30)}..."`, 'error');
            }
        }
        
        showToast(`Generation complete. Successfully created ${totalSuccessCount} video(s).`, 'success');
        setIsGenerating(false);

    }, [prompt, activeTab, batchInput, showToast, model, numberOfVideos, inputImages, getApiKey]);


    const handleEnhancePrompt = async () => {
        const currentPrompt = activeTab === 'single' ? prompt : batchInput.split('\n')[0] || '';
        if (!currentPrompt.trim()) {
            showToast("Prompt cannot be empty.", 'error');
            return;
        }
        setIsEnhancing(true);
        try {
            const enhancerPrompt = `You are a world-class prompt engineer for generative video AI. Based on the user's prompt, create a fully enhanced, highly detailed prompt. Focus on cinematic shots, camera movement (e.g., dolly zoom, crane shot), lighting (e.g., golden hour), and visual style. User Prompt: "${currentPrompt}"`;
            const responseText = await callGeminiApi(enhancerPrompt);
            if (activeTab === 'single') {
                setPrompt(responseText);
            } else {
                const allPrompts = batchInput.split('\n');
                allPrompts[0] = responseText;
                setBatchInput(allPrompts.join('\n'));
            }
            showToast("Prompt enhanced!", 'success');
        } catch (error) {
            // Error toast handled in callGeminiApi
        } finally {
            setIsEnhancing(false);
        }
    };
    
    const handleParseBatchJson = useCallback(() => {
        if (!batchInput.trim()) {
            showToast("Input is empty.", 'info');
            return;
        }
        try {
            const parsed = JSON.parse(batchInput);
            if (!Array.isArray(parsed)) throw new Error("JSON must be an array.");
            if (!parsed.every(item => typeof item === 'string')) throw new Error("JSON array must only contain strings.");
            
            setBatchInput(parsed.join('\n'));
            showToast(`Parsed and loaded ${parsed.length} prompts.`, 'success');
            
        } catch (error) {
            const message = error instanceof Error ? error.message : "Invalid JSON format.";
            showToast(message, 'error');
        }
    }, [batchInput, showToast]);
    
    // In a real-world scenario, merging would require a server-side component like FFMPEG.
    // This is a placeholder to show what the UX would be like.
    const handleMergeVideos = async () => {
        if (selectedVideos.size < 2) {
            showToast("Please select at least 2 videos to merge.", 'info');
            return;
        }
        setIsMerging(true);
        showToast(`Merging ${selectedVideos.size} videos... (Client-side simulation)`, 'info');
        await new Promise(resolve => setTimeout(resolve, 3000)); // Simulate processing
        showToast("Video merging is a server-side operation and is not implemented in this demo.", 'info');
        setIsMerging(false);
    };

    const toggleSelect = (id: string) => {
        setSelectedVideos(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) newSet.delete(id);
            else newSet.add(id);
            return newSet;
        });
    };
    
    useEffect(() => {
        // When switching tabs, clear images if going from batch to single with multiple images
        if (activeTab === 'single' && inputImages.length > 1) {
            setInputImages(prev => [prev[0]]); // Keep only the first one
        }
    }, [activeTab, inputImages.length]);


    return (
        <>
            <Toast toast={toast} onDismiss={() => setToast(null)} />
            <main className="max-w-[1200px] mx-auto bg-slate-800/50 backdrop-blur-lg rounded-xl border border-white/10 shadow-2xl p-6 sm:p-8">
                {/* HEADER */}
                <header className="text-center mb-8">
                    <h1 className="text-4xl sm:text-5xl font-extrabold bg-gradient-to-r from-cyan-400 to-sky-400 bg-clip-text text-transparent pb-2">VIDEO CREATOR</h1>
                    <p className="max-w-2xl mx-auto text-slate-400 mt-2">Transform your text and images into dynamic videos. Describe a scene, upload an image, and let the AI bring your vision to life in motion.</p>
                </header>

                 {!hasValidKey && !isAiStudio && (
                    <div className="p-4 mb-6 rounded-md bg-yellow-500/20 text-yellow-300 border border-yellow-500/30 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <AlertCircle className="w-5 h-5"/>
                            <div>
                                <p className="font-semibold">No API Key Found</p>
                                <p className="text-sm">Please add an API key to enable content generation.</p>
                            </div>
                        </div>
                        <button onClick={openKeyManager} className="px-4 py-2 rounded-md bg-yellow-500/30 hover:bg-yellow-500/40 transition text-sm font-semibold">
                            Add Key
                        </button>
                    </div>
                )}

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
                        {/* Prompt Input */}
                        {activeTab === 'single' ? (
                            <div className="space-y-4">
                                <label className="text-lg font-semibold block" htmlFor="prompt">Your Prompt</label>
                                <textarea
                                    id="prompt"
                                    value={prompt}
                                    onChange={e => setPrompt(e.target.value)}
                                    placeholder="e.g., A majestic eagle soaring over a misty mountain range at sunrise, cinematic."
                                    className="w-full bg-slate-900 border border-slate-600 rounded-md p-3 resize-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 h-40 custom-scrollbar"
                                    disabled={isGenerating || !hasValidKey}
                                ></textarea>
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
                                    placeholder="Enter one prompt per line."
                                    className="w-full bg-slate-900 border border-slate-600 rounded-md p-3 resize-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 h-40 custom-scrollbar"
                                    disabled={isGenerating || !hasValidKey}
                                ></textarea>
                                <div className="flex gap-2">
                                    <button onClick={handleParseBatchJson} disabled={isGenerating} className="flex-1 flex items-center justify-center gap-2 bg-slate-700 px-4 py-2 rounded-md hover:bg-slate-600 transition disabled:opacity-50 text-sm">
                                        <FileJson className="w-4 h-4" /> Parse JSON
                                    </button>
                                </div>
                            </div>
                        )}
                        <div className="flex gap-2">
                            <button onClick={handleEnhancePrompt} disabled={isEnhancing || isGenerating || !hasValidKey} className="flex-1 flex items-center justify-center gap-2 bg-sky-600 px-4 py-2 rounded-md hover:bg-sky-700 transition disabled:opacity-50 text-sm">
                                {isEnhancing ? <Loader className="w-4 h-4 animate-spin"/> : <Wand2 className="w-4 h-4"/>} Enhance Prompt
                            </button>
                        </div>

                         {/* Image Input Section */}
                        <div className="space-y-3">
                            <div className="flex justify-between items-center">
                                <h3 className="text-lg font-semibold">
                                    Input Image{activeTab === 'batch' && inputImages.length > 0 ? `s (${inputImages.length})` : ''} (Optional)
                                </h3>
                                {inputImages.length > 0 && (
                                    <button onClick={() => setInputImages([])} className="text-slate-400 hover:text-red-400 transition" title="Clear All Images">
                                        <Trash2 className="w-4 h-4"/>
                                    </button>
                                )}
                            </div>

                            {/* SINGLE MODE UI */}
                            {activeTab === 'single' && (
                                <>
                                    {inputImages.length === 0 ? (
                                        <div 
                                            onClick={() => fileInputRef.current?.click()} 
                                            onDrop={handleImageDrop} 
                                            onDragOver={e => e.preventDefault()}
                                            className="border-2 border-dashed border-slate-600 rounded-lg p-6 text-center cursor-pointer hover:border-sky-500 transition"
                                        >
                                            <UploadCloud className="mx-auto w-10 h-10 text-slate-400" />
                                            <p className="text-slate-400 mt-2 text-sm">Drop, paste, or click to upload an image</p>
                                        </div>
                                    ) : (
                                        <div className="relative group w-full aspect-video bg-slate-900 rounded-lg overflow-hidden">
                                            <img src={inputImages[0]} alt="Input preview" className="w-full h-full object-contain" />
                                            <button 
                                                onClick={() => setInputImages([])} 
                                                className="absolute top-2 right-2 p-1.5 bg-red-600 rounded-full opacity-0 group-hover:opacity-100 transition"
                                                title="Remove Image"
                                            >
                                                <X className="w-4 h-4 text-white"/>
                                            </button>
                                        </div>
                                    )}
                                </>
                            )}

                            {/* BATCH MODE UI */}
                            {activeTab === 'batch' && (
                                <>
                                    <div 
                                        onClick={() => fileInputRef.current?.click()} 
                                        onDrop={handleImageDrop} 
                                        onDragOver={e => e.preventDefault()} 
                                        className="border-2 border-dashed border-slate-600 rounded-lg p-6 text-center cursor-pointer hover:border-sky-500 transition"
                                    >
                                        <UploadCloud className="mx-auto w-8 h-8 text-slate-400" />
                                        <p className="text-slate-400 mt-2 text-sm">Drop, paste, or click to upload images</p>
                                        <p className="text-xs text-slate-500 mt-1">Each image will match a prompt on the same line.</p>
                                    </div>
                                    {inputImages.length > 0 && (
                                        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                                            {inputImages.map((image, index) => (
                                                <div key={index} className="relative group aspect-square bg-slate-900 rounded-md overflow-hidden">
                                                    <img src={image} alt={`Input ${index + 1}`} className="w-full h-full object-cover" />
                                                    <button 
                                                        onClick={() => handleRemoveImage(index)} 
                                                        className="absolute top-1 right-1 p-1 bg-red-600/80 rounded-full opacity-0 group-hover:opacity-100 transition"
                                                        title="Remove Image"
                                                    >
                                                        <X className="w-3 h-3 text-white"/>
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </>
                            )}
                            <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" multiple={activeTab === 'batch'} className="hidden" />
                        </div>
                        
                        {/* SETTINGS */}
                         <div className="space-y-4 pt-4 border-t border-slate-700">
                             <h3 className="text-lg font-semibold">Generation Settings</h3>
                             <div>
                                <label htmlFor="model-select" className="block text-sm font-medium text-slate-300 mb-1">AI Model</label>
                                <select id="model-select" value={model} onChange={e => setModel(e.target.value)} className="w-full bg-slate-900 border border-slate-600 rounded-md p-2 focus:ring-2 focus:ring-sky-500 focus:border-sky-500">
                                    {VIDEO_MODELS.map(m => <option key={m} value={m}>{m}</option>)}
                                </select>
                             </div>
                             <div>
                                <label htmlFor="sample-count" className="block text-sm font-medium text-slate-300 mb-1">Number of Videos ({numberOfVideos})</label>
                                <input id="sample-count" type="range" min="1" max="4" value={numberOfVideos} onChange={e => setNumberOfVideos(parseInt(e.target.value))} className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer" />
                             </div>
                        </div>

                        {/* MAIN ACTION BUTTON */}
                         <div>
                            <button onClick={handleGenerateVideo} disabled={isGenerating || !hasValidKey} className="w-full py-3 text-lg font-bold bg-gradient-to-r from-sky-500 to-cyan-500 rounded-lg hover:from-sky-600 hover:to-cyan-600 transition-all duration-300 transform hover:scale-[1.01] flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed">
                                {isGenerating ? <Loader className="w-6 h-6 animate-spin"/> : 'Generate Video(s)'}
                            </button>
                        </div>

                    </div>
                    {/* RIGHT PANEL: GALLERY */}
                    <div className="md:col-span-2 bg-slate-900/50 p-4 rounded-lg border border-slate-700">
                        {isGenerating ? (
                            <div className="flex flex-col items-center justify-center h-full text-center text-slate-400">
                                <Loader size={64} className="animate-spin text-sky-400 mb-6" />
                                <h3 className="text-xl font-semibold mb-2">Generation in Progress...</h3>
                                <p className="max-w-xs transition-opacity duration-500">{loadingMessage}</p>
                            </div>
                        ) : generatedVideos.length === 0 ? (
                             <div className="flex flex-col items-center justify-center h-full text-center text-slate-500">
                                <Video size={64} className="mb-4" />
                                <h3 className="text-xl font-semibold">Your generated videos will appear here</h3>
                                <p className="max-w-xs">Describe a scene or upload an image to start.</p>
                            </div>
                        ) : (
                            <>
                                {/* GALLERY ACTIONS */}
                                <div className="flex flex-wrap gap-2 justify-between items-center mb-4 p-2 bg-slate-800 rounded-md">
                                     <span className="text-sm text-slate-300">{selectedVideos.size} of {generatedVideos.length} selected</span>
                                     <div className="flex gap-2">
                                        <a 
                                            href={selectedVideos.size === 1 ? generatedVideos.find(v => v.id === selectedVideos.values().next().value)?.url : '#'}
                                            download={selectedVideos.size === 1 ? "generated-video.mp4" : undefined}
                                            onClick={(e) => { if (selectedVideos.size !== 1) e.preventDefault(); }}
                                            className={`flex items-center gap-2 bg-green-600/80 px-3 py-1.5 rounded-md hover:bg-green-700 transition text-sm ${selectedVideos.size !== 1 ? 'opacity-50 cursor-not-allowed' : ''}`}
                                        >
                                            <Download className="w-4 h-4"/> Download Selected
                                        </a>
                                        <button 
                                            onClick={handleMergeVideos}
                                            disabled={isMerging || selectedVideos.size < 2}
                                            className="flex items-center gap-2 bg-purple-600/80 px-3 py-1.5 rounded-md hover:bg-purple-700 transition text-sm disabled:opacity-50"
                                        >
                                            {isMerging ? <Loader className="w-4 h-4 animate-spin"/> : <Combine className="w-4 h-4"/>} Merge ({selectedVideos.size})
                                        </button>
                                     </div>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[70vh] overflow-y-auto custom-scrollbar pr-2">
                                     {generatedVideos.map((video) => (
                                        <div key={video.id} className="relative group rounded-lg overflow-hidden shadow-lg bg-slate-800">
                                            <video src={video.url} controls className="w-full h-auto block aspect-video"></video>
                                            <div className="p-3">
                                                <p className="text-sm text-slate-300 line-clamp-2" title={video.prompt}>{video.prompt}</p>
                                            </div>
                                            <div className="absolute top-2 left-2">
                                                <input 
                                                    type="checkbox" 
                                                    checked={selectedVideos.has(video.id)} 
                                                    onChange={() => toggleSelect(video.id)} 
                                                    className="form-checkbox h-5 w-5 rounded bg-slate-900/50 text-sky-500 border-slate-400 focus:ring-sky-500 transition" 
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </main>
        </>
    );
}
