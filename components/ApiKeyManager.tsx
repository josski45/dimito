
import React, { useState, useEffect } from 'react';
import { Key, X, Plus, Trash2, Eye, EyeOff } from 'lucide-react';

interface ApiKeyManagerProps {
    isOpen: boolean;
    onClose: () => void;
    keys: string[];
    onAddKey: (key: string) => void;
    onDeleteKey: (key: string) => void;
}

const ApiKeyManager: React.FC<ApiKeyManagerProps> = ({ isOpen, onClose, keys, onAddKey, onDeleteKey }) => {
    const [newKey, setNewKey] = useState('');
    const [showKeys, setShowKeys] = useState(false);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };
        if (isOpen) {
            window.addEventListener('keydown', handleKeyDown);
        }
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const handleAddClick = () => {
        if (newKey.trim()) {
            onAddKey(newKey.trim());
            setNewKey('');
        }
    };

    const maskKey = (key: string) => {
        if (showKeys) return key;
        if (key.length < 8) return '********';
        return `${key.slice(0, 4)}...${key.slice(-4)}`;
    };

    return (
        <div 
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" 
            onClick={onClose}
        >
            <div 
                className="w-full max-w-lg bg-slate-800 rounded-lg shadow-2xl p-6 space-y-6 animate-zoom-in border border-slate-600"
                onClick={e => e.stopPropagation()}
            >
                <header className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Key className="w-6 h-6 text-purple-400"/>
                        <h2 className="text-2xl font-bold">Manage API Keys</h2>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-400 rounded-full hover:bg-slate-700 transition"><X className="w-5 h-5"/></button>
                </header>
                
                {keys.length === 0 && (
                    <div className="p-4 rounded-md bg-yellow-500/20 text-yellow-300 border border-yellow-500/30">
                        <p className="font-semibold">No API Key Found</p>
                        <p className="text-sm">Please add at least one Gemini API key to start generating content.</p>
                    </div>
                )}
                
                <div className="space-y-4">
                    <h3 className="text-lg font-semibold">Add New Key</h3>
                    <div className="flex gap-2">
                        <input 
                            type="password"
                            value={newKey}
                            onChange={e => setNewKey(e.target.value)}
                            placeholder="Paste your Gemini API key here"
                            className="flex-grow bg-slate-900 border border-slate-600 rounded-md p-2 focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                            onKeyDown={e => e.key === 'Enter' && handleAddClick()}
                        />
                        <button 
                            onClick={handleAddClick} 
                            className="px-4 py-2 rounded-md bg-purple-600 hover:bg-purple-700 transition disabled:opacity-50 flex items-center gap-2"
                            disabled={!newKey.trim()}
                        >
                            <Plus className="w-4 h-4"/> Add
                        </button>
                    </div>
                </div>

                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <h3 className="text-lg font-semibold">Your Keys ({keys.length})</h3>
                        {keys.length > 0 && (
                            <button onClick={() => setShowKeys(!showKeys)} className="text-slate-400 hover:text-white transition flex items-center gap-2 text-sm">
                                {showKeys ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                {showKeys ? 'Hide' : 'Show'}
                            </button>
                        )}
                    </div>
                    <div className="max-h-60 overflow-y-auto custom-scrollbar space-y-2 pr-2">
                        {keys.map((key, index) => (
                            <div key={index} className="flex items-center justify-between bg-slate-900/50 p-3 rounded-md">
                                <span className="font-mono text-sm text-slate-300">{maskKey(key)}</span>
                                <button onClick={() => onDeleteKey(key)} className="p-2 text-slate-400 hover:text-red-400 transition" title="Delete Key">
                                    <Trash2 className="w-4 h-4"/>
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
                
                <footer className="flex justify-end pt-4">
                    <button onClick={onClose} className="px-6 py-2 rounded-md bg-slate-600 hover:bg-slate-700 transition">Close</button>
                </footer>
            </div>
        </div>
    );
};

export default ApiKeyManager;
