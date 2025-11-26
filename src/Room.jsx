import React, { useEffect, useRef, useState } from 'react';
import io from 'socket.io-client';

const SIGNALING_SERVER_URL = 'https://nymphean-brigid-immethodically.ngrok-free.dev'; // change if backend elsewhere

const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    {
      urls: "turn:global.relay.metered.ca:443",
      username: "Zr0Tw2Yt0b94y5RqGtwz9yq5J54ZQeEo",
      credential: "JgXCa5t4tQ9N2Oe80N++z26V7x0="
    }
  ]
};


export default function Room({ roomId, name, onLeave }) {
  const localVideoRef = useRef();
  const peersRef = useRef({}); // socketId -> { pc, stream }
  const [remoteVideos, setRemoteVideos] = useState([]); // [{id, stream, name}]
  const socketRef = useRef();
  const localStreamRef = useRef();
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);

  useEffect(() => {
    start();
    return () => {
      cleanup();
    };
    // eslint-disable-next-line
  }, []);

  const start = async () => {
    socketRef.current = io(SIGNALING_SERVER_URL);

    // get local media
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
    } catch (e) {
      alert('Could not access camera/microphone: ' + e.message);
      console.error(e);
      return;
    }

    socketRef.current.on('connect', () => {
      socketRef.current.emit('join-room', { roomId, name });
    });

    // when joining, server sends list of existing users
    socketRef.current.on('all-users', (users) => {
      // create offer for each existing user
      users.forEach(userSocketId => {
        createPeerConnectionAndOffer(userSocketId);
      });
    });

    socketRef.current.on('user-joined', ({ socketId, name: peerName }) => {
      // new user joined after us -> do nothing until they appear in all-users?
      // But server emits user-joined to others: existing peers can create offer
      // We'll create an offer to them:
      createPeerConnectionAndOffer(socketId);
    });

    socketRef.current.on('offer', async ({ sdp, caller }) => {
      // create peer connection and set remote desc, then answer
      await handleOffer(caller, sdp);
    });

    socketRef.current.on('answer', async ({ sdp, responder }) => {
      const entry = peersRef.current[responder];
      if (!entry) {
        console.warn('No peer for answer from', responder);
        return;
      }
      try {
        await entry.pc.setRemoteDescription(new RTCSessionDescription(sdp));
      } catch (e) { console.error(e); }
    });

    socketRef.current.on('ice-candidate', async ({ candidate, from }) => {
      const entry = peersRef.current[from];
      if (!entry) return;
      try {
        await entry.pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) { console.warn('addIceCandidate error', e); }
    });

    socketRef.current.on('user-left', ({ socketId }) => {
      removePeer(socketId);
    });
  };

  function addRemoteStream(socketId, stream, name = '') {
    setRemoteVideos(prev => {
      if (prev.find(p => p.id === socketId)) return prev;
      return [...prev, { id: socketId, stream, name }];
    });
  }

  function removePeer(socketId) {
    const entry = peersRef.current[socketId];
    if (entry) {
      try { entry.pc.close(); } catch {}
      delete peersRef.current[socketId];
    }
    setRemoteVideos(prev => prev.filter(p => p.id !== socketId));
  }

  async function createPeerConnectionAndOffer(targetSocketId) {
    if (peersRef.current[targetSocketId]) {
      return; // already exists
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);

    // add local tracks
    localStreamRef.current.getTracks().forEach(track => pc.addTrack(track, localStreamRef.current));

    // collect remote stream
    const remoteStream = new MediaStream();
    pc.ontrack = event => {
      event.streams[0].getTracks().forEach(t => remoteStream.addTrack(t));
      addRemoteStream(targetSocketId, remoteStream);
    };

    // ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current.emit('ice-candidate', { target: targetSocketId, candidate: event.candidate });
      }
    };

    peersRef.current[targetSocketId] = { pc, stream: remoteStream };

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socketRef.current.emit('offer', { target: targetSocketId, sdp: pc.localDescription });
    } catch (e) {
      console.error('Error creating offer', e);
    }
  }

  async function handleOffer(callerSocketId, sdp) {
    if (peersRef.current[callerSocketId]) {
      console.warn('already have peer for', callerSocketId);
      return;
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);

    // add local tracks
    localStreamRef.current.getTracks().forEach(track => pc.addTrack(track, localStreamRef.current));

    const remoteStream = new MediaStream();
    pc.ontrack = event => {
      event.streams[0].getTracks().forEach(t => remoteStream.addTrack(t));
      addRemoteStream(callerSocketId, remoteStream);
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current.emit('ice-candidate', { target: callerSocketId, candidate: event.candidate });
      }
    };

    peersRef.current[callerSocketId] = { pc, stream: remoteStream };

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socketRef.current.emit('answer', { target: callerSocketId, sdp: pc.localDescription });
    } catch (e) {
      console.error('handleOffer error', e);
    }
  }

  function toggleMute() {
    if (!localStreamRef.current) return;
    localStreamRef.current.getAudioTracks().forEach(t => (t.enabled = !t.enabled));
    setMuted(prev => !prev);
  }

  function toggleCamera() {
    if (!localStreamRef.current) return;
    localStreamRef.current.getVideoTracks().forEach(t => (t.enabled = !t.enabled));
    setCamOff(prev => !prev);
  }

  function cleanup() {
    // close peer connections
    Object.values(peersRef.current).forEach(e => {
      try { e.pc.close(); } catch {}
    });
    peersRef.current = {};
    // stop local tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
    }
    if (socketRef.current) socketRef.current.disconnect();
  }

  const leave = () => {
    cleanup();
    onLeave();
  };

  return (
    <div className="room">
      <div className="controls">
        <div>Room: <strong>{roomId}</strong></div>
        <div>Name: <strong>{name}</strong></div>
        <div className="buttons">
          <button onClick={toggleMute}>{muted ? 'Unmute' : 'Mute'}</button>
          <button onClick={toggleCamera}>{camOff ? 'Camera On' : 'Camera Off'}</button>
          <button onClick={leave} className="leave">Leave</button>
        </div>
      </div>

      <div className="videos">
        <div className="video-card local">
          <video ref={localVideoRef} autoPlay muted playsInline className="video" />
          <div className="label">You ({name})</div>
        </div>

        {remoteVideos.map(peer => (
          <RemoteVideo key={peer.id} peer={peer} />
        ))}
      </div>
    </div>
  );
}

function RemoteVideo({ peer }) {
  const vidRef = useRef();

  useEffect(() => {
    if (vidRef.current && peer.stream) {
      vidRef.current.srcObject = peer.stream;
    }
  }, [peer]);

  return (
    <div className="video-card">
      <video ref={vidRef} autoPlay playsInline className="video" />
      <div className="label">Peer</div>
    </div>
  );
}
