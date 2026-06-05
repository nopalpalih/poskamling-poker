import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

function Lobby({ sessionData, onStartMatch }) {
  const { roomData, playerName, role } = sessionData;
  const roomId = roomData.id;
  const roomCode = roomData.room_code;

  const [players, setPlayers] = useState([]);
  const [isReady, setIsReady] = useState(role === 'host'); 

  const [startingChips, setStartingChips] = useState(10000);
  const [smallBlind, setSmallBlind] = useState(50);
  const [bigBlind, setBigBlind] = useState(100);

  useEffect(() => {
    const fetchPlayers = async () => {
      const { data } = await supabase
        .from('players')
        .select('*')
        .eq('room_id', roomId)
        .order('created_at', { ascending: true });
      if (data) setPlayers(data);
    };
    
    const fetchRoomSettings = async () => {
      const { data } = await supabase.from('rooms').select('*').eq('id', roomId).single();
      if (data) {
         if (data.starting_chips) setStartingChips(data.starting_chips);
         if (data.small_blind) setSmallBlind(data.small_blind);
         if (data.big_blind) setBigBlind(data.big_blind);
      }
    };
    
    fetchPlayers();
    fetchRoomSettings();

    const playerListener = supabase.channel(`lobby_players_${roomId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `room_id=eq.${roomId}` }, () => {
        fetchPlayers();
      }).subscribe();

    const roomListener = supabase.channel(`lobby_room_${roomId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` }, (payload) => {
        if (payload.new.status === 'preflop') {
          onStartMatch(payload.new); 
        } else {
          if (payload.new.starting_chips) setStartingChips(payload.new.starting_chips);
          if (payload.new.small_blind) setSmallBlind(payload.new.small_blind);
          if (payload.new.big_blind) setBigBlind(payload.new.big_blind);
        }
      }).subscribe();

    return () => {
      supabase.removeChannel(playerListener);
      supabase.removeChannel(roomListener);
    };
  }, [roomId, onStartMatch]);

  const toggleReady = async () => {
    const newReadyState = !isReady;
    setIsReady(newReadyState);
    await supabase
      .from('players')
      .update({ status: newReadyState ? 'ready' : 'waiting' })
      .eq('room_id', roomId)
      .eq('player_name', playerName);
  };

  const handleUpdateSetting = async (column, value) => {
    if (role !== 'host') return;
    try {
      await supabase.from('rooms').update({ [column]: Number(value) }).eq('id', roomId);
    } catch (error) {
      console.error("Gagal update setting:", error);
    }
  };

  const handleStart = async () => {
    const activePlayers = players.filter(p => p.status === 'ready' || p.is_host).sort((a, b) => a.seat_index - b.seat_index);
    const randomIdx = Math.floor(Math.random() * activePlayers.length);
    const dealerPlayer = activePlayers[randomIdx];
    
    const getNextPlayer = (currentIndex) => activePlayers[(currentIndex + 1) % activePlayers.length];
    
    const sbPlayer = getNextPlayer(randomIdx);
    const bbPlayer = getNextPlayer(randomIdx + 1);
    const firstTurnPlayer = activePlayers.length > 2 ? getNextPlayer(randomIdx + 2) : dealerPlayer; 

    const sbAmount = Number(smallBlind);
    const bbAmount = Number(bigBlind);
    const startChips = Number(startingChips);
    const initialPot = sbAmount + bbAmount;

    try {
      // FIX BUG STANDBY: Tambahkan status: 'playing' biar mesin Meja tahu kita resmi main!
      const resetPromises = activePlayers.map(p => 
         supabase.from('players').update({ chips: startChips, current_bet: 0, status: 'playing' }).eq('id', p.id)
      );
      await Promise.all(resetPromises);

      await supabase.from('players')
        .update({ chips: startChips - sbAmount, current_bet: sbAmount, status: 'playing' })
        .eq('id', sbPlayer.id);

      await supabase.from('players')
        .update({ chips: startChips - bbAmount, current_bet: bbAmount, status: 'playing' })
        .eq('id', bbPlayer.id);

      await supabase.from('rooms')
        .update({ 
          status: 'preflop',
          main_pot: initialPot,
          dealer_index: dealerPlayer.seat_index,
          current_turn_index: firstTurnPlayer.seat_index
        })
        .eq('id', roomId);
        
    } catch (error) {
      console.error("Gagal memulai game:", error);
      alert("Ada masalah saat ngatur meja, Pal!");
    }
  };

  const totalCount = players.length;
  const readyCount = players.filter(p => p.status === 'ready' || p.is_host).length;
  const canStart = totalCount > 1 && readyCount === totalCount; 

  return (
    <div className="min-h-screen max-w-md mx-auto bg-gray-950 text-white font-sans flex flex-col relative border-x border-gray-800">
      
      <header className="flex justify-between items-center p-4 border-b border-gray-800 bg-gray-950 z-10">
        <button className="px-4 py-1.5 bg-gray-800 rounded-full border border-gray-600 text-[10px] font-bold hover:bg-gray-700 transition-colors uppercase tracking-widest text-gray-300">
          Menu ≡
        </button>
        <h1 className="text-lg font-black tracking-widest uppercase">Lobby</h1>
        <div className="text-right">
          <p className="text-[8px] text-gray-500 uppercase tracking-widest mb-0.5">Kode Room:</p>
          <p className="font-mono bg-gray-900 px-2 py-0.5 rounded border border-gray-700 text-sm tracking-widest font-bold text-yellow-500">{roomCode}</p>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4 space-y-6">
        <div className="bg-gray-900 border border-gray-700 rounded-2xl p-4 w-full flex items-center justify-between shadow-inner focus-within:border-yellow-500 transition-colors">
          <span className="font-bold text-sm text-gray-300 tracking-wide">Starting Chips</span>
          <div className="flex items-center space-x-2 bg-gray-950 px-3 py-1 rounded-lg border border-gray-700">
            <span className="text-yellow-500 text-lg">🪙</span>
            <input 
              type="number" 
              value={startingChips} 
              onChange={(e) => setStartingChips(e.target.value)}
              onBlur={(e) => handleUpdateSetting('starting_chips', e.target.value)}
              disabled={role !== 'host'}
              className={`bg-transparent w-20 font-mono text-lg font-bold text-yellow-500 text-right outline-none appearance-none [&::-webkit-inner-spin-button]:appearance-none ${role !== 'host' ? 'cursor-default' : 'cursor-text'}`}
              style={{ MozAppearance: 'textfield' }}
            />
            {role === 'host' && <span className="text-gray-600 text-xs ml-1">✎</span>}
          </div>
        </div>

        <div className="flex justify-between items-center px-1">
          <button 
            disabled={role !== 'host'}
            className={`px-5 py-2 rounded-full border text-xs font-bold tracking-widest uppercase transition-colors ${role === 'host' ? 'bg-gray-800 border-gray-600 hover:bg-gray-700 text-gray-200' : 'bg-gray-950 border-gray-800 text-gray-600 cursor-not-allowed'}`}>
            + Add Level
          </button>
          <div className="bg-gray-900 rounded-full border border-gray-700 flex overflow-hidden text-[10px] font-bold uppercase tracking-widest">
            <button className="px-4 py-1.5 bg-gray-800 text-white shadow-inner">Hand</button>
            <button className="px-4 py-1.5 text-gray-500 cursor-not-allowed">Minutes</button>
          </div>
        </div>

        <div className="bg-gray-900 rounded-2xl border border-gray-700 p-4 shadow-inner">
          <div className="grid grid-cols-5 text-[9px] text-center text-gray-500 mb-3 font-black uppercase tracking-wider">
            <span>BB</span>
            <span>SB</span>
            <span>Ante</span>
            <span>Dur</span>
            <span></span>
          </div>
          
          <div className="grid grid-cols-5 text-sm text-center items-center gap-2 mb-2 font-mono font-bold text-blue-300">
            <input 
               type="number" 
               value={bigBlind} 
               onChange={(e) => setBigBlind(e.target.value)} 
               onBlur={(e) => handleUpdateSetting('big_blind', e.target.value)}
               disabled={role !== 'host'}
               className={`bg-gray-950 border border-blue-900/50 rounded py-1 w-full text-center outline-none focus:border-blue-500 transition-colors appearance-none [&::-webkit-inner-spin-button]:appearance-none ${role === 'host' && 'hover:bg-gray-800'}`}
               style={{ MozAppearance: 'textfield' }}
            />
            <input 
               type="number" 
               value={smallBlind} 
               onChange={(e) => setSmallBlind(e.target.value)} 
               onBlur={(e) => handleUpdateSetting('small_blind', e.target.value)}
               disabled={role !== 'host'}
               className={`bg-gray-950 border border-blue-900/50 rounded py-1 w-full text-center outline-none focus:border-blue-500 transition-colors appearance-none [&::-webkit-inner-spin-button]:appearance-none ${role === 'host' && 'hover:bg-gray-800'}`}
               style={{ MozAppearance: 'textfield' }}
            />
            <span className="bg-gray-950 border border-gray-800 rounded py-1 text-gray-600 cursor-not-allowed">0</span>
            <span className="bg-gray-950 border border-gray-800 rounded py-1 text-gray-600 cursor-not-allowed">15</span>
            {role === 'host' ? <button className="text-gray-600 hover:text-red-500 transition-colors text-xs cursor-not-allowed">✕</button> : <span></span>}
          </div>
          
          <div className="grid grid-cols-5 text-sm text-center items-center gap-2 mb-2 font-mono font-bold text-gray-500 opacity-50 pointer-events-none">
            <span className="bg-gray-950 border border-gray-800 rounded py-1">200</span>
            <span className="bg-gray-950 border border-gray-800 rounded py-1">100</span>
            <span className="bg-gray-950 border border-gray-800 rounded py-1">0</span>
            <span className="bg-gray-950 border border-gray-800 rounded py-1">15</span>
            {role === 'host' ? <button className="text-gray-600 text-xs">✕</button> : <span></span>}
          </div>
        </div>

        <div className="flex flex-col items-center mt-8">
          <h3 className="text-[10px] font-black tracking-widest text-gray-500 mb-6 uppercase">
            Players ({readyCount}/{totalCount} Ready)
          </h3>
          
          <div className="relative w-[90%] aspect-[4/3] border-[3px] border-gray-800 bg-gray-900/50 rounded-[3rem] flex items-center justify-center shadow-inner">
            {players.map((p, i) => {
              const positions = [
                "top-[-10px] left-1/2 -translate-x-1/2", 
                "top-[15%] -right-4", 
                "bottom-[15%] -right-4", 
                "bottom-[-10px] left-1/2 -translate-x-1/2", 
                "bottom-[15%] -left-4", 
                "top-[15%] -left-4", 
                "top-[-10px] left-[15%]", 
                "top-[-10px] right-[15%]" 
              ];
              
              const isPlayerReady = p.status === 'ready' || p.is_host;
              
              return (
                <div key={p.id} className={`absolute ${positions[i % 8]} flex flex-col items-center`}>
                  <div className={`px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider border-2 shadow-md transition-all ${isPlayerReady ? 'bg-green-900/40 border-green-500 text-green-400' : 'bg-gray-900 border-gray-600 text-gray-400'}`}>
                    {p.is_host && <span className="mr-1 text-red-500">★</span>}
                    {p.player_name}
                  </div>
                </div>
              );
            })}
            
            <span className="text-gray-600 font-bold tracking-widest text-xs uppercase animate-pulse">
              Menunggu...
            </span>
          </div>
        </div>
      </main>

      <div className="p-4 bg-gray-950 border-t border-gray-800 relative z-20 shadow-[0_-10px_25px_rgba(0,0,0,0.5)]">
        {role === 'host' ? (
          <button 
            onClick={handleStart}
            disabled={!canStart}
            className={`w-full py-4 font-black rounded-2xl tracking-widest text-lg transition-all uppercase shadow-lg ${canStart ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-[0_0_20px_rgba(37,99,235,0.4)] border-2 border-blue-400' : 'bg-gray-800 text-gray-500 border-2 border-gray-700 cursor-not-allowed'}`}>
            {canStart ? 'MULAI PERMAINAN' : 'MENUNGGU SEMUA SIAP'}
          </button>
        ) : (
          <button 
            onClick={toggleReady}
            className={`w-full py-4 font-black rounded-2xl tracking-widest text-lg transition-all uppercase shadow-lg border-2 ${isReady ? 'bg-green-600 hover:bg-green-500 text-white border-green-400 shadow-[0_0_20px_rgba(34,197,94,0.4)]' : 'bg-gray-800 hover:bg-gray-700 text-gray-300 border-gray-600'}`}>
            {isReady ? 'BATAL SIAP' : 'SAYA SIAP!'}
          </button>
        )}
      </div>

    </div>
  );
}

export default Lobby;