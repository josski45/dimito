
import React, { useState, useEffect, useCallback } from 'react';
import ImageCreator from './components/ImageCreator';
import VideoCreator from './components/VideoCreator';
import Navbar from './components/Navbar';
import { X, KeyRound, Save, Plus, Trash2, Eye, EyeOff } from 'lucide-react';

// --- API Key Manager Modal ---
interface ApiKeyManagerProps {
  isOpen: boolean;
  onClose: () => void;
  apiKeys: string[];
  setApiKeys: React.Dispatch<React.SetStateAction<string[]>>;
}

const ApiKeyManager: React.FC<ApiKeyManagerProps> = ({ isOpen, onClose, apiKeys, setApiKeys }) => {
  const [localKeys, setLocalKeys] = useState(apiKeys);
  const [newKey, setNewKey] = useState('');
  const [visibleKeys, setVisibleKeys] = useState<Record<number, boolean>>({});

  useEffect(() => {
    setLocalKeys(apiKeys);
  }, [apiKeys]);

  if (!isOpen) return null;

  const handleAddKey = () => {
    if (newKey.trim() && !localKeys.includes(newKey.trim())) {
      setLocalKeys([...localKeys, newKey.trim()]);
      setNewKey('');
    }
  };

  const handleRemoveKey = (index: number) => {
    setLocalKeys(localKeys.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    setApiKeys(localKeys);
    onClose();
  };
  
  const maskKey = (key: string) => `${key.substring(0, 8)}...${key.substring(key.length - 4)}`;

  const toggleVisibility = (index: number) => {
    setVisibleKeys(prev => ({ ...prev, [index]: !prev[index] }));
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-lg bg-slate-800 rounded-lg shadow-2xl p-6 space-y-4 animate-zoom-in" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-bold flex items-center gap-2"><KeyRound /> API Key Management</h2>
          <button onClick={onClose} className="p-2 text-slate-400 rounded-full hover:bg-slate-700 transition"><X className="w-5 h-5"/></button>
        </div>
        <p className="text-sm text-slate-400">
          Add multiple Gemini API keys. The application will automatically rotate to the next available key if one hits its rate limit. Keys are stored securely in your browser's local storage.
        </p>
        
        {/* Key List */}
        <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar pr-2">
            {localKeys.length > 0 ? localKeys.map((key, index) => (
                <div key={index} className="flex items-center gap-2 bg-slate-900 p-2 rounded-md">
                    <span className="font-mono text-sm flex-grow">{visibleKeys[index] ? key : maskKey(key)}</span>
                    <button onClick={() => toggleVisibility(index)} className="p-1 text-slate-400 hover:text-slate-200">
                        {visibleKeys[index] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                    <button onClick={() => handleRemoveKey(index)} className="p-1 text-slate-400 hover:text-red-400">
                        <Trash2 className="w-4 h-4" />
                    </button>
                </div>
            )) : <p className="text-center text-slate-500 py-4">No API keys added.</p>}
        </div>

        {/* Add Key Input */}
        <div className="flex gap-2 pt-2">
            <input 
                type="password"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                placeholder="Enter new API key"
                className="flex-grow bg-slate-900 border border-slate-600 rounded-md p-2 focus:ring-2 focus:ring-purple-500"
            />
            <button onClick={handleAddKey} className="p-2 rounded-md bg-purple-600 hover:bg-purple-700 transition"><Plus /></button>
        </div>

        {/* Save Button */}
        <div className="flex justify-end pt-4">
          <button onClick={handleSave} className="flex items-center gap-2 px-4 py-2 rounded-md bg-green-600 hover:bg-green-700 transition">
            <Save className="w-4 h-4" /> Save and Close
          </button>
        </div>
      </div>
    </div>
  );
};


// --- Main App Component ---
function App() {
  const [activePage, setActivePage] = useState<'image' | 'video'>('image');
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);
  
  // API Key State Management
  const [apiKeys, setApiKeys] = useState<string[]>([]);
  const [activeKeyIndex, setActiveKeyIndex] = useState(0);
  const [keyCooldowns, setKeyCooldowns] = useState<Map<string, number>>(new Map());

  // Load keys from local storage on initial render
  useEffect(() => {
    try {
      const storedKeys = localStorage.getItem('geminiApiKeys');
      if (storedKeys) {
        const parsedKeys = JSON.parse(storedKeys);
        if(Array.isArray(parsedKeys)) {
            setApiKeys(parsedKeys);
        }
      }
    } catch (error) {
        console.error("Failed to load API keys from storage:", error);
        localStorage.removeItem('geminiApiKeys');
    }
  }, []);

  // Save keys to local storage whenever they change
  useEffect(() => {
    try {
        localStorage.setItem('geminiApiKeys', JSON.stringify(apiKeys));
        if (activeKeyIndex >= apiKeys.length) {
            setActiveKeyIndex(0);
        }
    } catch (error) {
        console.error("Failed to save API keys to storage:", error);
    }
  }, [apiKeys, activeKeyIndex]);

  const getNextAvailableKey = useCallback(() => {
    if (apiKeys.length === 0) return { key: null, index: -1 };

    const now = Date.now();
    // Check all keys starting from the current index
    for (let i = 0; i < apiKeys.length; i++) {
        const keyIndex = (activeKeyIndex + i) % apiKeys.length;
        const key = apiKeys[keyIndex];
        const cooldownEnd = keyCooldowns.get(key);
        if (!cooldownEnd || now > cooldownEnd) {
            // Found a valid key
            if (i > 0) setActiveKeyIndex(keyIndex); // Update index if we had to cycle
            return { key, index: keyIndex };
        }
    }
    // All keys are on cooldown
    return { key: null, index: -1 };
  }, [apiKeys, activeKeyIndex, keyCooldowns]);

  const cycleToNextKey = useCallback((failedKey: string) => {
    // Set a 60-second cooldown on the failed key
    setKeyCooldowns(prev => new Map(prev).set(failedKey, Date.now() + 60000));
    // Move to the next index, wrapping around if necessary
    setActiveKeyIndex(prev => (prev + 1) % (apiKeys.length || 1));
  }, [apiKeys.length]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f172a] via-[#1e293b] to-[#334155] text-slate-100 font-sans">
      <ApiKeyManager 
        isOpen={isApiKeyModalOpen}
        onClose={() => setIsApiKeyModalOpen(false)}
        apiKeys={apiKeys}
        setApiKeys={setApiKeys}
      />
      <Navbar 
        activePage={activePage} 
        onNavigate={setActivePage} 
        onOpenApiKeyManager={() => setIsApiKeyModalOpen(true)}
      />
      <div className="p-4 sm:p-6 lg:p-8">
        {activePage === 'image' && (
            <ImageCreator 
                apiKeys={apiKeys}
                getNextAvailableKey={getNextAvailableKey}
                cycleToNextKey={cycleToNextKey}
            />
        )}
        {activePage === 'video' && (
            <VideoCreator 
                 apiKeys={apiKeys}
                getNextAvailableKey={getNextAvailableKey}
                cycleToNextKey={cycleToNextKey}
            />
        )}
      </div>
    </div>
  );
}

export default App;
