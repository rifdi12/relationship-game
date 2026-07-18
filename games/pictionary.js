const { pickRandom } = require('./utils');

const ROUND_TIME_MS = 60000;

const WORD_BANK = [
  'kucing', 'anjing', 'gitar', 'hujan', 'matahari',
  'sepeda', 'rumah', 'pohon', 'ikan', 'bulan',
  'mobil', 'pizza', 'payung', 'kursi', 'gunung',
  'bintang', 'jam', 'buku', 'topi', 'kupu-kupu',
];

function createState() {
  return {
    drawerId: null,
    guesserId: null,
    secretWord: null,
    roundsPlayed: 0,
    scores: {}, // socketId -> accumulated points
    deadline: 0,
    roundActive: false,
  };
}

function nameOf(room, id) {
  const p = room.players.get(id);
  return p ? p.name : '???';
}

function emitRoundStart(io, room) {
  const state = room.state;
  const drawerName = nameOf(room, state.drawerId);
  const guesserName = nameOf(room, state.guesserId);

  io.to(state.drawerId).emit('pictionary_round_start', {
    role: 'drawer',
    word: state.secretWord,
    roundsPlayed: state.roundsPlayed,
    timeLimitMs: ROUND_TIME_MS,
    drawerName,
    guesserName,
  });
  io.to(state.guesserId).emit('pictionary_round_start', {
    role: 'guesser',
    wordLength: state.secretWord.length,
    roundsPlayed: state.roundsPlayed,
    timeLimitMs: ROUND_TIME_MS,
    drawerName,
    guesserName,
  });
}

function beginRound(io, room) {
  const state = room.state;
  clearTimeout(room.timer);
  state.secretWord = pickRandom(WORD_BANK);
  state.roundActive = true;
  state.deadline = Date.now() + ROUND_TIME_MS;
  emitRoundStart(io, room);
  room.timer = setTimeout(() => endRound(io, room, { won: false }), ROUND_TIME_MS);
}

function endRound(io, room, { won, points = 0 }) {
  const state = room.state;
  clearTimeout(room.timer);
  state.roundActive = false;
  state.roundsPlayed++;
  io.to(room.code).emit('pictionary_round_over', {
    won,
    word: state.secretWord,
    points,
    scores: state.scores,
    roundsPlayed: state.roundsPlayed,
  });
}

function start(io, room, helpers) {
  if (room.phase !== 'lobby') return;
  const state = room.state;
  const ids = Array.from(room.players.keys());
  state.drawerId = ids[0];
  state.guesserId = ids[1];
  state.scores = { [ids[0]]: 0, [ids[1]]: 0 };
  state.roundsPlayed = 0;
  room.phase = 'playing';
  helpers.broadcastRoomState(room);
  beginRound(io, room);
}

function reset(io, room, helpers) {
  clearTimeout(room.timer);
  room.phase = 'lobby';
  room.state = createState();
  helpers.broadcastRoomState(room);
}

function registerSocket(io, socket, room) {
  socket.on('draw_stroke', (seg) => {
    if (room.phase !== 'playing') return;
    const state = room.state;
    if (!state.roundActive || socket.id !== state.drawerId) return;
    io.to(state.guesserId).emit('draw_stroke', seg);
  });

  socket.on('clear_canvas', () => {
    if (room.phase !== 'playing') return;
    const state = room.state;
    if (!state.roundActive || socket.id !== state.drawerId) return;
    io.to(state.guesserId).emit('clear_canvas');
  });

  socket.on('guess_text', ({ text }) => {
    if (room.phase !== 'playing') return;
    const state = room.state;
    if (!state.roundActive || socket.id !== state.guesserId) return;
    const clean = (text || '').trim();
    if (!clean) return;

    const isCorrect = clean.toLowerCase() === state.secretWord.toLowerCase();
    io.to(room.code).emit('pictionary_guess_feed', {
      name: nameOf(room, socket.id),
      text: clean,
      correct: isCorrect,
    });

    if (isCorrect) {
      const remainingMs = Math.max(0, state.deadline - Date.now());
      const points = Math.max(10, Math.round(100 * (remainingMs / ROUND_TIME_MS)));
      state.scores[socket.id] = (state.scores[socket.id] || 0) + points;
      endRound(io, room, { won: true, points });
    }
  });

  socket.on('pictionary_next_round', () => {
    if (room.phase !== 'playing') return;
    const state = room.state;
    if (state.roundActive) return;
    const tmp = state.drawerId;
    state.drawerId = state.guesserId;
    state.guesserId = tmp;
    beginRound(io, room);
  });
}

module.exports = {
  key: 'pictionary',
  meta: {
    title: 'Tebak Gambar',
    icon: '🎨',
    desc: 'Satu gambar di canvas, satu nebak lewat teks sebelum waktu habis.',
  },
  createState,
  start,
  reset,
  registerSocket,
};
