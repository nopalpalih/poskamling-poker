import React, { useState } from 'react';
import { supabase } from './supabaseClient';

function LandingPage({ onRoomCreated }) {
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [playerName, setPlayerName] = useState(''); 
  
  // State baru untuk input kode room
  const [joinCode, setJoinCode] = useState('');
  const [isLoading, setIsLoading] = useState(false); 

  // --- FUNGSI 1: BUAT ROOM (HOST) ---
  const handleBuatRoom = async () => {
    if (!playerName.trim()) {
      alert("Isi identitasmu dulu dong, Pal!");
      return;
    }
    setIsLoading(true);
    try {
      const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      const { data: roomData, error: roomError } = await supabase
        .from('rooms')
        .insert([{ 
          room_code: roomCode, 
          status: 'waiting',
          main_pot: 0,
          small_blind: 50,
          big_blind: 100
        }])
        .select()
        .single();

      if (roomError) throw roomError;

      const { error: playerError } = await supabase
        .from('players')
        .insert([{
          room_id: roomData.id,
          player_name: playerName,
          seat_index: 1, 
          chips: 10000,
          is_host: true,
          status: 'active'
        }]);

      if (playerError) throw playerError;

      onRoomCreated(roomData, playerName, 'host');
    } catch (error) {
      console.error(error);
      alert("Gagal bikin room. Cek koneksi Supabase-mu!");
    } finally {
      setIsLoading(false);
    }
  };

  // --- FUNGSI 2: JOIN ROOM (PLAYER) ---
  const handleJoinRoom = async () => {
    if (!playerName.trim() || !joinCode.trim()) {
      alert("Isi namamu di depan dan masukin Kode Room yang bener, Pal!");
      return;
    }
    
    setIsLoading(true);
    try {
      // 1. Cari room berdasarkan kode yang diinput
      const { data: roomData, error: roomError } = await supabase
        .from('rooms')
        .select('*')
        .eq('room_code', joinCode.toUpperCase())
        .single();

      if (roomError || !roomData) throw new Error("Room tidak ditemukan! Kodenya udah bener belum?");

      // 2. Cek ada berapa orang di meja buat nentuin kursi kosong
      const { data: existingPlayers, error: countError } = await supabase
        .from('players')
        .select('seat_index')
        .eq('room_id', roomData.id);

      if (countError) throw countError;

      const nextSeat = existingPlayers.length + 1;
      if (nextSeat > 8) throw new Error("Waduh, mejanya udah kepenuhan (Maksimal 8 orang)!");

      // 3. Dudukkan pemain baru di kursi yang kosong
      const { error: joinError } = await supabase
        .from('players')
        .insert([{
          room_id: roomData.id,
          player_name: playerName,
          seat_index: nextSeat,
          chips: 10000,
          is_host: false, // Karena dia join, dia bukan host
          status: 'active'
        }]);

      if (joinError) throw joinError;

      // 4. Sukses! Lempar masuk ke meja
      onRoomCreated(roomData, playerName, 'player');

    } catch (error) {
      console.error(error);
      alert(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen max-w-md mx-auto bg-gray-950 text-white font-sans flex flex-col relative border-x border-gray-800">

      {/* --- MENU UTAMA --- */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 space-y-10">
        <div className="text-center space-y-1 mb-4">
          <h1 className="text-5xl font-black tracking-widest uppercase text-transparent bg-clip-text bg-gradient-to-b from-white to-gray-500 drop-shadow-lg">
            POSKAMLING
          </h1>
          <h2 className="text-3xl font-bold tracking-widest text-green-500 drop-shadow-[0_0_10px_rgba(34,197,94,0.4)]">
            POKER
          </h2>
        </div>

        <div className="w-full space-y-5 px-2">
          <div className="relative group mb-6">
            <label className="block text-center text-[10px] font-black text-gray-500 tracking-widest uppercase mb-2">
              Identitas Pemain
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl opacity-50">👤</span>
              <input 
                type="text" 
                placeholder="NAMA KAMU..."
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value.toUpperCase())}
                className="w-full bg-gray-900 border-2 border-gray-700 rounded-2xl pl-12 pr-4 py-4 text-center text-lg font-black text-white tracking-widest focus:outline-none focus:border-green-500 focus:shadow-[0_0_15px_rgba(34,197,94,0.2)] transition-all uppercase placeholder-gray-600"
              />
            </div>
          </div>

          <button 
            onClick={handleBuatRoom}
            disabled={isLoading}
            className={`w-full py-4 bg-green-600 border-2 border-green-500 hover:bg-green-500 text-white font-black rounded-2xl tracking-widest text-lg shadow-[0_0_20px_rgba(34,197,94,0.3)] transition-all uppercase flex justify-center items-center ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}>
            {isLoading && !showJoinModal ? <span className="animate-spin text-2xl leading-none">⚙️</span> : "Buat Room"}
          </button>
          
          <button 
            onClick={() => setShowJoinModal(true)}
            className="w-full py-4 bg-gray-800 border-2 border-gray-600 hover:bg-gray-700 hover:border-gray-400 text-white font-black rounded-2xl tracking-widest text-lg transition-all shadow-lg uppercase">
            Join Room
          </button>
          
          <button className="w-full py-4 bg-gray-900 border-2 border-gray-800 hover:bg-gray-800 text-gray-400 font-bold rounded-2xl tracking-widest text-lg transition-all uppercase">
            Settings
          </button>
        </div>
      </div>

      {/* --- POP-UP MODAL JOIN ROOM --- */}
      {showJoinModal && (
        <div className="absolute inset-0 z-50 flex flex-col bg-gray-950/90 backdrop-blur-md animate-in fade-in duration-200">
          
          <header className="flex justify-between items-center p-5 border-b border-gray-800 bg-gray-950 shadow-sm">
            <div className="w-8"></div>
            <h2 className="text-xl font-black tracking-widest uppercase text-white drop-shadow-md">Join Room</h2>
            <button 
              onClick={() => setShowJoinModal(false)}
              className="w-8 h-8 flex items-center justify-center bg-gray-800 rounded-full text-gray-400 hover:text-white hover:bg-red-500 hover:border-red-500 border border-gray-600 transition-colors font-bold">
              ✕
            </button>
          </header>

          <main className="flex-1 flex flex-col items-center justify-center p-6">
            <div className="w-full bg-gray-900 border-2 border-gray-700 rounded-[2rem] p-8 shadow-2xl relative flex flex-col items-center">
              
              <div className="text-xs font-bold text-gray-400 mb-6 uppercase tracking-widest">
                Welcome, <span className="text-green-400">{playerName || 'PLAYER'}</span>
              </div>

              <label className="block text-center text-xs font-black text-gray-500 tracking-widest uppercase mb-4">
                Kode Room
              </label>
              
              <input 
                type="text" 
                placeholder="KODE..."
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                className="w-full bg-gray-950 border-2 border-gray-600 rounded-2xl px-4 py-4 text-center text-3xl font-mono font-bold text-white tracking-widest focus:outline-none focus:border-blue-500 focus:shadow-[0_0_15px_rgba(59,130,246,0.3)] transition-all uppercase"
              />
            </div>
          </main>

          <div className="p-5 bg-gray-950 border-t border-gray-800 shadow-[0_-10px_25px_rgba(0,0,0,0.5)]">
            <button 
              onClick={handleJoinRoom}
              disabled={isLoading}
              className={`w-full py-4 bg-blue-600 hover:bg-blue-500 text-white font-black rounded-2xl tracking-widest text-xl shadow-[0_0_20px_rgba(37,99,235,0.4)] transition-all uppercase flex justify-center items-center ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}>
              {isLoading && showJoinModal ? <span className="animate-spin text-2xl leading-none">⚙️</span> : "MULAI"}
            </button>
          </div>
          
        </div>
      )}
{/* --- FOOTER COPYRIGHT --- */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center justify-center w-full opacity-60 pointer-events-none">
        <p className="text-[10px] font-black tracking-widest uppercase text-gray-400 mb-1">
          v1.7.7 <span className="text-green-500 shadow-[0_0_10px_rgba(34,197,94,0.3)]">BISMILAH NO BUG</span>
        </p>
        <p className="text-[8px] font-mono font-bold text-gray-500 tracking-widest uppercase">
          © 2026 Naufaliher07 Gabuts.
        </p>
      </div>

    </div>
  );
}

export default LandingPage;