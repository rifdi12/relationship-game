const { pickRandom } = require('./utils');

const PROMPTS = [
  { a: 'Liburan ke gunung', b: 'Liburan ke pantai' },
  { a: 'Makan pedas seumur hidup', b: 'Makan manis seumur hidup' },
  { a: 'Bisa teleportasi', b: 'Bisa terbang' },
  { a: 'Nonton film horror', b: 'Nonton film komedi romantis' },
  { a: 'Punya kucing', b: 'Punya anjing' },
  { a: 'Sarapan nasi goreng tiap hari', b: 'Sarapan roti bakar tiap hari' },
  { a: 'Liburan tanpa hp seminggu', b: 'Kerja tanpa libur sebulan' },
  { a: 'Kaya tapi kerja keras', b: 'Cukup tapi santai' },
  { a: 'Bisa baca pikiran pasangan', b: 'Bisa lihat masa depan' },
  { a: 'Selalu telat 10 menit', b: 'Selalu kepagian 30 menit' },
  { a: 'Masak bareng tiap malam', b: 'Makan di luar tiap malam' },
  { a: 'Rumah di kota', b: 'Rumah di desa' },
  { a: 'Nonton konser', b: 'Nonton pertandingan olahraga' },
  { a: 'Hemat banget', b: 'Boros tapi bahagia' },
  { a: 'Chat lucu tiap hari', b: 'Video call tiap malam' },
  { a: 'Liburan luar negeri sendirian', b: 'Staycation berdua' },
  { a: 'Kehilangan indra penciuman', b: 'Kehilangan indra pengecap' },
  { a: 'Dikasih hadiah kejutan', b: 'Diajak liburan kejutan' },
  { a: 'Punya mobil', b: 'Punya motor' },
  { a: 'Bangun pagi olahraga bareng', b: 'Begadang nonton series bareng' },
];

function createState() {
  return {
    currentCard: null, // { a, b }
    choices: new Map(), // socketId -> 'a' | 'b'
    revealed: false,
    roundsPlayed: 0,
    matchCount: 0,
  };
}

function dealCard(io, room) {
  const state = room.state;
  state.currentCard = pickRandom(PROMPTS);
  state.choices = new Map();
  state.revealed = false;
  io.to(room.code).emit('wyr_card', {
    a: state.currentCard.a,
    b: state.currentCard.b,
    roundsPlayed: state.roundsPlayed,
    matchCount: state.matchCount,
  });
}

function revealCard(io, room) {
  const state = room.state;
  state.revealed = true;
  state.roundsPlayed++;
  const values = Array.from(state.choices.values());
  const match = values.length === 2 && values[0] === values[1];
  if (match) state.matchCount++;

  io.to(room.code).emit('wyr_reveal', {
    choices: Object.fromEntries(state.choices),
    match,
    roundsPlayed: state.roundsPlayed,
    matchCount: state.matchCount,
  });
}

function start(io, room, helpers) {
  if (room.phase !== 'lobby') return;
  room.phase = 'playing';
  helpers.broadcastRoomState(room);
  dealCard(io, room);
}

function reset(io, room, helpers) {
  room.phase = 'lobby';
  room.state = createState();
  helpers.broadcastRoomState(room);
}

function registerSocket(io, socket, room) {
  socket.on('wyr_choice', ({ choice }) => {
    if (room.phase !== 'playing') return;
    const state = room.state;
    if (state.revealed || state.choices.has(socket.id)) return;
    if (choice !== 'a' && choice !== 'b') return;
    state.choices.set(socket.id, choice);
    io.to(room.code).emit('wyr_choice_progress', { answeredCount: state.choices.size });
    if (state.choices.size >= 2) revealCard(io, room);
  });

  socket.on('wyr_next', () => {
    if (room.phase !== 'playing') return;
    if (!room.state.revealed) return;
    dealCard(io, room);
  });
}

module.exports = {
  key: 'wyr',
  meta: {
    title: 'Would You Rather',
    icon: '🤔',
    desc: 'Pilih A atau B, lalu lihat apakah pilihan kalian cocok.',
  },
  createState,
  start,
  reset,
  registerSocket,
};
