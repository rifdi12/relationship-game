const MAX_ATTEMPTS = 6;
const TOTAL_ROUNDS = 2;

function createState() {
  return {
    setterId: null,
    guesserId: null,
    secretWord: null,
    guesses: [], // [{ word, result: ['correct'|'present'|'absent', ...] }]
    stage: 'setting', // 'setting' | 'guessing' | 'roundOver'
    roundIndex: 0,
    scores: {}, // socketId -> accumulated points
  };
}

function computeResult(guess, secret) {
  const n = guess.length;
  const result = new Array(n).fill('absent');
  const remaining = secret.split('');

  for (let i = 0; i < n; i++) {
    if (guess[i] === remaining[i]) {
      result[i] = 'correct';
      remaining[i] = null;
    }
  }
  for (let i = 0; i < n; i++) {
    if (result[i] === 'correct') continue;
    const idx = remaining.indexOf(guess[i]);
    if (idx !== -1) {
      result[i] = 'present';
      remaining[idx] = null;
    }
  }
  return result;
}

function nameOf(room, id) {
  const p = room.players.get(id);
  return p ? p.name : '???';
}

function startRound(io, room) {
  const state = room.state;
  state.secretWord = null;
  state.guesses = [];
  state.stage = 'setting';
  io.to(room.code).emit('guessword_round_start', {
    roundIndex: state.roundIndex,
    setterId: state.setterId,
    guesserId: state.guesserId,
    setterName: nameOf(room, state.setterId),
    guesserName: nameOf(room, state.guesserId),
  });
}

function start(io, room, helpers) {
  if (room.phase !== 'lobby') return;
  const state = room.state;
  const ids = Array.from(room.players.keys());
  state.setterId = ids[0];
  state.guesserId = ids[1];
  state.scores = { [ids[0]]: 0, [ids[1]]: 0 };
  state.roundIndex = 0;
  room.phase = 'playing';
  helpers.broadcastRoomState(room);
  startRound(io, room);
}

function reset(io, room, helpers) {
  room.phase = 'lobby';
  room.state = createState();
  helpers.broadcastRoomState(room);
}

function registerSocket(io, socket, room) {
  socket.on('guessword_set_word', ({ word }) => {
    if (room.phase !== 'playing') return;
    const state = room.state;
    if (state.stage !== 'setting' || socket.id !== state.setterId) return;
    const clean = (word || '').trim().toLowerCase();
    if (!/^[a-z]{3,10}$/.test(clean)) return;
    state.secretWord = clean;
    state.stage = 'guessing';
    io.to(room.code).emit('guessword_word_ready', {
      length: clean.length,
      guesserId: state.guesserId,
      guesserName: nameOf(room, state.guesserId),
    });
  });

  socket.on('guessword_guess', ({ word }) => {
    if (room.phase !== 'playing') return;
    const state = room.state;
    if (state.stage !== 'guessing' || socket.id !== state.guesserId) return;
    if (state.guesses.length >= MAX_ATTEMPTS) return;
    const clean = (word || '').trim().toLowerCase();
    if (!/^[a-z]+$/.test(clean) || clean.length !== state.secretWord.length) return;

    const result = computeResult(clean, state.secretWord);
    state.guesses.push({ word: clean, result });
    const won = clean === state.secretWord;

    io.to(room.code).emit('guessword_update', {
      guesses: state.guesses,
      attemptsLeft: MAX_ATTEMPTS - state.guesses.length,
    });

    if (won || state.guesses.length >= MAX_ATTEMPTS) {
      state.stage = 'roundOver';
      if (won) {
        const points = Math.max(0, 7 - state.guesses.length);
        state.scores[state.guesserId] = (state.scores[state.guesserId] || 0) + points;
      }
      io.to(room.code).emit('guessword_round_over', {
        won,
        secretWord: state.secretWord,
        attempts: state.guesses.length,
        guesses: state.guesses,
        scores: state.scores,
        roundIndex: state.roundIndex,
        isFinalRound: state.roundIndex >= TOTAL_ROUNDS - 1,
      });
    }
  });

  socket.on('guessword_next_round', () => {
    if (room.phase !== 'playing') return;
    const state = room.state;
    if (state.stage !== 'roundOver' || state.roundIndex >= TOTAL_ROUNDS - 1) return;
    state.roundIndex++;
    const tmp = state.setterId;
    state.setterId = state.guesserId;
    state.guesserId = tmp;
    startRound(io, room);
  });
}

module.exports = {
  key: 'guessword',
  meta: {
    title: 'Tebak Kata',
    icon: '🔤',
    desc: 'Satu bikin kata rahasia, satu nebak dengan petunjuk warna ala Wordle.',
  },
  createState,
  start,
  reset,
  registerSocket,
};
