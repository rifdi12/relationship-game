window.CallWidget = (function () {
  const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];

  let ctx = null; // { socket, myId }
  let state = 'idle'; // idle | outgoing | incoming | connecting | active
  let pc = null;
  let localStream = null;
  let pendingIceCandidates = [];
  let pendingOffer = null;
  let remoteDescSet = false;
  let isMuted = false;
  let callTimerInterval = null;
  let callStartTime = 0;

  const widget = document.getElementById('call-widget');
  const remoteAudio = document.getElementById('call-remote-audio');
  const errorEl = document.getElementById('call-error');
  const timerEl = document.getElementById('call-timer');
  const muteBtn = document.getElementById('call-btn-mute');

  const uiStates = {
    idle: document.getElementById('call-idle'),
    outgoing: document.getElementById('call-outgoing'),
    incoming: document.getElementById('call-incoming'),
    active: document.getElementById('call-active'),
  };

  function setUIState(key) {
    Object.entries(uiStates).forEach(([k, el]) => { el.hidden = k !== key; });
  }

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.hidden = false;
    setTimeout(() => { errorEl.hidden = true; }, 4000);
  }

  function formatTime(totalSeconds) {
    const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const s = Math.floor(totalSeconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  function startTimer() {
    callStartTime = Date.now();
    timerEl.textContent = '00:00';
    clearInterval(callTimerInterval);
    callTimerInterval = setInterval(() => {
      timerEl.textContent = formatTime((Date.now() - callStartTime) / 1000);
    }, 1000);
  }

  function resetToIdle() {
    clearInterval(callTimerInterval);
    callTimerInterval = null;
    if (pc) {
      pc.close();
      pc = null;
    }
    if (localStream) {
      localStream.getTracks().forEach((t) => t.stop());
      localStream = null;
    }
    remoteAudio.srcObject = null;
    pendingIceCandidates = [];
    pendingOffer = null;
    remoteDescSet = false;
    isMuted = false;
    muteBtn.textContent = '🎙️';
    state = 'idle';
    setUIState('idle');
  }

  async function ensureLocalStream() {
    if (localStream) return localStream;
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    return localStream;
  }

  function createPeerConnection() {
    const conn = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    conn.onicecandidate = (e) => {
      if (e.candidate) ctx.socket.emit('webrtc_ice_candidate', { candidate: e.candidate });
    };
    conn.ontrack = (e) => {
      remoteAudio.srcObject = e.streams[0];
    };
    conn.onconnectionstatechange = () => {
      if (conn.connectionState === 'connected' && state === 'connecting') {
        state = 'active';
        startTimer();
      }
    };
    return conn;
  }

  async function flushPendingCandidates() {
    const queued = pendingIceCandidates;
    pendingIceCandidates = [];
    for (const cand of queued) {
      try { await pc.addIceCandidate(cand); } catch (e) { /* ignore stale candidate */ }
    }
  }

  async function handleOffer(data) {
    await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
    remoteDescSet = true;
    await flushPendingCandidates();
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    ctx.socket.emit('webrtc_answer', { sdp: answer });
  }

  function startCall() {
    if (state !== 'idle') return;
    state = 'outgoing';
    setUIState('outgoing');
    ctx.socket.emit('call_invite');
  }

  function cancelOutgoing() {
    ctx.socket.emit('call_cancel');
    resetToIdle();
  }

  async function acceptIncoming() {
    let stream;
    try {
      stream = await ensureLocalStream();
    } catch (err) {
      showError('Gagal akses mikrofon. Cek izin browser.');
      ctx.socket.emit('call_reject');
      resetToIdle();
      return;
    }
    ctx.socket.emit('call_accept');
    pc = createPeerConnection();
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));
    state = 'connecting';
    setUIState('active');
    timerEl.textContent = 'Menyambungkan...';

    if (pendingOffer) {
      const offerData = pendingOffer;
      pendingOffer = null;
      await handleOffer(offerData);
    }
  }

  function rejectIncoming() {
    ctx.socket.emit('call_reject');
    resetToIdle();
  }

  function hangUp() {
    ctx.socket.emit('call_end');
    resetToIdle();
  }

  function toggleMute() {
    if (!localStream) return;
    isMuted = !isMuted;
    localStream.getAudioTracks().forEach((t) => { t.enabled = !isMuted; });
    muteBtn.textContent = isMuted ? '🔇' : '🎙️';
    muteBtn.title = isMuted ? 'Nyalakan mic' : 'Matikan mic';
  }

  function onEnterRoom(c) {
    ctx = c;

    document.getElementById('call-btn-start').addEventListener('click', startCall);
    document.getElementById('call-btn-cancel').addEventListener('click', cancelOutgoing);
    document.getElementById('call-btn-accept').addEventListener('click', acceptIncoming);
    document.getElementById('call-btn-reject').addEventListener('click', rejectIncoming);
    document.getElementById('call-btn-hangup').addEventListener('click', hangUp);
    muteBtn.addEventListener('click', toggleMute);

    ctx.socket.on('call_incoming', (data) => {
      if (state !== 'idle') {
        ctx.socket.emit('call_reject');
        return;
      }
      state = 'incoming';
      document.getElementById('call-incoming-name').textContent = `${data.fromName || 'Pasangan'} menelepon...`;
      setUIState('incoming');
    });

    ctx.socket.on('call_accepted', async () => {
      if (state !== 'outgoing') return;
      let stream;
      try {
        stream = await ensureLocalStream();
      } catch (err) {
        showError('Gagal akses mikrofon. Cek izin browser.');
        ctx.socket.emit('call_end');
        resetToIdle();
        return;
      }
      pc = createPeerConnection();
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      state = 'connecting';
      setUIState('active');
      timerEl.textContent = 'Menyambungkan...';
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      ctx.socket.emit('webrtc_offer', { sdp: offer });
    });

    ctx.socket.on('call_rejected', () => {
      showError('Panggilan ditolak.');
      resetToIdle();
    });

    ctx.socket.on('call_cancelled', () => {
      resetToIdle();
    });

    ctx.socket.on('call_ended', () => {
      if (state === 'idle') return;
      resetToIdle();
    });

    ctx.socket.on('webrtc_offer', async (data) => {
      if (!pc) {
        pendingOffer = data;
        return;
      }
      await handleOffer(data);
    });

    ctx.socket.on('webrtc_answer', async (data) => {
      if (!pc) return;
      await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
      remoteDescSet = true;
      await flushPendingCandidates();
    });

    ctx.socket.on('webrtc_ice_candidate', async (data) => {
      if (!data || !data.candidate) return;
      const candidate = new RTCIceCandidate(data.candidate);
      if (pc && remoteDescSet) {
        try { await pc.addIceCandidate(candidate); } catch (e) { /* ignore */ }
      } else {
        pendingIceCandidates.push(candidate);
      }
    });

    ctx.socket.on('room_update', (roomState) => {
      if (roomState.players.length < 2) {
        widget.hidden = true;
        if (state !== 'idle') resetToIdle();
      } else {
        widget.hidden = false;
      }
    });
  }

  return { onEnterRoom };
})();
