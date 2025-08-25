
import React from 'react';
import { Image, Video, Key } from 'lucide-react';

interface NavbarProps {
  activePage: 'image' | 'video';
  onNavigate: (page: 'image' | 'video') => void;
  isAiStudio: boolean;
  onOpenApiKeyManager: () => void;
}

const Navbar: React.FC<NavbarProps> = ({ activePage, onNavigate, isAiStudio, onOpenApiKeyManager }) => {
  const linkClasses = "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-200";
  const activeClasses = "bg-slate-700 text-white";
  const inactiveClasses = "text-slate-400 hover:bg-slate-700/50 hover:text-slate-200";

  return (
    <nav className="bg-slate-800/50 backdrop-blur-lg border-b border-white/10 sticky top-0 z-30">
      <div className="max-w-[1200px] mx-auto px-6 sm:px-8 flex items-center justify-between h-16">
        <div className="text-xl font-bold bg-gradient-to-r from-purple-400 to-indigo-400 bg-clip-text text-transparent">
          firdausokeh
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-slate-900/50 p-1 rounded-lg">
            <button
              onClick={() => onNavigate('image')}
              className={`${linkClasses} ${activePage === 'image' ? activeClasses : inactiveClasses}`}
              aria-current={activePage === 'image' ? 'page' : undefined}
            >
              <Image className="w-4 h-4" />
              <span>Image Creator</span>
            </button>
            <button
              onClick={() => onNavigate('video')}
              className={`${linkClasses} ${activePage === 'video' ? activeClasses : inactiveClasses}`}
              aria-current={activePage === 'video' ? 'page' : undefined}
            >
              <Video className="w-4 h-4" />
              <span>Video Creator</span>
            </button>
          </div>

          {!isAiStudio && (
             <button
              onClick={onOpenApiKeyManager}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-yellow-500/20 text-yellow-300 hover:bg-yellow-500/30 transition-colors duration-200"
              title="Manage API Keys"
            >
              <Key className="w-4 h-4" />
              <span>Manage Keys</span>
            </button>
          )}
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
