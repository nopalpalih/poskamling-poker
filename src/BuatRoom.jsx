import React from 'react';

function App() {
  return (
    <div className="min-h-screen max-w-md mx-auto bg-gray-900 text-white font-sans flex flex-col relative border-x border-gray-700">
      
      {/* --- HEADER --- */}
      <header className="flex justify-between items-center p-4 border-b border-gray-700">
        <button className="px-4 py-1.5 bg-gray-800 rounded-full border border-gray-600 text-sm font-semibold hover:bg-gray-700 transition-colors">
          Menu
        </button>
        <h1 className="text-xl font-bold tracking-wider">Buat Room</h1>
        <div className="text-right">
          <p className="text-[10px] text-gray-400 uppercase tracking-widest mb-1">kode:</p>
          <p className="font-mono bg-gray-800 px-2 py-0.5 rounded border border-gray-600 text-sm tracking-widest">87kslO</p>
        </div>
      </header>

      {/* --- KONTEN UTAMA --- */}
      <main className="flex-1 overflow-y-auto p-4 space-y-6 mt-2">
        
        {/* Starting Chips (Nama Host dan Koin telah dihilangkan) */}
        <div className="bg-gray-800 border border-gray-600 rounded-2xl p-4 w-full flex items-center justify-between shadow-inner">
          <span className="font-semibold text-sm">Starting Chips</span>
          <div className="flex items-center space-x-3">
            <span className="bg-gray-900 px-5 py-1.5 rounded-lg border border-gray-600 font-mono text-lg">1000</span>
            <button className="bg-red-500/20 text-red-500 border border-red-500/50 rounded-full w-8 h-8 flex items-center justify-center hover:bg-red-500 hover:text-white transition-colors">
              ✖
            </button>
          </div>
        </div>

        {/* Level Controls (Hand/Minutes) */}
        <div className="flex justify-between items-center px-1">
          <button className="px-5 py-2 bg-gray-800 rounded-full border border-gray-600 text-sm font-semibold hover:bg-gray-700 transition-colors">
            Add Level
          </button>
          <div className="bg-gray-800 rounded-full border border-gray-600 flex overflow-hidden text-sm font-semibold">
            <button className="px-4 py-1.5 bg-gray-700 text-white">Hand</button>
            <button className="px-4 py-1.5 text-gray-400 hover:text-white transition-colors">Minutes</button>
          </div>
        </div>

        {/* Tabel Blind Structure */}
        <div className="bg-gray-800 rounded-2xl border border-gray-600 p-4 shadow-inner">
          <div className="grid grid-cols-5 text-[10px] text-center text-gray-400 mb-3 font-bold uppercase tracking-wider">
            <span>Big Blind</span>
            <span>Small Blind</span>
            <span>Ante</span>
            <span>Duration</span>
            <span></span>
          </div>
          
          {/* Baris 1 */}
          <div className="grid grid-cols-5 text-sm text-center items-center gap-2 mb-2 font-mono">
            <span className="bg-gray-900 border border-gray-600 rounded py-1">100</span>
            <span className="bg-gray-900 border border-gray-600 rounded py-1">50</span>
            <span className="bg-gray-900 border border-gray-600 rounded py-1">0</span>
            <span className="bg-gray-900 border border-gray-600 rounded py-1">15</span>
            <button className="text-gray-500 hover:text-red-500 transition-colors">✖</button>
          </div>
          {/* Baris 2 */}
          <div className="grid grid-cols-5 text-sm text-center items-center gap-2 mb-2 font-mono">
            <span className="bg-gray-900 border border-gray-600 rounded py-1">200</span>
            <span className="bg-gray-900 border border-gray-600 rounded py-1">100</span>
            <span className="bg-gray-900 border border-gray-600 rounded py-1">0</span>
            <span className="bg-gray-900 border border-gray-600 rounded py-1">15</span>
            <button className="text-gray-500 hover:text-red-500 transition-colors">✖</button>
          </div>
          {/* Baris 3 */}
          <div className="grid grid-cols-5 text-sm text-center items-center gap-2 mb-2 font-mono">
            <span className="bg-gray-900 border border-gray-600 rounded py-1">400</span>
            <span className="bg-gray-900 border border-gray-600 rounded py-1">200</span>
            <span className="bg-gray-900 border border-gray-600 rounded py-1">0</span>
            <span className="bg-gray-900 border border-gray-600 rounded py-1">15</span>
            <button className="text-gray-500 hover:text-red-500 transition-colors">✖</button>
          </div>
        </div>

        {/* Layout Meja Pemain */}
        <div className="flex flex-col items-center mt-8">
          <h3 className="text-xs font-bold tracking-widest text-gray-500 mb-6 uppercase">Players</h3>
          <div className="relative w-full h-40 border-[3px] border-gray-700 bg-gray-800/50 rounded-[4rem] flex items-center justify-center shadow-inner">
            
            {/* Visualisasi Tempat Duduk */}
            <span className="absolute -top-4 left-1/4 bg-gray-800 border-2 border-green-500 px-3 py-1 rounded-full text-xs font-bold text-green-400">Host</span>
            <span className="absolute -top-4 left-2/4 -translate-x-1/2 bg-gray-900 border border-gray-600 px-3 py-1 rounded-full text-xs text-gray-400">Player 2</span>
            <span className="absolute -top-4 right-1/4 bg-gray-900 border border-gray-600 px-3 py-1 rounded-full text-xs text-gray-400">Player 3</span>
            
            <span className="absolute top-1/2 -right-4 -translate-y-1/2 bg-gray-900 border border-gray-600 px-3 py-1 rounded-full text-xs text-gray-400">Player 4</span>
            
            <span className="absolute -bottom-4 right-1/4 bg-gray-900 border border-gray-600 px-3 py-1 rounded-full text-xs text-gray-400">Player 5</span>
            <span className="absolute -bottom-4 left-2/4 -translate-x-1/2 bg-gray-900 border border-gray-600 px-3 py-1 rounded-full text-xs text-gray-400">Player 6</span>
            <span className="absolute -bottom-4 left-1/4 bg-gray-900 border border-gray-600 px-3 py-1 rounded-full text-xs text-gray-400">Player 7</span>
            
            <span className="absolute top-1/2 -left-4 -translate-y-1/2 bg-gray-900 border border-gray-600 px-3 py-1 rounded-full text-xs text-gray-400">Player 8</span>
            
            <span className="text-gray-600 font-semibold tracking-wider text-sm animate-pulse">0/8 READY</span>
          </div>
        </div>

      </main>

      {/* --- FOOTER TOMBOL MULAI --- */}
      <div className="p-4 bg-gray-900 border-t border-gray-700">
        <button className="w-full py-3.5 bg-gray-700 text-gray-400 font-bold rounded-xl tracking-widest text-lg cursor-not-allowed transition-colors">
          MULAI
        </button>
      </div>

    </div>
  );
}

export default App;
