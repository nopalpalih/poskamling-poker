import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient'; 

function MejaPermainan({ sessionData, onRestartToLobby, onExitToHome }) {
  
  const myName = sessionData?.playerName || 'Nama Host';
  const myRole = sessionData?.role || 'host';
  const roomId = sessionData?.roomData?.id; 
  const roomCode = sessionData?.roomData?.room_code || '------';

  const [tablePlayers, setTablePlayers] = useState({});
  const [roomState, setRoomState] = useState(null); 

  const [showMenu, setShowMenu] = useState(false);
  const [role, setRole] = useState(myRole); 
  
  const [showRaiseModal, setShowRaiseModal] = useState(false);
  const [betAmount, setBetAmount] = useState(0);

  const [mainWinners, setMainWinners] = useState([]);
  const [showWinner, setShowWinner] = useState(false);
  const [grandWinnerName, setGrandWinnerName] = useState("");
  
  const [rebuyAmount, setRebuyAmount] = useState(5000);
  
  // STATE BARU UNTUK MODAL INFORMASI ATURAN
  const [showInfoModal, setShowInfoModal] = useState(false);

  const myPlayerData = Object.values(tablePlayers).find(p => p.player_name === myName);
  const mySeatIndex = myPlayerData?.seat_index;
  const isMyTurn = roomState?.current_turn_index === mySeatIndex;

  // SINKRONISASI UTAMA
  useEffect(() => {
    if (!roomId) return;

    const fetchData = async () => {
      const { data: pData } = await supabase.from('players').select('*').eq('room_id', roomId);
      if (pData) {
        const playersObj = {};
        pData.forEach(p => { playersObj[p.seat_index] = p; });
        setTablePlayers(playersObj);
        
        const myLatestData = pData.find(p => p.player_name === myName);
        if (myLatestData && myLatestData.is_host && role !== 'host') {
            setRole('host');
        }
      }
      const { data: rData } = await supabase.from('rooms').select('*').eq('id', roomId).single();
      if (rData) setRoomState(rData);
    };

    fetchData();

    const playerChannel = supabase.channel(`meja_players_${roomId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `room_id=eq.${roomId}` }, (payload) => {
          setTablePlayers(prev => {
            const newPlayers = { ...prev };
            if (payload.eventType === 'DELETE') {
               const deletedId = payload.old.id;
               const seatToDelete = Object.keys(newPlayers).find(key => newPlayers[key].id === deletedId);
               if (seatToDelete) delete newPlayers[seatToDelete];
            } else {
               newPlayers[payload.new.seat_index] = payload.new;
            }
            return newPlayers;
          });
          
          if (payload.new && payload.new.player_name === myName && payload.new.is_host && role !== 'host') {
             setRole('host');
          }
        }).subscribe();

    const roomChannel = supabase.channel(`meja_room_${roomId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` }, (payload) => {
          setRoomState(payload.new);
          if (payload.new.status === 'restarting') {
             if (onRestartToLobby) onRestartToLobby();
          }
        }).subscribe();

    return () => {
      supabase.removeChannel(playerChannel);
      supabase.removeChannel(roomChannel);
    };
  }, [roomId, myName, role, onRestartToLobby]);

  // SENSOR PEMENANG MUTLAK
  useEffect(() => {
    const activeOrBankrupt = Object.values(tablePlayers).filter(p => p.status !== 'surrendered' && p.status !== 'waiting');
    if (Object.keys(tablePlayers).length > 1 && activeOrBankrupt.length === 1) {
      const champ = activeOrBankrupt[0];
      if (champ.chips > 0) {
         setGrandWinnerName(champ.player_name);
         setShowWinner(true);
      }
    }
  }, [tablePlayers]);

  // MESIN AUTO-START
  useEffect(() => {
    const checkAndAutoStart = async () => {
       if (role === 'host' && roomState?.status === 'waiting') {
           const playersArr = Object.values(tablePlayers);
           const bankrupts = playersArr.filter(p => p.status === 'bankrupt');
           const eligibles = playersArr.filter(p => p.status !== 'surrendered' && p.chips > 0);

           if (bankrupts.length === 0 && eligibles.length >= 2) {
               startNewHandFromWaiting(eligibles);
           }
       }
    };
    checkAndAutoStart();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tablePlayers, roomState?.status, role]);

  const startNewHandFromWaiting = async (eligiblePlayers) => {
      const activeSeatsList = eligiblePlayers.map(p => p.seat_index).sort((a,b) => a-b);
      const oldDealerPos = roomState.dealer_index || activeSeatsList[0];

      const nextSeats = activeSeatsList.filter(s => s > oldDealerPos);
      const nextDealerSeat = nextSeats.length > 0 ? nextSeats[0] : activeSeatsList[0];
      const currentDealerPos = activeSeatsList.indexOf(nextDealerSeat);

      const getSeat = (idxOffset) => activeSeatsList[(currentDealerPos + idxOffset) % activeSeatsList.length];

      let nextSbSeat, nextBbSeat, firstTurnSeat;
      if (activeSeatsList.length === 2) {
        nextSbSeat = nextDealerSeat;
        nextBbSeat = getSeat(1);
        firstTurnSeat = nextDealerSeat; 
      } else {
        nextSbSeat = getSeat(1);
        nextBbSeat = getSeat(2);
        firstTurnSeat = getSeat(3);
      }

      const sbAmount = roomState?.small_blind || 50;
      const bbAmount = roomState?.big_blind || 100;
      const initialPot = sbAmount + bbAmount;

      const updatePromises = eligiblePlayers.map(p => {
        let newChips = p.chips;
        let newBet = 0;
        let newStatus = 'playing';

        if (p.seat_index === nextSbSeat) {
            const deduct = Math.min(sbAmount, newChips);
            newChips -= deduct;
            newBet = deduct;
        }
        if (p.seat_index === nextBbSeat) {
            const deduct = Math.min(bbAmount, newChips);
            newChips -= deduct;
            newBet = deduct;
        }
        if (newChips === 0 && p.chips > 0) newStatus = 'all-in'; 

        return supabase.from('players').update({
          chips: newChips,
          current_bet: newBet,
          status: newStatus 
        }).eq('id', p.id);
      });

      await Promise.all(updatePromises);

      await supabase.from('rooms').update({
        status: 'preflop',
        main_pot: initialPot,
        dealer_index: nextDealerSeat,
        current_turn_index: firstTurnSeat,
        last_snapshot: null
      }).eq('id', roomId);
  };

  const getFirstTurn = (dealerIndex, inHandArray) => {
    const seats = inHandArray.filter(p => p.status === 'playing' || p.status === 'acted').map(p => p.seat_index).sort((a,b) => a-b);
    if (seats.length === 0) return dealerIndex; 
    const pos = seats.findIndex(s => s > dealerIndex);
    return pos !== -1 ? seats[pos] : seats[0];
  };

  const getNextActiveSeat = (currentIndex) => {
    const activeSeats = Object.values(tablePlayers)
      .filter(p => p.status === 'playing' || p.status === 'acted')
      .map(p => p.seat_index)
      .sort((a, b) => a - b);

    if (activeSeats.length <= 1) return currentIndex; 
    const pos = activeSeats.indexOf(currentIndex);
    return pos !== -1 ? activeSeats[(pos + 1) % activeSeats.length] : activeSeats[0];
  };

  // MESIN JEPRET FOTO (UNDO PREPARATION)
  const saveSnapshot = async () => {
    const snapshot = {
      room: {
        main_pot: roomState.main_pot,
        status: roomState.status,
        current_turn_index: roomState.current_turn_index,
        dealer_index: roomState.dealer_index
      },
      players: Object.values(tablePlayers).map(p => ({
        id: p.id,
        chips: p.chips,
        current_bet: p.current_bet,
        status: p.status
      }))
    };
    await supabase.from('rooms').update({ last_snapshot: snapshot }).eq('id', roomId);
  };

  const triggerNextPhase = async (inHandData, newPotAmount, fastForwardToShowdown = false) => {
    const phases = ['preflop', 'flop', 'turn', 'river', 'showdown'];
    const currentIdx = phases.indexOf(roomState.status);
    let nextPhase = phases[currentIdx + 1];

    if (fastForwardToShowdown) nextPhase = 'showdown';

    if (nextPhase === 'showdown') {
      await supabase.from('rooms').update({ main_pot: newPotAmount, status: 'showdown' }).eq('id', roomId);
    } else {
      const phaseUpdates = inHandData.map(p => {
        if (p.status === 'all-in') return null;
        return supabase.from('players').update({ current_bet: 0, status: 'playing' }).eq('id', p.id);
      }).filter(Boolean);
      await Promise.all(phaseUpdates);

      const firstTurn = getFirstTurn(roomState.dealer_index, inHandData);

      await supabase.from('rooms').update({
        main_pot: newPotAmount,
        status: nextPhase,
        current_turn_index: firstTurn
      }).eq('id', roomId);
    }
  };

  const handleAction = async (actionType, intendedAmount = 0) => {
    if (!isMyTurn || !myPlayerData || roomState?.status === 'waiting') return; 

    await saveSnapshot();

    const actualAmount = Math.min(intendedAmount, myPlayerData.chips);
    const isAllIn = (actualAmount === myPlayerData.chips && actualAmount > 0);
    const myNewBet = myPlayerData.current_bet + actualAmount;
    
    const highestBetBefore = Math.max(...Object.values(tablePlayers).filter(p => ['playing', 'acted', 'all-in'].includes(p.status)).map(p => p.current_bet || 0), 0);
    const isRaise = myNewBet > highestBetBefore;

    const nextTurn = getNextActiveSeat(mySeatIndex);

    try {
      const virtualPlayers = Object.values(tablePlayers).map(p => {
        if (p.id === myPlayerData.id) {
            if (actionType === 'fold') return { ...p, status: 'folded' };
            const myNewStatus = isAllIn ? 'all-in' : 'acted';
            return { ...p, chips: p.chips - actualAmount, current_bet: myNewBet, status: myNewStatus };
        }
        if (isRaise && p.status === 'acted') {
            return { ...p, status: 'playing' }; 
        }
        return p;
      });

      const playerUpdates = virtualPlayers.map(p => {
        if (p.id === myPlayerData.id) {
            return supabase.from('players').update({ chips: p.chips, current_bet: p.current_bet, status: p.status }).eq('id', p.id);
        }
        if (isRaise && p.status === 'playing') {
            return supabase.from('players').update({ status: 'playing' }).eq('id', p.id);
        }
        return null;
      }).filter(Boolean);

      await Promise.all(playerUpdates);

      const inHandPlayers = virtualPlayers.filter(p => ['playing', 'acted', 'all-in'].includes(p.status));
      const newPot = roomState.main_pot + actualAmount;
      const newHighestBet = Math.max(...inHandPlayers.map(p => p.current_bet || 0), 0);

      if (inHandPlayers.length === 1) {
          await triggerNextPhase(inHandPlayers, newPot, true);
          return;
      }

      const isAllSettled = inHandPlayers.every(p => {
          if (p.status === 'all-in') return true;
          return p.status === 'acted' && p.current_bet === newHighestBet;
      });

      if (isAllSettled) {
          const bettors = inHandPlayers.filter(p => p.status !== 'all-in');
          let shouldFastForward = bettors.length <= 1;
          let shouldNextPhase = true;

          const bbAmount = roomState?.big_blind || 100;

          if (!shouldFastForward && roomState.status === 'preflop' && newHighestBet === bbAmount) {
              const activeSeatsIdx = inHandPlayers.map(p => p.seat_index).sort((a,b)=>a-b);
              const dealerPos = activeSeatsIdx.indexOf(roomState.dealer_index);
              const bbIndex = activeSeatsIdx.length === 2 ? activeSeatsIdx[(dealerPos + 1) % 2] : activeSeatsIdx[(dealerPos + 2) % activeSeatsIdx.length];
              const bbPlayer = inHandPlayers.find(p => p.seat_index === bbIndex);

              if (bbPlayer && bbPlayer.status !== 'acted' && bbPlayer.status !== 'all-in') {
                  shouldNextPhase = false;
              }
          }

          if (shouldFastForward) {
              await triggerNextPhase(inHandPlayers, newPot, true);
          } else if (shouldNextPhase) {
              await triggerNextPhase(inHandPlayers, newPot, false);
          } else {
              await supabase.from('rooms').update({ main_pot: newPot, current_turn_index: nextTurn }).eq('id', roomId);
          }
      } else {
          await supabase.from('rooms').update({ main_pot: newPot, current_turn_index: nextTurn }).eq('id', roomId);
      }

    } catch (error) {
      console.error("Gagal melakukan aksi:", error);
    }
  };

  const handleRebuy = async () => {
     try {
       await supabase.from('players').update({ 
         chips: Number(rebuyAmount),
         status: 'ready'
       }).eq('id', myPlayerData.id);
     } catch(err) {
       console.error("Gagal Rebuy:", err);
     }
  };

  const handleSurrender = async () => {
    try {
      await supabase.from('players').update({ 
        status: 'surrendered',
        chips: 0,
        current_bet: 0
      }).eq('id', myPlayerData.id);
    } catch(err) {
      console.error("Gagal Surrender:", err);
    }
  };

  const handleRestartAll = async () => {
    if (role !== 'host') return;
    try {
      const defaultChips = roomState?.starting_chips || 10000;
      const resetPromises = Object.values(tablePlayers).map(p => 
        supabase.from('players').update({ chips: defaultChips, current_bet: 0, status: 'waiting', is_host: p.id === myPlayerData.id }).eq('id', p.id)
      );
      await Promise.all(resetPromises);
      await supabase.from('rooms').update({ status: 'restarting', main_pot: 0, current_turn_index: 0, dealer_index: 0 }).eq('id', roomId);
      setShowMenu(false);
    } catch (err) {
      console.error("Gagal Restart:", err);
    }
  };

  const handleExitGame = async () => {
    try {
      if (role === 'host') {
         const otherPlayers = Object.values(tablePlayers).filter(p => p.id !== myPlayerData.id && p.status !== 'surrendered');
         if (otherPlayers.length > 0) {
            await supabase.from('players').update({ is_host: true }).eq('id', otherPlayers[0].id);
         }
      }
      
      const isPlayingPhase = ['preflop', 'flop', 'turn', 'river'].includes(roomState?.status);
      
      if (isPlayingPhase) {
         if (isMyTurn) {
            await handleAction('fold');
            await new Promise(resolve => setTimeout(resolve, 500)); 
         }
         await supabase.from('players').update({ status: 'surrendered' }).eq('id', myPlayerData.id);
      } else {
         await supabase.from('players').delete().eq('id', myPlayerData.id);
      }

      if(onExitToHome) onExitToHome();
      
    } catch (err) {
      console.error("Gagal Exit:", err);
    }
  };

  const handleNextHand = async () => {
    if (mainWinners.length === 0) {
      alert("Pilih pemenangnya dulu dong, Pal!");
      return;
    }

    await saveSnapshot();

    const splitAmount = Math.floor(roomState.main_pot / mainWinners.length);

    try {
      const surrenderedPlayers = Object.values(tablePlayers).filter(p => p.status === 'surrendered');
      if (surrenderedPlayers.length > 0) {
          const deletePromises = surrenderedPlayers.map(p => supabase.from('players').delete().eq('id', p.id));
          await Promise.all(deletePromises);
      }

      const futurePlayersData = Object.values(tablePlayers).map(p => {
         let futureChips = p.chips;
         if (mainWinners.includes(p.player_name)) {
             futureChips += splitAmount;
         }
         return { ...p, chips: futureChips };
      });

      const eligiblePlayers = futurePlayersData.filter(p => p.status !== 'surrendered' && (p.chips > 0 || p.status === 'ready'));
      const isGameOver = eligiblePlayers.length < 2;

      if (isGameOver) {
          const updatePromises = futurePlayersData.map(p => {
              if (p.status === 'surrendered') return null;
              let nextStatus = (p.chips === 0 ? 'bankrupt' : 'ready');
              return supabase.from('players').update({ chips: p.chips, current_bet: 0, status: nextStatus }).eq('id', p.id);
          }).filter(Boolean);
          await Promise.all(updatePromises);
          
          await supabase.from('rooms').update({ status: 'waiting', main_pot: 0 }).eq('id', roomId);
          setMainWinners([]);
          return; 
      }

      const activeSeatsList = eligiblePlayers.map(p => p.seat_index).sort((a,b) => a-b);
      const oldDealerPos = roomState.dealer_index;
      const nextSeats = activeSeatsList.filter(s => s > oldDealerPos);
      const nextDealerSeat = nextSeats.length > 0 ? nextSeats[0] : activeSeatsList[0];
      const currentDealerPos = activeSeatsList.indexOf(nextDealerSeat);
      
      let nextSbSeat, nextBbSeat, firstTurnSeat;
      const getSeat = (idxOffset) => activeSeatsList[(currentDealerPos + idxOffset) % activeSeatsList.length];

      if (activeSeatsList.length === 2) {
        nextSbSeat = nextDealerSeat;
        nextBbSeat = getSeat(1);
        firstTurnSeat = nextDealerSeat; 
      } else {
        nextSbSeat = getSeat(1);
        nextBbSeat = getSeat(2);
        firstTurnSeat = getSeat(3);
      }

      const sbAmount = roomState?.small_blind || 50;
      const bbAmount = roomState?.big_blind || 100;
      const initialPot = sbAmount + bbAmount;

      const updatePromises = futurePlayersData.map(p => {
        if (p.status === 'surrendered') return null;

        let newChips = p.chips;
        let newBet = 0;
        let newStatus = 'playing';

        if (newChips <= 0 && p.status !== 'ready') {
            newStatus = 'bankrupt';
        } else {
            if (p.seat_index === nextSbSeat) {
                const deduct = Math.min(sbAmount, newChips);
                newChips -= deduct;
                newBet = deduct;
            }
            if (p.seat_index === nextBbSeat) {
                const deduct = Math.min(bbAmount, newChips);
                newChips -= deduct;
                newBet = deduct;
            }
            if (newChips === 0 && p.chips > 0) newStatus = 'all-in'; 
        }

        return supabase.from('players').update({
          chips: newChips,
          current_bet: newBet,
          status: newStatus 
        }).eq('id', p.id);
      }).filter(Boolean);

      await Promise.all(updatePromises);

      await supabase.from('rooms').update({
        status: 'preflop',
        main_pot: initialPot,
        dealer_index: nextDealerSeat,
        current_turn_index: firstTurnSeat
      }).eq('id', roomId);

      setMainWinners([]);

    } catch (error) {
      console.error("Gagal Next Hand:", error);
      alert("Waduh, gagal narik uang pot nih!");
    }
  };

  // MESIN EKSEKUSI UNDO 1 LANGKAH
  const handleUndo = async () => {
    if (role !== 'host') return;
    const snap = roomState?.last_snapshot;
    
    if (!snap) {
       alert("Sabar Pal, nggak ada aksi yang bisa di-undo lagi!");
       return;
    }

    try {
       const playerUpdates = snap.players.map(p => 
          supabase.from('players').update({ chips: p.chips, current_bet: p.current_bet, status: p.status }).eq('id', p.id)
       );
       await Promise.all(playerUpdates);
       
       await supabase.from('rooms').update({
          main_pot: snap.room.main_pot,
          status: snap.room.status,
          current_turn_index: snap.room.current_turn_index,
          dealer_index: snap.room.dealer_index,
          last_snapshot: null
       }).eq('id', roomId);
       
       setShowMenu(false);
    } catch (err) {
       console.error("Gagal Undo:", err);
       alert("Gagal Undo Pal, koneksi ke Supabase macet.");
    }
  };

  const bbAmount = roomState?.big_blind || 100;
  const highestBet = Math.max(...Object.values(tablePlayers).filter(p => ['playing', 'acted', 'all-in'].includes(p.status)).map(p => p.current_bet || 0), 0);
  const myCurrentBet = myPlayerData?.current_bet || 0;
  
  let callAmount = Math.max(0, highestBet - myCurrentBet);
  const isAllInCall = callAmount >= (myPlayerData?.chips || 0);
  callAmount = Math.min(callAmount, myPlayerData?.chips || 0);
  const isCheck = callAmount === 0;

  const maxBet = myPlayerData?.chips ? myPlayerData.chips + myCurrentBet : bbAmount; 
  let baseMinRaise = highestBet === 0 ? bbAmount : highestBet * 2;
  const minRaise = Math.min(baseMinRaise, maxBet);

  useEffect(() => {
    if (showRaiseModal) setBetAmount(minRaise);
  }, [showRaiseModal, minRaise]);

  const handleMin = () => setBetAmount(minRaise);
  const handleMax = () => setBetAmount(maxBet);
  const handlePot = () => setBetAmount(roomState?.main_pot || 0);
  const handlePlus = () => setBetAmount(prev => Math.min(Number(prev) + 1, maxBet));
  const handleMinus = () => setBetAmount(prev => Math.max(Number(prev) - 1, minRaise));
  const handleBlur = () => {
    let val = Number(betAmount);
    if (val < minRaise) setBetAmount(minRaise);
    else if (val > maxBet) setBetAmount(maxBet);
  };

  const toggleWinner = (potType, player) => {
    if (role !== 'host') return; 
    if (potType === 'main') {
      setMainWinners(prev => prev.includes(player) ? prev.filter(p => p !== player) : [...prev, player]);
    }
  };

  const activeSeatsList = Object.values(tablePlayers).filter(p => p.status !== 'folded' && p.status !== 'surrendered' && p.status !== 'bankrupt').map(p => p.seat_index).sort((a, b) => a - b);
  let sbIndex = -1;
  let bbIndex = -1;
  if (roomState && activeSeatsList.length > 1) {
    const dealerIdx = roomState.dealer_index;
    const dealerPos = activeSeatsList.indexOf(dealerIdx);
    if (dealerPos !== -1) {
      if (activeSeatsList.length === 2) {
        sbIndex = activeSeatsList[dealerPos];
        bbIndex = activeSeatsList[(dealerPos + 1) % 2];
      } else {
        sbIndex = activeSeatsList[(dealerPos + 1) % activeSeatsList.length];
        bbIndex = activeSeatsList[(dealerPos + 2) % activeSeatsList.length];
      }
    }
  }

  const renderPlayerSeat = (seatNumber, alignmentClasses) => {
    const player = tablePlayers[seatNumber];
    const isDealer = roomState?.dealer_index === seatNumber;
    const isSB = sbIndex === seatNumber;
    const isBB = bbIndex === seatNumber;
    const isMyTurnRender = roomState?.current_turn_index === seatNumber;
    const isMe = player?.player_name === myName;
    const isFolded = player?.status === 'folded';
    const isPlayerAllIn = player?.status === 'all-in';
    const isSurrendered = player?.status === 'surrendered';
    const isStandby = player?.status === 'ready' || player?.status === 'waiting';

    return (
      <div className={`absolute ${alignmentClasses} flex flex-col items-center z-20 transition-all duration-300 ${isMyTurnRender && !isFolded && !isSurrendered && !isStandby && roomState?.status !== 'showdown' && roomState?.status !== 'waiting' ? 'scale-110' : ''} ${isFolded || isStandby ? 'opacity-40 grayscale' : isSurrendered ? 'opacity-20 grayscale' : ''}`}>
        <div className={`bg-gray-900 rounded-2xl p-2 px-4 text-center shadow-lg relative min-w-[85px] transition-all 
          ${player ? 'border-2' : 'border border-gray-700 opacity-40'}
          ${isMyTurnRender && !isFolded && !isSurrendered && !isStandby && roomState?.status !== 'showdown' && roomState?.status !== 'waiting' ? 'border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.6)] z-30' : (isMe ? 'border-blue-500' : 'border-gray-600')}
        `}>
          
          {isDealer && !isFolded && !isSurrendered && !isStandby && (
            <div className="absolute -top-2 -right-2 w-5 h-5 bg-white text-black text-[10px] font-extrabold rounded-full flex items-center justify-center shadow-md z-30 ring-2 ring-gray-900">D</div>
          )}
          
          <div className="text-[10px] font-bold text-gray-300 uppercase tracking-wider truncate max-w-[70px] mx-auto">
            {player ? player.player_name : 'KOSONG'}
          </div>
          
          <div className="font-mono text-sm font-bold text-yellow-500">
            {player ? player.chips : '0'}
          </div>

          {player && (
             <div className={`absolute -bottom-2.5 left-1/2 -translate-x-1/2 border text-[9px] rounded-full px-3 py-0.5 font-bold uppercase shadow-sm whitespace-nowrap
               ${isSurrendered ? 'bg-red-950 border-red-900 text-red-700' :
                 isStandby ? 'bg-gray-800 border-gray-500 text-gray-400' :
                 isFolded ? 'bg-gray-800 border-gray-600 text-gray-500' :
                 isPlayerAllIn ? 'bg-red-900 border-red-500 text-red-100 animate-pulse' :
                 isSB ? 'bg-gray-800 border-blue-400 text-blue-400' : 
                 isBB ? 'bg-gray-800 border-purple-400 text-purple-400' : 
                 player.current_bet > 0 ? 'bg-gray-800 border-yellow-500 text-yellow-500' : 
                 'bg-gray-800 border-gray-500 text-gray-500'}`}>
               {isSurrendered ? 'SURRENDER' : isStandby ? 'STANDBY' : isFolded ? 'FOLD' : isPlayerAllIn ? 'ALL-IN' : isSB ? 'SB' : isBB ? 'BB' : player.current_bet > 0 ? 'BET' : 'WAIT'}
             </div>
          )}

          {isMe && <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-6 h-1 bg-blue-500 rounded-full"></div>}
        </div>
        
        {player && player.current_bet > 0 && !isFolded && !isSurrendered && !isStandby && (
          <div className="mt-4 text-[11px] font-mono font-bold text-yellow-500 flex items-center gap-1 bg-gray-950/80 px-2 py-0.5 rounded border border-yellow-500/30">
            🪙 {player.current_bet}
          </div>
        )}
      </div>
    );
  };

  const currentPhase = roomState?.status || 'waiting';
  const numCardsOpen = currentPhase === 'flop' ? 3 : currentPhase === 'turn' ? 4 : (currentPhase === 'river' || currentPhase === 'showdown') ? 5 : 0;
  const isShowdown = currentPhase === 'showdown';
  const isBankruptState = myPlayerData?.status === 'bankrupt';
  const isSurrenderedState = myPlayerData?.status === 'surrendered';
  const isStandbyState = myPlayerData?.status === 'ready' || myPlayerData?.status === 'waiting';
  const isPlayingPhase = ['preflop', 'flop', 'turn', 'river'].includes(roomState?.status);

  return (
    <div className="min-h-screen max-w-md mx-auto bg-gray-950 text-white font-sans flex flex-col relative border-x border-gray-800 overflow-hidden">
      
      <header className="flex justify-between items-center p-3 px-4 border-b border-gray-700 bg-gray-950/90 z-20 relative shadow-md">
        <div className="flex items-center gap-2 flex-wrap z-10 max-w-[65%]">
          <button onClick={() => setShowMenu(true)} className="px-3 py-1 bg-gray-800 border border-gray-600 hover:bg-gray-700 rounded-full text-[10px] font-bold flex items-center shadow-sm text-gray-200">Menu ≡</button>
          
          {/* TOMBOL (i) UNTUK ATURAN KARTU */}
          <button onClick={() => setShowInfoModal(true)} className="w-6 h-6 rounded-full border border-gray-500 flex items-center justify-center font-serif italic text-xs font-bold text-gray-300 hover:bg-gray-700 shadow-sm bg-gray-800">i</button>
          
          {role === 'host' && roomState?.status === 'waiting' && (
             <button onClick={() => setShowShowdown(true)} className="text-[8px] uppercase tracking-widest px-2 py-1 rounded border font-bold bg-yellow-900/50 border-yellow-500 text-yellow-400 animate-pulse">
               BUKA SHOWDOWN
             </button>
          )}
        </div>
        <div className="absolute left-1/2 -translate-x-1/2 pointer-events-none z-0 mt-8 sm:mt-0">
          <h1 className="text-xl font-black tracking-widest uppercase text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.2)]">
            {roomState?.status?.toUpperCase() || 'WAITING'}
          </h1>
        </div>
        <div className="flex flex-col items-end gap-1 z-10">
          <div className="flex items-center gap-1.5 text-[9px] font-mono"><span className="text-gray-500 uppercase tracking-widest">Lvl 1</span><span className="text-green-400 font-bold bg-green-900/20 px-1.5 py-0.5 rounded border border-green-800/50">{roomState?.big_blind || 100}/{roomState?.small_blind || 50}</span></div>
          <div className="flex items-center gap-1.5 text-[9px] font-mono"><span className="text-gray-500 uppercase tracking-widest">Time</span><span className="text-red-400 font-bold bg-red-900/20 px-1.5 py-0.5 rounded border border-red-800/50 flex items-center gap-1">14:59 <span className="text-[7px] bg-red-500/20 px-0.5 rounded-sm">⏸</span></span></div>
        </div>
      </header>

      <div className="px-5 py-2.5 bg-gradient-to-b from-gray-900 to-transparent z-10 flex justify-between items-center">
        <div className="flex flex-col">
          <div className="font-bold text-sm text-gray-200 tracking-wide uppercase">{myName}</div>
          <div className="text-yellow-500 font-bold font-mono text-sm flex items-center gap-1 mt-0.5">
             <span className="text-[11px]">🪙</span> {myPlayerData?.chips || '0'}
          </div>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-[8px] font-black text-gray-500 tracking-widest uppercase mb-0.5">Room Code</span>
          <span className="font-mono font-bold text-gray-200 bg-gray-800 border border-gray-600 px-2 py-0.5 rounded-md tracking-wider">{roomCode}</span>
        </div>
      </div>

      <main className="flex-1 relative flex items-center justify-center p-4 py-2">
        <div className="relative w-[82%] aspect-[2/3] max-h-[52vh] border-[3px] border-gray-700 bg-gray-800/40 rounded-[4rem] flex flex-col items-center justify-center shadow-2xl">
          
          <div className="absolute top-[28%] flex flex-col items-center z-10">
             <span className="bg-gray-900 border border-gray-600 px-5 py-1.5 rounded-full text-gray-300 font-bold font-mono text-xs shadow-inner flex items-center gap-2">
               Main Pot: <span className="text-yellow-500 text-sm">{roomState?.main_pot || 0}</span>
             </span>
          </div>

          <div className="absolute top-1/2 -translate-y-1/2 flex space-x-2 w-full justify-center px-4 mt-2">
            {[...Array(5)].map((_, i) => (
               <div key={i} className={`w-8 h-11 rounded flex items-center justify-center transition-all duration-500 ${i < numCardsOpen ? 'bg-white border-2 border-gray-300 shadow-[0_0_15px_rgba(255,255,255,0.2)]' : 'border-2 border-dashed border-gray-600 opacity-50'}`}>
                 {i < numCardsOpen && <span className="text-black text-xl">🂠</span>}
               </div>
            ))}
          </div>

          {renderPlayerSeat(1, "top-[8%] -right-6")}
          {renderPlayerSeat(2, "top-1/2 -translate-y-1/2 -right-6 mt-2")}
          {renderPlayerSeat(3, "bottom-[8%] -right-6")}
          {renderPlayerSeat(4, "-bottom-6 left-1/2 -translate-x-1/2")}
          {renderPlayerSeat(5, "bottom-[8%] -left-6")}
          {renderPlayerSeat(6, "top-1/2 -translate-y-1/2 -left-6 mt-2")}
          {renderPlayerSeat(7, "top-[8%] -left-6")}
          {renderPlayerSeat(8, "-top-6 left-1/2 -translate-x-1/2")}

        </div>
      </main>

      <div className="bg-gray-900 border-t border-gray-700 relative mt-auto z-30 pt-8 pb-6 px-4 rounded-t-3xl shadow-[0_-10px_25px_rgba(0,0,0,0.5)] min-h-[140px] flex flex-col justify-center">

        {isSurrenderedState ? (
          <div className="flex flex-col items-center justify-center w-full px-4 mt-[-10px] animate-in slide-in-from-bottom-5">
             <div className="text-red-500 font-black tracking-widest text-2xl uppercase mb-2">🏳️ MENYERAH 🏳️</div>
             <p className="text-gray-500 text-xs text-center font-bold tracking-widest">Kamu bisa jadi penonton aja sekarang, Pal.</p>
          </div>
        ) : isBankruptState ? (
          <div className="flex flex-col items-center justify-center space-y-4 w-full px-4 mt-[-10px] animate-in slide-in-from-bottom-5">
             <div className="text-red-400 font-bold tracking-widest text-sm uppercase mb-[-10px]">⚠️ Saldo Habis ⚠️</div>
             <div className="bg-gray-950 border-2 border-gray-600 rounded-2xl p-3 w-full flex items-center justify-center relative focus-within:border-blue-500 transition-all shadow-inner">
                <span className="absolute left-5 text-2xl">🪙</span>
                <input type="number" value={rebuyAmount} onChange={(e) => setRebuyAmount(e.target.value)} className="text-4xl font-mono font-black text-white bg-transparent text-center w-full outline-none appearance-none [&::-webkit-inner-spin-button]:appearance-none tracking-widest pl-4" style={{ MozAppearance: 'textfield' }} />
             </div>
             <div className="grid grid-cols-2 gap-3 w-full">
                <button onClick={handleSurrender} className="w-full bg-gray-800 hover:bg-gray-700 border-2 border-gray-600 rounded-2xl py-3 text-red-400 text-sm font-black tracking-widest transition-colors uppercase">Menyerah 🏳️</button>
                <button onClick={handleRebuy} className="w-full bg-green-600 hover:bg-green-500 border-2 border-green-400 rounded-2xl py-3 text-white text-lg font-black tracking-widest shadow-[0_0_15px_rgba(34,197,94,0.4)] transition-colors uppercase">Top Up</button>
             </div>
          </div>
        ) : isStandbyState ? (
          roomState?.status === 'waiting' ? (
             <div className="flex flex-col items-center justify-center w-full px-4 mt-[-10px] animate-in slide-in-from-bottom-5">
                <div className="text-yellow-500 font-black tracking-widest text-xl uppercase mb-2">MENUNGGU PEMAIN...</div>
                <p className="text-gray-500 text-xs text-center font-bold tracking-widest">Sistem nunggu pemain yang bangkrut milih Top Up/Nyerah.</p>
             </div>
          ) : (
             <div className="flex flex-col items-center justify-center w-full px-4 mt-[-10px] animate-in slide-in-from-bottom-5">
                <div className="text-blue-400 font-black tracking-widest text-xl uppercase mb-2">STANDBY</div>
                <p className="text-gray-500 text-xs text-center font-bold tracking-widest">Sabar Pal, nunggu putaran ini selesai dulu...</p>
             </div>
          )
        ) : (
          <>
            {!isPlayingPhase && !isShowdown && !isBankruptState && !isSurrenderedState && (
                <div className="absolute -top-12 left-1/2 -translate-x-1/2 z-40 bg-gray-800 border border-gray-600 px-6 py-2 rounded-full text-xs font-bold text-gray-300 tracking-widest uppercase whitespace-nowrap shadow-lg animate-pulse">
                    Menunggu Keputusan...
                </div>
            )}
            
            <div className="absolute -top-6 left-1/2 -translate-x-1/2 z-40">
              <button 
                onClick={() => isMyTurn && setShowRaiseModal(true)} 
                disabled={!isMyTurn || !isPlayingPhase || myPlayerData?.chips === 0}
                className={`rounded-full px-10 py-2.5 text-lg font-black tracking-widest uppercase transition-colors 
                ${isMyTurn && isPlayingPhase && myPlayerData?.chips > 0 ? 'bg-green-600 border-2 border-green-400 text-white shadow-[0_0_15px_rgba(34,197,94,0.4)] hover:bg-green-500 cursor-pointer' : 'bg-gray-800 border-2 border-gray-600 text-gray-500 cursor-not-allowed'}`}>
                Raise
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4 h-24">
              <button 
                onClick={() => handleAction('call', callAmount)}
                disabled={!isMyTurn || !isPlayingPhase}
                className={`border rounded-2xl flex flex-col items-center justify-center shadow-lg transition-colors
                ${isMyTurn && isPlayingPhase ? (isAllInCall ? 'bg-red-700 border-red-500 hover:bg-red-600 cursor-pointer' : 'bg-blue-600 border-blue-400 hover:bg-blue-500 cursor-pointer') : 'bg-gray-900 border-gray-700 opacity-60 cursor-not-allowed'}`}>
                <span className={`font-black text-xl uppercase mb-1 ${isMyTurn && isPlayingPhase ? 'text-white' : 'text-gray-500'}`}>
                  {isAllInCall && !isCheck ? 'ALL-IN CALL' : isCheck ? 'Check' : 'Call'}
                </span>
                <span className={`rounded-full px-6 py-0.5 text-sm font-mono font-bold mb-1 ${isMyTurn && isPlayingPhase ? (isAllInCall ? 'bg-red-900 border border-red-400 text-red-100' : 'bg-blue-800 border border-blue-500 text-blue-100') : 'bg-gray-800 border border-gray-600 text-gray-500'}`}>
                  {callAmount > 0 ? callAmount : '0'}
                </span>
              </button>
              
              <button 
                onClick={() => handleAction('fold')} 
                disabled={!isMyTurn || !isPlayingPhase}
                className={`border rounded-2xl flex flex-col items-center justify-center shadow-lg transition-colors
                ${isMyTurn && isPlayingPhase ? 'bg-gray-800 border-gray-500 hover:bg-gray-700 cursor-pointer text-gray-200' : 'bg-gray-900 border-gray-700 opacity-60 cursor-not-allowed text-gray-600'}`}>
                <span className="font-black text-xl mb-1 uppercase">Fold</span>
                <span className="text-2xl">{isMyTurn && isPlayingPhase ? '👆' : '✋'}</span>
              </button>
            </div>
          </>
        )}
      </div>

      {isShowdown && (
        <div className="absolute inset-0 z-[60] flex items-center justify-center bg-gray-950/90 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-gray-900 border-2 border-gray-700 rounded-3xl w-[90%] max-w-sm shadow-2xl flex flex-col max-h-[85vh]">
            <div className="flex justify-between items-center p-4 border-b border-gray-800 bg-gray-950 rounded-t-3xl shrink-0">
              <div className="w-8"></div>
              <h3 className="text-xl font-black tracking-widest text-white uppercase drop-shadow-[0_0_10px_rgba(255,255,255,0.3)]">Showdown</h3>
              <div className="w-8"></div>
            </div>

            <div className="p-5 overflow-y-auto space-y-6">
              <div className="flex flex-col items-center">
                <h4 className="text-sm font-bold text-gray-400 tracking-widest uppercase mb-1">Main Pot</h4>
                <div className="text-4xl font-black font-mono text-yellow-500 mb-4 drop-shadow-md">{roomState.main_pot}</div>
                
                <div className="grid grid-cols-2 gap-3 w-full mt-2">
                  {Object.values(tablePlayers).filter(p => p.status !== 'folded' && p.status !== 'surrendered' && p.status !== 'bankrupt' && p.status !== 'ready' && p.status !== 'waiting').map((player) => {
                    const isSelected = mainWinners.includes(player.player_name);
                    return (
                      <button 
                        key={`main-${player.id}`} 
                        onClick={() => toggleWinner('main', player.player_name)} 
                        disabled={role !== 'host'} 
                        className={`py-3 rounded-2xl font-bold text-sm border-2 transition-all flex items-center justify-center relative 
                        ${isSelected ? 'bg-green-900/40 border-green-500 text-green-400 shadow-[0_0_15px_rgba(34,197,94,0.3)]' : 'bg-gray-800 border-gray-600 text-gray-300 hover:bg-gray-700'} 
                        ${role !== 'host' ? 'cursor-default' : 'cursor-pointer'}`}>
                        {player.player_name}
                        {isSelected && <span className="absolute right-3 text-lg">✓</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-gray-800 bg-gray-950 shrink-0 rounded-b-3xl">
              {role === 'host' ? (
                <button 
                  onClick={handleNextHand} 
                  className={`w-full py-4 rounded-2xl font-black text-lg uppercase tracking-widest transition-colors shadow-lg
                  ${mainWinners.length > 0 ? 'bg-blue-600 hover:bg-blue-500 border-2 border-blue-400 text-white shadow-[0_0_15px_rgba(37,99,235,0.4)]' : 'bg-gray-800 border-2 border-gray-700 text-gray-500'}`}>
                  {mainWinners.length > 0 ? 'Bagikan & Next Hand' : 'Pilih Pemenang'}
                </button>
              ) : (
                <button disabled className="w-full bg-gray-800 border-2 border-gray-600 text-gray-400 font-bold text-sm uppercase tracking-widest py-4 rounded-2xl cursor-wait flex items-center justify-center gap-2">
                  <span className="animate-spin text-lg">⏳</span> Host Memilih Pemenang...
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {showWinner && (
        <div className="absolute inset-0 z-[70] flex items-center justify-center bg-gray-950/90 backdrop-blur-md animate-in fade-in zoom-in duration-300">
          <div className="bg-gray-900 border-2 border-yellow-500/50 rounded-[2rem] w-[85%] max-w-sm shadow-[0_0_50px_rgba(234,179,8,0.2)] overflow-hidden flex flex-col p-6 items-center text-center relative">
            <div className="absolute inset-0 bg-gradient-to-b from-yellow-500/10 to-transparent pointer-events-none"></div>
            <h2 className="text-3xl font-black tracking-widest text-white uppercase mb-6 drop-shadow-md z-10">THE CHAMPION</h2>
            <div className="text-8xl mb-6 drop-shadow-[0_0_20px_rgba(250,204,21,0.6)] animate-bounce z-10">🏆</div>
            <h3 className="text-4xl font-black text-white tracking-widest uppercase mb-2 z-10">{grandWinnerName}</h3>
            <p className="text-gray-400 font-bold tracking-widest text-sm uppercase mb-8 z-10">Kemenangan Mutlak, Pal!</p>
            <div className="grid grid-cols-2 gap-4 w-full z-10">
              <button onClick={handleRestartAll} className="w-full bg-gray-800 hover:bg-gray-700 border-2 border-gray-600 text-white font-bold text-xs uppercase tracking-widest py-3 rounded-2xl transition-colors shadow-lg">Kembali Ke Lobby</button>
              <button onClick={handleExitGame} className="w-full bg-red-900/20 hover:bg-red-900/50 border-2 border-red-900/50 text-red-400 font-bold text-xs uppercase tracking-widest py-3 rounded-2xl transition-colors shadow-lg">Keluar (Exit)</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL MENU UTAMA */}
      {showMenu && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-gray-950/80 backdrop-blur-sm animate-in fade-in zoom-in duration-200">
          <div className="bg-gray-900 border-2 border-gray-700 rounded-3xl w-3/4 max-w-xs shadow-2xl overflow-hidden flex flex-col">
            <div className="flex justify-between items-center p-4 border-b border-gray-800 bg-gray-950">
              <button onClick={() => setShowMenu(false)} className="w-7 h-7 flex items-center justify-center rounded-full border border-gray-600 text-gray-400 hover:text-white transition-colors font-bold text-lg">←</button>
              <h3 className="text-lg font-black tracking-widest text-white capitalize">Menu {role}</h3>
              <div className="w-7 h-7"></div>
            </div>
            <div className="p-5 space-y-4 flex flex-col">
              {role === 'host' ? (
                <>
                  <button onClick={handleUndo} className="w-full flex justify-between items-center bg-gray-800 border border-gray-600 hover:bg-gray-700 rounded-2xl px-5 py-3 shadow-sm transition-colors"><span className="font-bold tracking-wide text-gray-200 text-lg">Undo</span><span className="text-xl text-gray-400">↺</span></button>
                  <button onClick={() => alert('Dummy: Save')} className="w-full flex justify-between items-center bg-gray-800 border border-gray-600 hover:bg-gray-700 rounded-2xl px-5 py-3 shadow-sm transition-colors"><span className="font-bold tracking-wide text-gray-200 text-lg">Save</span><span className="text-xl text-gray-400">💾</span></button>
                  <button onClick={() => alert('Dummy: Settings')} className="w-full flex justify-between items-center bg-gray-800 border border-gray-600 hover:bg-gray-700 rounded-2xl px-5 py-3 shadow-sm transition-colors"><span className="font-bold tracking-wide text-gray-200 text-lg">Settings</span><span className="text-xl text-gray-400">⚙️</span></button>
                  <button onClick={handleRestartAll} className="w-full flex justify-between items-center bg-gray-800 border border-gray-600 hover:bg-gray-700 rounded-2xl px-5 py-3 shadow-sm transition-colors"><span className="font-bold tracking-wide text-gray-200 text-lg">Restart</span><span className="text-xl text-gray-400">♻️</span></button>
                  <button onClick={handleExitGame} className="w-full flex justify-between items-center bg-gray-800 border border-gray-600 hover:bg-gray-700 rounded-2xl px-5 py-3 shadow-sm transition-colors"><span className="font-bold tracking-wide text-gray-200 text-lg">Exit</span><span className="text-xl text-gray-400">🚪</span></button>
                </>
              ) : (
                <>
                  <button onClick={() => alert('Dummy: Settings')} className="w-full flex justify-between items-center bg-gray-800 border border-gray-600 hover:bg-gray-700 rounded-2xl px-5 py-3 shadow-sm transition-colors"><span className="font-bold tracking-wide text-gray-200 text-lg">Settings</span><span className="text-xl text-gray-400">⚙️</span></button>
                  <button onClick={handleExitGame} className="w-full flex justify-between items-center bg-gray-800 border border-gray-600 hover:bg-gray-700 rounded-2xl px-5 py-3 shadow-sm transition-colors"><span className="font-bold tracking-wide text-gray-200 text-lg">Exit</span><span className="text-xl text-gray-400">🚪</span></button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {showRaiseModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-gray-950/80 backdrop-blur-sm animate-in fade-in zoom-in duration-200">
          <div className="bg-gray-900 border-2 border-gray-700 rounded-[2rem] w-[85%] max-w-sm shadow-2xl overflow-hidden flex flex-col p-5">
            <div className="flex justify-between items-center mb-4">
              <button className="w-7 h-7 flex items-center justify-center rounded-full border border-gray-600 text-gray-400 font-serif italic text-sm cursor-default">i</button>
              <h3 className="text-sm font-black tracking-widest text-white uppercase">Raise / Bet</h3>
              <button onClick={() => setShowRaiseModal(false)} className="w-7 h-7 flex items-center justify-center rounded-full border border-gray-600 text-gray-400 hover:text-white hover:bg-red-500 hover:border-red-500 transition-colors font-bold text-xs">✕</button>
            </div>
            <div className="bg-gray-950 border-2 border-gray-600 rounded-2xl p-4 flex items-center justify-center relative mb-4 focus-within:border-blue-500 focus-within:shadow-[0_0_15px_rgba(59,130,246,0.2)] transition-all">
              <span className="absolute left-4 text-gray-500 text-xl">⌨️</span>
              <input type="number" value={betAmount} onChange={(e) => setBetAmount(e.target.value === '' ? '' : e.target.value)} onBlur={handleBlur} className="text-4xl font-mono font-black text-white bg-transparent text-center w-3/4 outline-none appearance-none [&::-webkit-inner-spin-button]:appearance-none" style={{ MozAppearance: 'textfield' }} />
            </div>
            <div className="mb-6 px-2">
              <input type="range" min={minRaise} max={maxBet} step="1" value={Number(betAmount) || minRaise} onChange={(e) => setBetAmount(Number(e.target.value))} className="w-full accent-green-500 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer" />
            </div>
            <div className="grid grid-cols-2 gap-3 mb-5">
              <button onClick={handleMinus} className="bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-xl py-3 text-3xl font-black text-gray-200 transition-colors flex items-center justify-center leading-none">-</button>
              <button onClick={handlePlus} className="bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-xl py-3 text-3xl font-black text-gray-200 transition-colors flex items-center justify-center leading-none">+</button>
              <button onClick={handleMin} className="bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-xl py-2.5 text-lg font-bold uppercase tracking-widest text-gray-300 transition-colors">Min</button>
              <button onClick={handleMax} className="bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-xl py-2.5 text-lg font-bold uppercase tracking-widest text-gray-300 transition-colors">Max</button>
              <button onClick={handlePot} className="bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-xl py-2.5 text-lg font-bold uppercase tracking-widest text-yellow-500 transition-colors shadow-inner col-span-2">Pot</button>
            </div>
            
            <button 
              onClick={() => {
                const raiseAddAmount = Number(betAmount) - myCurrentBet;
                if(raiseAddAmount > 0) {
                   handleAction('raise', raiseAddAmount);
                }
                setShowRaiseModal(false);
              }} 
              className="w-full bg-green-600 hover:bg-green-500 border-2 border-green-400 text-white font-black text-xl uppercase tracking-widest py-3.5 rounded-2xl shadow-[0_0_15px_rgba(34,197,94,0.4)] transition-colors">
              Confirm Raise
            </button>
          </div>
        </div>
      )}

      {/* MODAL INFORMASI ATURAN KARTU */}
      {showInfoModal && (
        <div className="absolute inset-0 z-[110] flex items-center justify-center bg-gray-950/80 backdrop-blur-sm animate-in fade-in zoom-in duration-200">
          <div className="bg-gray-900 border-2 border-gray-700 rounded-3xl w-[90%] max-w-sm shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="flex justify-between items-center p-3 border-b border-gray-800 bg-gray-950 shrink-0">
              <div className="w-7 h-7"></div>
              <h3 className="text-sm font-black tracking-widest text-white uppercase">Aturan Poker</h3>
              <button onClick={() => setShowInfoModal(false)} className="w-7 h-7 flex items-center justify-center rounded-full border border-gray-600 text-gray-400 hover:text-white hover:bg-red-500 hover:border-red-500 transition-colors font-bold text-xs">✕</button>
            </div>
            <div className="p-2 overflow-y-auto flex items-center justify-center bg-gray-800">
              <img src="/poker-hands.jpg" alt="Poker Hand Rankings" className="w-full h-auto rounded-xl object-contain shadow-md" />
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default MejaPermainan;