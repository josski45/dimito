import React, { useState, useCallback, useEffect, useRef, DragEvent, ChangeEvent } from 'react';
import { Video, Wand2, Loader, Download, AlertCircle, Check, X, UploadCloud, Trash2 } from 'lucide-react';
import { GoogleGenAI } from "@google/genai";

// --- TYPES & CONSTANTS ---

interface VideoCreatorProps {
    apiKeys: string[];
    getNextAvailableKey: () => { key: string | null, index: number };
    cycleToNextKey: (failedKey: string) => void;
}

type ToastMessage = {
    id: number;
    message: string;
    type: 'info' | 'success' | 'error';
};

const VIDEO_MODELS = ['veo-2.0-generate-001'];
const ASPECT_RATIOS = ["16:9", "9:16", "1:1", "4:3", "3:4"];

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
export default function VideoCreator({ apiKeys, getNextAvailableKey, cycleToNextKey }: VideoCreatorProps) {
    const [activeTab, setActiveTab] = useState<'single' | 'batch'>('single');
    const [prompt, setPrompt] = useState('');
    const [batchInput, setBatchInput] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [generatedVideos, setGeneratedVideos] = useState<string[]>([]);
    const [toast, setToast] = useState<ToastMessage | null>(null);
    const [loadingMessage, setLoadingMessage] = useState(loadingMessages[0]);

    const [model, setModel] = useState(VIDEO_MODELS[0]);
    const [numberOfVideos, setNumberOfVideos] = useState(1);
    const [aspectRatio, setAspectRatio] = useState('16:9');
    const [inputImage, setInputImage] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const batchPromptCount = batchInput.split('\n').filter(p => p.trim()).length;

    const showToast = useCallback((message: string, type: 'info' | 'success' | 'error' = 'info') => {
        setToast({ id: Date.now(), message, type });
    }, []);
    
    const isRateLimitError = (error: unknown): boolean => {
        const errorMessage = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
        const errorString = String(error);
        return errorString.includes("429") || errorMessage.includes('rate limit') || errorMessage.includes('resource_exhausted') || errorMessage.includes('quota');
    };

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

    const handleGenerateVideo = useCallback(async () => {
        const promptsToProcess = activeTab === 'single'
            ? [prompt.trim()]
            : batchInput.split('\n').map(p => p.trim()).filter(Boolean);

        if (promptsToProcess.length === 0 || promptsToProcess.every(p => !p)) {
            showToast("Please provide at least one valid prompt.", "error");
            return;
        }

        if (apiKeys.length === 0) {
            showToast("Please add an API key in the settings before generating.", 'error');
            return;
        }

        setIsGenerating(true);
        setGeneratedVideos([]);
        setLoadingMessage(loadingMessages[0]);
        let totalSuccessCount = 0;

        for (const [index, currentPrompt] of promptsToProcess.entries()) {
            showToast(`Processing prompt ${index + 1} of ${promptsToProcess.length}...`, 'info');
            let success = false;

            for (let i = 0; i < apiKeys.length; i++) {
                const { key: apiKey } = getNextAvailableKey();
                if (!apiKey) {
                    showToast("All API keys are on cooldown. Please wait.", 'error');
                    break; 
                }
                
                try {
                    const ai = new GoogleGenAI({ apiKey });
                    const params: any = {
                        model,
                        prompt: currentPrompt,
                        config: { numberOfVideos, aspectRatio }
                    };
                    if (inputImage) {
                        params.image = {
                            imageBytes: inputImage.split(',')[1],
                            mimeType: inputImage.match(/data:(.*);base64,/)?.[1] || 'image/jpeg',
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

                    setGeneratedVideos(prev => [...prev, ...fetchedUrls]);
                    showToast(`Prompt ${index + 1} completed successfully!`, 'success');
                    totalSuccessCount++;
                    success = true;
                    break; // Exit key loop on success
                } catch (error) {
                    console.error(`Video generation failed for prompt "${currentPrompt.substring(0, 20)}...":`, error);
                    if (isRateLimitError(error)) {
                        showToast(`API key failed, trying next...`, 'info');
                        cycleToNextKey(apiKey);
                    } else {
                        const message = error instanceof Error ? error.message : "An unknown error occurred";
                        showToast(`Error on prompt ${index + 1}: ${message}`, 'error');
                        break; // Exit key loop for non-retriable errors
                    }
                }
            }
             if (!success) {
                showToast(`All API keys failed for prompt ${index + 1}.`, 'error');
            }
        } // End of prompt loop

        showToast(`Batch finished. ${totalSuccessCount}/${promptsToProcess.length} prompts succeeded.`, totalSuccessCount > 0 ? 'success' : 'error');
        setIsGenerating(false);

    }, [prompt, batchInput, activeTab, model, numberOfVideos, inputImage, showToast, aspectRatio, apiKeys, getNextAvailableKey, cycleToNextKey]);

    const handleSurpriseMe = () => {
        const inspirations = [
            "A majestic eagle soaring over a misty mountain range at sunrise.",
            "A futuristic city with flying cars and holographic advertisements.",
            "A time-lapse of a flower blooming, from bud to full blossom.",
            "An astronaut planting a flag on a newly discovered alien planet with two suns.",
            "A close-up shot of a honeybee collecting nectar from a vibrant flower.",
            "A neon hologram of a cat driving at top speed.",
            "A serene underwater scene with colorful coral reefs and tropical fish."
        ];
        setPrompt(inspirations[Math.floor(Math.random() * inspirations.length)]);
    };

    const handleImageDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (event) => setInputImage(event.target?.result as string);
            reader.readAsDataURL(file);
        }
    }, []);

    const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => setInputImage(event.target?.result as string);
            reader.readAsDataURL(file);
        }
    };

    return (
        <>
            <Toast toast={toast} onDismiss={() => setToast(null)} />
            <main className="max-w-[1200px] mx-auto bg-slate-800/50 backdrop-blur-lg rounded-xl border border-white/10 shadow-2xl p-6 sm:p-8">
                {/* HEADER */}
                <header className="text-center mb-8">
                    <h1 className="text-4xl sm:text-5xl font-extrabold bg-gradient-to-r from-cyan-400 to-sky-400 bg-clip-text text-transparent pb-2">VIDEO CREATOR</h1>
                    <p className="max-w-2xl mx-auto text-slate-400 mt-2">Bring your stories to life with VEO, Google's state-of-the-art video generation model. Describe a scene, and watch it become a reality.</p>
                </header>

                {/* TABS */}
                 <div className="flex justify-center mb-6">
                    <div className="bg-slate-900/50 p-1 rounded-lg flex gap-1">
                        <button onClick={() => setActiveTab('single')} className={`px-6 py-2 rounded-md text-sm font-medium transition ${activeTab === 'single' ? 'bg-white/10' : 'text-slate-400 hover:bg-white/5'}`}>Single Prompt</button>
                        <button onClick={() => setActiveTab('batch')} className={`px-6 py-2 rounded-md text-sm font-medium transition ${activeTab === 'batch' ? 'bg-white/10' : 'text-slate-400 hover:bg-white/5'}`}>Batch Prompts</button>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {/* LEFT PANEL: INPUTS */}
                    <div className="md:col-span-1 space-y-6">
                        {/* PROMPT */}
                        {activeTab === 'single' ? (
                            <div className="space-y-4">
                                <label className="text-lg font-semibold block" htmlFor="prompt">Your Prompt</label>
                                <textarea
                                    id="prompt"
                                    value={prompt}
                                    onChange={e => setPrompt(e.target.value)}
                                    placeholder="e.g., A neon hologram of a cat driving a sports car..."
                                    className="w-full bg-slate-900 border border-slate-600 rounded-md p-3 resize-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 h-32 custom-scrollbar"
                                    disabled={isGenerating}
                                ></textarea>
                                <button onClick={handleSurpriseMe} disabled={isGenerating} className="w-full flex items-center justify-center gap-2 bg-slate-700 px-4 py-2 rounded-md hover:bg-slate-600 transition disabled:opacity-50 text-sm">
                                    <Wand2 className="w-4 h-4"/> Surprise Me
                                </button>
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
                                    disabled={isGenerating}
                                ></textarea>
                            </div>
                        )}
                        
                        {/* IMAGE TO VIDEO */}
                        <div className="space-y-3">
                            <h3 className="text-lg font-semibold">Image Input (Optional)</h3>
                            <div 
                                onDrop={handleImageDrop} 
                                onDragOver={e => e.preventDefault()}
                                className="border-2 border-dashed border-slate-600 rounded-lg p-4 text-center cursor-pointer hover:border-sky-500 transition"
                                onClick={() => fileInputRef.current?.click()}
                            >
                                {inputImage ? (
                                    <div className="relative group">
                                        <img src={inputImage} alt="Input preview" className="max-h-32 mx-auto rounded-md" />
                                        <button onClick={(e) => { e.stopPropagation(); setInputImage(null); }} className="absolute top-1 right-1 p-1 bg-red-600 rounded-full opacity-0 group-hover:opacity-100 transition"><X className="w-4 h-4"/></button>
                                    </div>
                                ) : (
                                    <>
                                        <UploadCloud className="mx-auto w-10 h-10 text-slate-400" />
                                        <p className="text-slate-400 mt-2 text-sm">Drop or click to upload an image</p>
                                    </>
                                )}
                                <input type="file" ref={fileInputRef} onChange={handleFileInputChange} accept="image/*" className="hidden" />
                            </div>
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
                                <label htmlFor="aspect-ratio" className="block text-sm font-medium text-slate-300 mb-1">Aspect Ratio</label>
                                <select id="aspect-ratio" value={aspectRatio} onChange={e => setAspectRatio(e.target.value)} className="w-full bg-slate-900 border border-slate-600 rounded-md p-2 focus:ring-2 focus:ring-sky-500 focus:border-sky-500">
                                    {ASPECT_RATIOS.map(ar => <option key={ar} value={ar}>{ar}</option>)}
                                </select>
                             </div>
                             <div>
                                <label htmlFor="video-count" className="block text-sm font-medium text-slate-300 mb-1">Videos per Prompt ({numberOfVideos})</label>
                                <input id="video-count" type="range" min="1" max="4" value={numberOfVideos} onChange={e => setNumberOfVideos(parseInt(e.target.value))} className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer" />
                             </div>
                        </div>
                        
                        {/* GENERATE BUTTON */}
                        <div>
                            {apiKeys.length === 0 && (
                                <div className="text-center p-2 rounded-md bg-yellow-500/20 text-yellow-300 text-sm mb-2">
                                    Please add an API key in the settings to enable generation.
                                </div>
                            )}
                            <button 
                                onClick={handleGenerateVideo} 
                                disabled={isGenerating || apiKeys.length === 0} 
                                className="w-full py-3 text-lg font-bold bg-gradient-to-r from-sky-600 to-cyan-600 rounded-lg hover:from-sky-700 hover:to-cyan-700 transition-all duration-300 transform hover:scale-[1.01] flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed">
                               {isGenerating ? (
                                   <>
                                   <Loader className="w-6 h-6 animate-spin"/> Generating...
                                   </>
                               ) : (
                                   `Generate (${activeTab === 'single' ? numberOfVideos : batchPromptCount * numberOfVideos})`
                               )}
                            </button>
                        </div>
                    </div>
                    
                    {/* RIGHT PANEL: RESULTS */}
                    <div className="md:col-span-2 bg-slate-900/50 p-4 rounded-lg border border-slate-700 min-h-[400px] flex items-center justify-center">
                        {!isGenerating && generatedVideos.length === 0 && (
                            <div className="flex flex-col items-center justify-center h-full text-center text-slate-500">
                                <Video size={64} className="mb-4" />
                                <h3 className="text-xl font-semibold">Your creations will appear here</h3>
                                <p className="max-w-xs">Describe a scene, provide an image, and let the AI bring it to life.</p>
                            </div>
                        )}
                        {isGenerating && (
                            <div className="text-center p-4">
                                <Loader className="w-12 h-12 animate-spin mx-auto mb-4 text-sky-400" />
                                <p className="font-semibold text-lg">{loadingMessage}</p>
                                <p className="text-slate-400 text-sm">Video generation can take several minutes.</p>
                            </div>
                        )}
                        {generatedVideos.length > 0 && (
                             <div className="w-full h-full grid grid-cols-1 sm:grid-cols-2 gap-4 overflow-y-auto custom-scrollbar pr-2">
                                {generatedVideos.map((url, index) => (
                                    <div key={index} className="space-y-2">
                                        <div className="aspect-video bg-black rounded-lg overflow-hidden">
                                            <video src={url} controls autoPlay loop className="w-full h-full object-contain" />
                                        </div>
                                        <a href={url} download={`video_${Date.now()}_${index+1}.mp4`} className="w-full inline-flex items-center justify-center gap-2 bg-green-600 px-4 py-2 rounded-md hover:bg-green-700 transition font-bold text-sm">
                                            <Download className="w-4 h-4" /> Download
                                        </a>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </main>
        </>
    );
}