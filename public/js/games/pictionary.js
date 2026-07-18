window.GAMES = window.GAMES || {};

window.GAMES.pictionary = (function () {
  let ctx = null;
  let isDrawerNow = false;
  let drawing = false;
  let lastPoint = null;
  let countdownInterval = null;

  const roleLabel = document.getElementById('pic-role-label');
  const timerEl = document.getElementById('pic-timer');
  const wordHint = document.getElementById('pic-word-hint');
  const canvas = document.getElementById('pic-canvas');
  const canvasCtx = canvas.getContext('2d');
  const drawerTools = document.getElementById('pic-drawer-tools');
  const btnClear = document.getElementById('pic-btn-clear');
  const formGuess = document.getElementById('pic-form-guess');
  const guessInput = document.getElementById('pic-guess-input');
  const feedEl = document.getElementById('pic-guess-feed');
  const overBox = document.getElementById('pic-over-box');
  const overText = document.getElementById('pic-over-text');
  const scoreText = document.getElementById('pic-score-text');
  const btnNext = document.getElementById('pic-btn-next');
  const btnBack = document.getElementById('pic-btn-back');

  canvasCtx.strokeStyle = '#1b1033';
  canvasCtx.lineWidth = 4;
  canvasCtx.lineCap = 'round';

  function toNormalized(evt) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (evt.clientX - rect.left) / rect.width,
      y: (evt.clientY - rect.top) / rect.height,
    };
  }

  function drawSegment(x0, y0, x1, y1) {
    canvasCtx.beginPath();
    canvasCtx.moveTo(x0 * canvas.width, y0 * canvas.height);
    canvasCtx.lineTo(x1 * canvas.width, y1 * canvas.height);
    canvasCtx.stroke();
  }

  function clearCanvasLocal() {
    canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
  }

  function onEnterRoom(c) {
    ctx = c;

    canvas.addEventListener('pointerdown', (e) => {
      if (!isDrawerNow) return;
      drawing = true;
      lastPoint = toNormalized(e);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!drawing || !isDrawerNow) return;
      const p = toNormalized(e);
      drawSegment(lastPoint.x, lastPoint.y, p.x, p.y);
      ctx.socket.emit('draw_stroke', { x0: lastPoint.x, y0: lastPoint.y, x1: p.x, y1: p.y });
      lastPoint = p;
    });
    window.addEventListener('pointerup', () => {
      drawing = false;
      lastPoint = null;
    });

    btnClear.addEventListener('click', () => {
      if (!isDrawerNow) return;
      clearCanvasLocal();
      ctx.socket.emit('clear_canvas');
    });

    formGuess.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = guessInput.value.trim();
      if (!text) return;
      ctx.socket.emit('guess_text', { text });
      guessInput.value = '';
    });

    btnNext.addEventListener('click', () => ctx.socket.emit('pictionary_next_round'));
    btnBack.addEventListener('click', () => ctx.socket.emit('play_again'));

    ctx.socket.on('pictionary_round_start', (data) => {
      ctx.showScreen('screen-pictionary-play');
      clearCanvasLocal();
      feedEl.innerHTML = '';
      overBox.hidden = true;
      guessInput.value = '';

      isDrawerNow = data.role === 'drawer';
      roleLabel.textContent = isDrawerNow ? 'Kamu: Penggambar' : 'Kamu: Penebak';
      wordHint.textContent = isDrawerNow
        ? `Gambar kata ini: "${data.word}"`
        : `Tebak gambar ${data.wordLength} huruf dari ${data.drawerName}`;

      drawerTools.hidden = !isDrawerNow;
      formGuess.hidden = isDrawerNow;
      canvas.style.cursor = isDrawerNow ? 'crosshair' : 'default';

      clearInterval(countdownInterval);
      let remaining = Math.ceil(data.timeLimitMs / 1000);
      timerEl.textContent = remaining;
      countdownInterval = setInterval(() => {
        remaining -= 1;
        timerEl.textContent = Math.max(remaining, 0);
        if (remaining <= 0) clearInterval(countdownInterval);
      }, 1000);
    });

    ctx.socket.on('draw_stroke', (seg) => {
      drawSegment(seg.x0, seg.y0, seg.x1, seg.y1);
    });

    ctx.socket.on('clear_canvas', () => {
      clearCanvasLocal();
    });

    ctx.socket.on('pictionary_guess_feed', (data) => {
      const item = document.createElement('div');
      item.className = `pic-feed-item${data.correct ? ' correct' : ''}`;
      item.textContent = `${data.name}: ${data.text}`;
      feedEl.appendChild(item);
      feedEl.scrollTop = feedEl.scrollHeight;
    });

    ctx.socket.on('pictionary_round_over', (data) => {
      clearInterval(countdownInterval);
      overBox.hidden = false;
      overText.textContent = data.won
        ? `🎉 Berhasil ditebak! Kata: "${data.word}" (+${data.points} poin)`
        : `Waktu habis! Kata: "${data.word}"`;
      const myScore = data.scores[ctx.myId] || 0;
      const partnerId = Object.keys(data.scores).find((id) => id !== ctx.myId);
      const partnerScore = data.scores[partnerId] || 0;
      scoreText.textContent = `Skor kamu: ${myScore} · Pasangan: ${partnerScore}`;
      if (data.won) window.fireConfetti?.();
    });
  }

  return { onEnterRoom };
})();
