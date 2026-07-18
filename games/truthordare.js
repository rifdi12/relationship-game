const { pickRandom } = require('./utils');

const TRUTHS = [
  'Apa momen paling malu-maluin yang pernah kamu alami sama pasanganmu?',
  'Siapa first crush kamu sebelum kenal pasanganmu?',
  'Kebiasaan pasanganmu yang bikin kamu gemas itu apa?',
  'Kalau bisa ulang first date kalian, apa yang mau kamu ubah?',
  'Apa hal yang paling kamu takutkan dalam hubungan kalian?',
  'Pernah nggak diem-diem baca chat pasanganmu? Ngaku!',
  'Lagu apa yang paling ngingetin kamu sama pasanganmu?',
  'Siapa yang lebih sering salah paham duluan, kamu atau pasanganmu?',
  'Hadiah dari pasanganmu yang paling berkesan itu apa?',
  'Kalau harus milih, liburan sama pasangan atau sama temen-temen?',
  'Apa yang bikin kamu jatuh cinta pertama kali sama pasanganmu?',
  'Pernah nggak kamu nangis gara-gara pasanganmu?',
  'Rencana masa depan apa yang belum pernah kamu ceritain?',
  'Kebiasaan pasanganmu yang paling nyebelin apa?',
  'Siapa yang lebih pelupa, kamu atau pasanganmu?',
];

const DARES = [
  'Kirim voice note nyanyi 10 detik buat pasanganmu sekarang.',
  'Peluk pasanganmu selama 15 detik.',
  'Bilang 3 hal yang kamu suka dari pasanganmu, langsung sekarang.',
  'Foto selfie bareng dengan ekspresi paling lucu.',
  'Kasih pijitan bahu 30 detik ke pasangan.',
  'Ceritain kenangan lucu tentang kalian berdua.',
  'Panggil pasanganmu pakai panggilan sayang paling gombal 1 menit ke depan.',
  'Tirukan gaya bicara pasanganmu.',
  'Kasih pasanganmu satu pujian dalam bahasa Inggris.',
  'Nyanyikan potongan lagu favorit kalian berdua.',
  'Tebak makanan favorit pasanganmu tanpa nanya.',
  'Buat wajah paling aneh dan tahan 5 detik.',
  'Ceritain satu hal receh yang bikin kamu ketawa hari ini.',
  'Gandeng tangan pasangan sambil bilang "makasih udah main bareng aku".',
  'Kasih satu emoji yang paling menggambarkan pasanganmu, jelasin kenapa.',
];

const BANKS = { truth: TRUTHS, dare: DARES };

function createState() {
  return {
    turnPlayerId: null,
    stage: 'idle', // 'choosing' | 'card'
    currentCard: null, // { type, text }
    roundsPlayed: 0,
  };
}

function nameOf(room, id) {
  const p = room.players.get(id);
  return p ? p.name : '???';
}

function emitTurn(io, room) {
  const state = room.state;
  io.to(room.code).emit('tod_turn', {
    turnPlayerId: state.turnPlayerId,
    turnName: nameOf(room, state.turnPlayerId),
    roundsPlayed: state.roundsPlayed,
  });
}

function start(io, room, helpers) {
  if (room.phase !== 'lobby') return;
  room.phase = 'playing';
  const state = room.state;
  state.turnPlayerId = Array.from(room.players.keys())[0];
  state.stage = 'choosing';
  state.currentCard = null;
  helpers.broadcastRoomState(room);
  emitTurn(io, room);
}

function reset(io, room, helpers) {
  room.phase = 'lobby';
  room.state = createState();
  helpers.broadcastRoomState(room);
}

function registerSocket(io, socket, room) {
  socket.on('tod_choose', ({ type }) => {
    if (room.phase !== 'playing') return;
    const state = room.state;
    if (state.stage !== 'choosing' || socket.id !== state.turnPlayerId) return;
    if (type !== 'truth' && type !== 'dare') return;
    state.currentCard = { type, text: pickRandom(BANKS[type]) };
    state.stage = 'card';
    io.to(room.code).emit('tod_card', {
      type,
      text: state.currentCard.text,
      targetId: state.turnPlayerId,
      targetName: nameOf(room, state.turnPlayerId),
    });
  });

  socket.on('tod_done', () => {
    if (room.phase !== 'playing') return;
    const state = room.state;
    if (state.stage !== 'card') return;
    state.roundsPlayed++;
    const ids = Array.from(room.players.keys());
    const otherId = ids.find((id) => id !== state.turnPlayerId) || ids[0];
    state.turnPlayerId = otherId;
    state.stage = 'choosing';
    state.currentCard = null;
    emitTurn(io, room);
  });
}

module.exports = {
  key: 'truthordare',
  meta: {
    title: 'Truth or Dare',
    icon: '🎲',
    desc: 'Gantian giliran, pilih truth atau dare, dapat tantangan random.',
  },
  createState,
  start,
  reset,
  registerSocket,
};
