
import React, { useState } from 'react';
import ImageCreator from './components/ImageCreator';
import VideoCreator from './components/VideoCreator';
import Navbar from './components/Navbar';

function App() {
  const [activePage, setActivePage] = useState<'image' | 'video'>('image');

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f172a] via-[#1e293b] to-[#334155] text-slate-100 font-sans">
      <Navbar activePage={activePage} onNavigate={setActivePage} />
      <div className="p-4 sm:p-6 lg:p-8">
        {activePage === 'image' && <ImageCreator />}
        {activePage === 'video' && <VideoCreator />}
      </div>
    </div>
  );
}

export default App;
