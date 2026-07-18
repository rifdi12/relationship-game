window.GAMES = window.GAMES || {};

window.GAMES.guessword = (function () {
  let ctx = null;
  let myRole = null; // 'setter' | 'guesser'

  const roundLabel = document.getElementById('gw-round-label');
  const roleLabel = document.getElementById('gw-role-label');

  const settingBox = document.getElementById('gw-setting-box');
  const setterFormBox = document.getElementById('gw-setter-form-box');
  const settingWaitNote = document.getElementById('gw-setting-wait-note');
  const formWord = document.getElementById('gw-form-word');
  const wordInput = document.getElementById('gw-word-input');

  const guessingBox = document.getElementById('gw-guessing-box');
  const guesserNote = document.getElementById('gw-guesser-note');
  const historyEl = document.getElementById('gw-guess-history');
  const formGuess = document.getElementById('gw-form-guess');
  const guessInput = document.getElementById('gw-guess-input');
  const attemptsLeftEl = document.getElementById('gw-attempts-left');

  const overBox = document.getElementById('gw-over-box');
  const overText = document.getElementById('gw-over-text');
  const scoreText = document.getElementById('gw-score-text');
  const btnNext = document.getElementById('gw-btn-next');
  const btnBack = document.getElementById('gw-btn-back');

  function hideAllStageBoxes() {
    settingBox.hidden = true;
    guessingBox.hidden = true;
    overBox.hidden = true;
  }

  function renderHistory(guesses) {
    historyEl.innerHTML = '';
    guesses.forEach((g) => {
      const row = document.createElement('div');
      row.className = 'gw-row';
      g.result.forEach((r, i) => {
        const tile = document.createElement('span');
        tile.className = `gw-tile ${r}`;
        tile.textContent = g.word[i];
        row.appendChild(tile);
      });
      historyEl.appendChild(row);
    });
  }

  function onEnterRoom(c) {
    ctx = c;

    formWord.addEventListener('submit', (e) => {
      e.preventDefault();
      const word = wordInput.value.trim();
      if (!word) return;
      ctx.socket.emit('guessword_set_word', { word });
      wordInput.value = '';
    });

    formGuess.addEventListener('submit', (e) => {
      e.preventDefault();
      const word = guessInput.value.trim();
      if (!word) return;
      ctx.socket.emit('guessword_guess', { word });
      guessInput.value = '';
    });

    btnNext.addEventListener('click', () => ctx.socket.emit('guessword_next_round'));
    btnBack.addEventListener('click', () => ctx.socket.emit('play_again'));

    ctx.socket.on('guessword_round_start', (data) => {
      ctx.showScreen('screen-guessword-play');
      hideAllStageBoxes();
      historyEl.innerHTML = '';
      btnNext.hidden = false;
      myRole = data.setterId === ctx.myId ? 'setter' : 'guesser';
      roundLabel.textContent = `Ronde ${data.roundIndex + 1}/2`;
      roleLabel.textContent = myRole === 'setter' ? 'Kamu: Pembuat Kata' : 'Kamu: Penebak';

      settingBox.hidden = false;
      setterFormBox.hidden = myRole !== 'setter';
      settingWaitNote.hidden = myRole === 'setter';
    });

    ctx.socket.on('guessword_word_ready', (data) => {
      hideAllStageBoxes();
      guessingBox.hidden = false;
      formGuess.hidden = myRole !== 'guesser';
      guesserNote.textContent = myRole === 'guesser'
        ? `Tebak kata ${data.length} huruf ini!`
        : `${data.guesserName} lagi nebak kata buatanmu (${data.length} huruf)...`;
      attemptsLeftEl.textContent = '';
    });

    ctx.socket.on('guessword_update', (data) => {
      renderHistory(data.guesses);
      attemptsLeftEl.textContent = `Sisa percobaan: ${data.attemptsLeft}`;
    });

    ctx.socket.on('guessword_round_over', (data) => {
      hideAllStageBoxes();
      renderHistory(data.guesses || []);
      overBox.hidden = false;
      overText.textContent = data.won
        ? `🎉 Berhasil ditebak dalam ${data.attempts} percobaan! Kata: "${data.secretWord}"`
        : `Gagal ditebak. Kata rahasianya: "${data.secretWord}"`;
      const myScore = data.scores[ctx.myId] || 0;
      const partnerId = Object.keys(data.scores).find((id) => id !== ctx.myId);
      const partnerScore = data.scores[partnerId] || 0;
      scoreText.textContent = `Skor kamu: ${myScore} · Pasangan: ${partnerScore}`;
      btnNext.hidden = data.isFinalRound;
      if (data.won) window.fireConfetti?.();
    });
  }

  return { onEnterRoom };
})();
