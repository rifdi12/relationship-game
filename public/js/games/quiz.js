window.GAMES = window.GAMES || {};

window.GAMES.quiz = (function () {
  let ctx = null;
  let countdownInterval = null;
  let hasAnsweredThisQuestion = false;
  let currentAuthorId = null;

  const quizLobbyExtra = document.getElementById('quiz-lobby-extra');
  const questionCountEl = document.getElementById('quiz-question-count');
  const formQuestion = document.getElementById('quiz-form-question');

  const qProgress = document.getElementById('quiz-q-progress');
  const qTimer = document.getElementById('quiz-q-timer');
  const qAuthorName = document.getElementById('quiz-q-author-name');
  const qTextDisplay = document.getElementById('quiz-q-text-display');
  const answerButtons = document.querySelectorAll('#quiz-answer-grid .answer-btn');
  const answerStatus = document.getElementById('quiz-answer-status');
  const authorWaitNote = document.getElementById('quiz-author-wait-note');

  const revealQuestion = document.getElementById('quiz-reveal-question');
  const revealOptions = document.getElementById('quiz-reveal-options');
  const revealScoreboard = document.getElementById('quiz-reveal-scoreboard');

  const finalScoreboard = document.getElementById('quiz-final-scoreboard');

  function onEnterRoom(c) {
    ctx = c;

    formQuestion.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = document.getElementById('quiz-q-text').value.trim();
      const options = [
        document.getElementById('quiz-q-opt0').value.trim(),
        document.getElementById('quiz-q-opt1').value.trim(),
        document.getElementById('quiz-q-opt2').value.trim(),
        document.getElementById('quiz-q-opt3').value.trim(),
      ];
      const correctIndex = Number(document.getElementById('quiz-q-correct').value);
      if (!text || options.some((o) => !o)) return;
      ctx.socket.emit('quiz_submit_question', { text, options, correctIndex });
      formQuestion.reset();
    });

    document.getElementById('quiz-btn-play-again').addEventListener('click', () => {
      ctx.socket.emit('play_again');
    });

    ctx.socket.on('quiz_lobby_update', ({ questionCount }) => {
      questionCountEl.textContent = questionCount;
    });

    ctx.socket.on('quiz_game_started', () => {
      ctx.showScreen('screen-quiz-question');
    });

    ctx.socket.on('quiz_new_question', (q) => {
      ctx.showScreen('screen-quiz-question');
      currentAuthorId = q.authorId;
      hasAnsweredThisQuestion = false;
      qProgress.textContent = `Soal ${q.index + 1}/${q.total}`;
      qAuthorName.textContent = q.authorName;
      qTextDisplay.textContent = q.text;
      answerStatus.textContent = '';

      answerButtons.forEach((btn, i) => {
        btn.textContent = q.options[i];
        btn.className = `answer-btn opt-${i}`;
        btn.disabled = q.authorId === ctx.myId;
      });

      const isAuthor = q.authorId === ctx.myId;
      authorWaitNote.style.display = isAuthor ? 'block' : 'none';

      clearInterval(countdownInterval);
      let remaining = Math.ceil(q.timeLimitMs / 1000);
      qTimer.textContent = remaining;
      countdownInterval = setInterval(() => {
        remaining -= 1;
        qTimer.textContent = Math.max(remaining, 0);
        if (remaining <= 0) clearInterval(countdownInterval);
      }, 1000);
    });

    answerButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        if (hasAnsweredThisQuestion || btn.disabled) return;
        hasAnsweredThisQuestion = true;
        const idx = Number(btn.dataset.idx);
        ctx.socket.emit('quiz_submit_answer', { selectedIndex: idx });
        answerButtons.forEach((b) => {
          b.disabled = true;
          if (Number(b.dataset.idx) === idx) b.classList.add('selected');
        });
        answerStatus.textContent = 'Jawaban terkirim! Menunggu pemain lain...';
      });
    });

    ctx.socket.on('quiz_answer_progress', () => {
      if (currentAuthorId === ctx.myId) {
        answerStatus.textContent = '';
      }
    });

    ctx.socket.on('quiz_reveal_answer', (data) => {
      clearInterval(countdownInterval);
      ctx.showScreen('screen-quiz-reveal');
      revealQuestion.textContent = `${data.text} (dari ${data.authorName})`;
      revealOptions.innerHTML = '';

      const myAnswer = data.playerAnswers.find((a) => a.id === ctx.myId);

      data.options.forEach((opt, i) => {
        const btn = document.createElement('button');
        btn.className = `answer-btn opt-${i}`;
        btn.disabled = true;
        btn.textContent = opt;
        if (i === data.correctIndex) {
          btn.classList.add('correct');
        } else if (myAnswer && myAnswer.selectedIndex === i) {
          btn.classList.add('wrong');
        } else {
          btn.classList.add('faded');
        }
        revealOptions.appendChild(btn);
      });

      revealScoreboard.innerHTML = '';
      data.players.forEach((p) => {
        const li = document.createElement('li');
        li.innerHTML = `<span>${ctx.escapeHtml(p.name)}${p.id === ctx.myId ? ' (kamu)' : ''}</span><span>${p.score}</span>`;
        revealScoreboard.appendChild(li);
      });
    });

    ctx.socket.on('quiz_game_over', (data) => {
      ctx.showScreen('screen-quiz-over');
      window.fireConfetti?.();
      finalScoreboard.innerHTML = '';
      data.players.forEach((p, i) => {
        const li = document.createElement('li');
        const medal = ['🥇', '🥈', '🥉'][i] || `${i + 1}.`;
        li.innerHTML = `<span>${medal} ${ctx.escapeHtml(p.name)}${p.id === ctx.myId ? ' (kamu)' : ''}</span><span>${p.score}</span>`;
        finalScoreboard.appendChild(li);
      });
    });
  }

  function onLobby(c) {
    ctx = c;
    quizLobbyExtra.hidden = false;
    document.getElementById('generic-lobby-note').hidden = true;
  }

  return { onEnterRoom, onLobby };
})();
