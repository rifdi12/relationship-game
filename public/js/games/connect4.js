window.GAMES = window.GAMES || {};

window.GAMES.connect4 = (function () {
  const ROWS = 6;
  const COLS = 7;
  let ctx = null;
  let cells = [];

  const statusEl = document.getElementById('c4-status');
  const scoreEl = document.getElementById('c4-score');
  const boardEl = document.getElementById('c4-board');
  const winnerBox = document.getElementById('c4-winner-box');
  const winnerText = document.getElementById('c4-winner-text');
  const btnNext = document.getElementById('c4-btn-next');
  const btnBack = document.getElementById('c4-btn-back');

  function buildBoard() {
    if (cells.length) return;
    boardEl.innerHTML = '';
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'c4-cell';
        btn.dataset.col = c;
        btn.addEventListener('click', () => {
          ctx.socket.emit('c4_drop', { col: c });
        });
        boardEl.appendChild(btn);
        cells.push(btn);
      }
    }
  }

  function symbolClass(v) {
    if (v === 'R') return 'r';
    if (v === 'Y') return 'y';
    return '';
  }

  function render(data) {
    buildBoard();
    data.board.forEach((v, i) => {
      cells[i].className = `c4-cell ${symbolClass(v)}`.trim();
      cells[i].disabled = !!data.winner;
    });

    scoreEl.textContent = `🔴 ${data.scores.R} · 🟡 ${data.scores.Y} · Seri ${data.scores.draws}`;

    const mySymbol = data.symbolOf[ctx.myId];

    if (data.winner) {
      let msg;
      if (data.winner === 'draw') {
        msg = 'Seri! Papan penuh.';
      } else {
        const winnerName = data.names[data.winner];
        msg = data.winner === mySymbol ? `🎉 Kamu menang! (${winnerName})` : `${winnerName} menang!`;
      }
      statusEl.textContent = 'Ronde selesai';
      winnerText.textContent = msg;
      winnerBox.hidden = false;
      if (data.winner === mySymbol) window.fireConfetti?.();
    } else {
      winnerBox.hidden = true;
      const turnName = data.names[data.turn];
      statusEl.textContent = data.turn === mySymbol ? 'Giliran kamu!' : `Giliran ${turnName}`;
    }
  }

  function onEnterRoom(c) {
    ctx = c;
    btnNext.addEventListener('click', () => ctx.socket.emit('c4_next_round'));
    btnBack.addEventListener('click', () => ctx.socket.emit('play_again'));

    ctx.socket.on('c4_state', (data) => {
      ctx.showScreen('screen-c4-play');
      render(data);
    });
  }

  return { onEnterRoom };
})();
