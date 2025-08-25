
import React, { useState, useEffect, useCallback } from 'react';
import ImageCreator from './components/ImageCreator';
import VideoCreator from './components/VideoCreator';
import Navbar from './components/Navbar';
import ApiKeyManager from './components/ApiKeyManager';

// --- Main App Component ---
function App() {
  const [activePage, setActivePage] = useState<'image' | 'video'>('image');
  const [apiKeys, setApiKeys] = useState<string[]>([]);
  const [isAiStudio, setIsAiStudio] = useState(false);
  const [isKeyManagerOpen, setIsKeyManagerOpen] = useState(false);

  useEffect(() => {
    // Check for AI Studio environment by looking for a pre-configured API_KEY
    if (process.env.API_KEY) {
      setIsAiStudio(true);
      setApiKeys([process.env.API_KEY]);
    } else {
      // Load keys from localStorage for non-AI Studio environments
      try {
        const storedKeys = localStorage.getItem('apiKeys');
        if (storedKeys) {
          const parsedKeys = JSON.parse(storedKeys);
          if (Array.isArray(parsedKeys) && parsedKeys.length > 0) {
            setApiKeys(parsedKeys);
          } else {
             setIsKeyManagerOpen(true); // No keys stored, prompt user
          }
        } else {
          setIsKeyManagerOpen(true); // First time visit, prompt user
        }
      } catch (error) {
        console.error("Failed to parse API keys from localStorage:", error);
        localStorage.removeItem('apiKeys');
        setIsKeyManagerOpen(true);
      }
    }
  }, []);

  // Persist keys to localStorage when they change, but not in AI Studio
  useEffect(() => {
    if (!isAiStudio) {
      localStorage.setItem('apiKeys', JSON.stringify(apiKeys));
    }
  }, [apiKeys, isAiStudio]);

  const handleAddKey = (key: string) => {
    if (key.trim() && !apiKeys.includes(key)) {
      setApiKeys(prevKeys => [...prevKeys, key.trim()]);
    }
  };

  const handleDeleteKey = (keyToDelete: string) => {
    setApiKeys(prevKeys => prevKeys.filter(key => key !== keyToDelete));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f172a] via-[#1e293b] to-[#334155] text-slate-100 font-sans">
      <Navbar 
        activePage={activePage} 
        onNavigate={setActivePage} 
        isAiStudio={isAiStudio}
        onOpenApiKeyManager={() => setIsKeyManagerOpen(true)}
      />
      <div className="p-4 sm:p-6 lg:p-8">
        {activePage === 'image' && (
            <ImageCreator 
              apiKeys={apiKeys} 
              isAiStudio={isAiStudio} 
              openKeyManager={() => setIsKeyManagerOpen(true)}
            />
        )}
        {activePage === 'video' && (
            <VideoCreator 
              apiKeys={apiKeys} 
              isAiStudio={isAiStudio} 
              openKeyManager={() => setIsKeyManagerOpen(true)}
            />
        )}
      </div>
      {!isAiStudio && (
        <ApiKeyManager
          isOpen={isKeyManagerOpen}
          onClose={() => setIsKeyManagerOpen(false)}
          keys={apiKeys}
          onAddKey={handleAddKey}
          onDeleteKey={handleDeleteKey}
        />
      )}
    </div>
  );
}

export default App;
