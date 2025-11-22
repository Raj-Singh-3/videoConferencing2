import React, { useState } from 'react';
import Lobby from './Lobby';
import Room from './Room';

export default function App() {
  const [inRoom, setInRoom] = useState(false);
  const [roomId, setRoomId] = useState('');
  const [name, setName] = useState('');

  return (
    <div className="app">
      {!inRoom ? (
        <Lobby
          onJoin={(r, n) => { setRoomId(r); setName(n); setInRoom(true); }}
        />
      ) : (
        <Room roomId={roomId} name={name} onLeave={() => { setInRoom(false); setRoomId(''); }} />
      )}
    </div>
  );
}
