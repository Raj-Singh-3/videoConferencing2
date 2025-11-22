import React, { useState } from 'react';
import { randomRoomId } from './utils';

export default function Lobby({ onJoin }) {
  const [room, setRoom] = useState('');
  const [name, setName] = useState('');

  const createRoom = () => {
    const r = randomRoomId();
    setRoom(r);
  };

  const join = () => {
    if (!room) return alert('Enter or create a room id');
    onJoin(room, name || 'Guest');
  };

  return (
    <div className="lobby">
      <h1>Video Meet — Simple</h1>
      <div className="card">
        <label>Your name</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Your name" />
        <label>Room ID</label>
        <input value={room} onChange={e => setRoom(e.target.value)} placeholder="Room id" />
        <div className="row">
          <button onClick={createRoom}>Create random room</button>
          <button onClick={join}>Join</button>
        </div>
        <p className="hint">Share the Room ID with your friends to join.</p>
        <p>Example room: <code>abc123</code></p>
      </div>
    </div>
  );
}
