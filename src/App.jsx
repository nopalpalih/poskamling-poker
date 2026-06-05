import React, { useState } from 'react';
import LandingPage from './LandingPage';
import Lobby from './Lobby';
import MejaPermainan from './MejaPermainan';

function App() {
  const [layarAktif, setLayarAktif] = useState('home');
  
  const [sessionData, setSessionData] = useState({
    roomData: null,
    playerName: '',
    role: ''
  });

  const handleRoomJoined = (roomData, playerName, role) => {
    setSessionData({ roomData, playerName, role });
    setLayarAktif('lobby'); 
  };

  const handleStartMatch = (updatedRoomData) => {
    setSessionData(prev => ({ ...prev, roomData: updatedRoomData }));
    setLayarAktif('meja'); 
  };

  // FUNGSI BARU: Buat narik player balik ke Lobby pas Restart ditekan
  const handleRestartToLobby = () => {
    setLayarAktif('lobby');
  };

  // Fungsi buat Exit beneran
  const handleExitToHome = () => {
    setSessionData({ roomData: null, playerName: '', role: '' });
    setLayarAktif('home');
  };

  return (
    <div className="relative min-h-screen bg-black flex justify-center">
      

      <div className="w-full max-w-md bg-gray-950 overflow-hidden relative shadow-[0_0_40px_rgba(0,0,0,0.5)] border-x border-gray-900">
        
        {layarAktif === 'home' && <LandingPage onRoomCreated={handleRoomJoined} />}
        {layarAktif === 'lobby' && <Lobby sessionData={sessionData} onStartMatch={handleStartMatch} />}
        
        {/* Meja Permainan sekarang dikasih akses ke fungsi Restart & Exit */}
        {layarAktif === 'meja' && (
           <MejaPermainan 
              sessionData={sessionData} 
              onRestartToLobby={handleRestartToLobby}
              onExitToHome={handleExitToHome}
           />
        )}
        
      </div>
    </div>
  );
}

export default App;