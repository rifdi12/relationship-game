const { pickRandom, shuffle } = require('./utils');

const BOMB_TIME_MS = 4 * 60 * 1000;
const MAX_STRIKES = 3;

const WIRE_COLORS = ['red', 'blue', 'yellow', 'black', 'white'];

// No overlap between groups — whichever group contains all 4 given
// symbols is unambiguously the correct one.
const SYMBOL_GROUPS = [
  ['★', '♦', '●', '▲'],
  ['✚', '◆', '♥', '■', '☾'],
  ['◉', '☘', '✦', '◈', '♧', '☂'],
];

const SIMON_COLORS = ['red', 'blue', 'yellow', 'green'];
const SIMON_MAP = { red: 'blue', blue: 'yellow', yellow: 'green', green: 'red' };

function solveWires(wires) {
  const redIndexes = wires.map((c, i) => (c === 'red' ? i : -1)).filter((i) => i >= 0);
  if (redIndexes.length === 0) return 1;
  if (redIndexes.length === 1) return wires.length - 1;
  const lastRed = redIndexes[redIndexes.length - 1];
  return lastRed + 1 < wires.length ? lastRed + 1 : 0;
}

function generateWiresModule() {
  const wires = Array.from({ length: 5 }, () => pickRandom(WIRE_COLORS));
  return {
    type: 'wires',
    wires,
    cutWires: [],
    solutionIndex: solveWires(wires),
    solved: false,
  };
}

function generateSymbolsModule() {
  const group = pickRandom(SYMBOL_GROUPS);
  const chosen = shuffle(group).slice(0, 4);
  const solutionSequence = group.filter((s) => chosen.includes(s));
  return {
    type: 'symbols',
    displayOrder: shuffle(chosen),
    solutionSequence,
    progress: 0,
    solved: false,
  };
}

function generateSimonModule() {
  const sequence = Array.from({ length: 4 }, () => pickRandom(SIMON_COLORS));
  return {
    type: 'simon',
    sequence,
    solutionSequence: sequence.map((c) => SIMON_MAP[c]),
    progress: 0,
    solved: false,
  };
}

function createState() {
  return {
    defuserId: null,
    expertId: null,
    modules: [],
    strikes: 0,
    deadline: 0,
    result: null, // null | 'won' | 'lost'
    swapNext: false,
  };
}

function publicDefuserModule(mod) {
  if (mod.type === 'wires') return { type: 'wires', wires: mod.wires, cutWires: mod.cutWires, solved: mod.solved };
  if (mod.type === 'symbols') return { type: 'symbols', displayOrder: mod.displayOrder, progress: mod.progress, total: mod.solutionSequence.length, solved: mod.solved };
  return { type: 'simon', sequence: mod.sequence, progress: mod.progress, total: mod.solutionSequence.length, solved: mod.solved };
}

function broadcastBombState(io, room) {
  const state = room.state;
  io.to(state.defuserId).emit('bomb_state_defuser', {
    modules: state.modules.map(publicDefuserModule),
    strikes: state.strikes,
    maxStrikes: MAX_STRIKES,
    deadline: state.deadline,
  });
  io.to(state.expertId).emit('bomb_state_expert', {
    modulesSolved: state.modules.map((m) => m.solved),
    strikes: state.strikes,
    maxStrikes: MAX_STRIKES,
    deadline: state.deadline,
  });
}

function endGame(io, room, result) {
  const state = room.state;
  if (state.result) return;
  clearTimeout(room.timer);
  state.result = result;
  io.to(room.code).emit('bomb_game_over', { result });
}

// Broadcasts the up-to-date board state first, then evaluates win/lose —
// this ordering matters so clients render the final wire/symbol/simon
// state before the "Kembali/Main Lagi" overlay appears on top of it.
function finalizeAction(io, room) {
  broadcastBombState(io, room);
  const state = room.state;
  if (state.result) return;
  if (state.modules.every((m) => m.solved)) {
    endGame(io, room, 'won');
  } else if (state.strikes >= MAX_STRIKES) {
    endGame(io, room, 'lost');
  }
}

function start(io, room, helpers) {
  if (room.phase !== 'lobby') return;
  const state = room.state;
  const ids = Array.from(room.players.keys());
  const [defuserId, expertId] = state.swapNext ? [ids[1], ids[0]] : [ids[0], ids[1]];
  state.defuserId = defuserId;
  state.expertId = expertId;
  state.modules = [generateWiresModule(), generateSymbolsModule(), generateSimonModule()];
  state.strikes = 0;
  state.result = null;
  state.deadline = Date.now() + BOMB_TIME_MS;
  room.phase = 'playing';
  helpers.broadcastRoomState(room);
  broadcastBombState(io, room);
  room.timer = setTimeout(() => endGame(io, room, 'lost'), BOMB_TIME_MS);
}

function reset(io, room, helpers) {
  clearTimeout(room.timer);
  const prevSwap = room.state ? room.state.swapNext : false;
  room.phase = 'lobby';
  room.state = createState();
  room.state.swapNext = !prevSwap;
  helpers.broadcastRoomState(room);
}

function registerSocket(io, socket, room) {
  socket.on('bomb_cut_wire', ({ moduleIndex, wireIndex }) => {
    if (room.phase !== 'playing' || room.state.result) return;
    const state = room.state;
    if (socket.id !== state.defuserId) return;
    const mod = state.modules[moduleIndex];
    if (!mod || mod.type !== 'wires' || mod.solved) return;
    if (typeof wireIndex !== 'number' || wireIndex < 0 || wireIndex >= mod.wires.length) return;
    if (mod.cutWires.includes(wireIndex)) return;

    const correct = wireIndex === mod.solutionIndex;
    if (correct) {
      mod.solved = true;
    } else {
      mod.cutWires.push(wireIndex);
      state.strikes++;
    }
    io.to(state.defuserId).emit('bomb_action_feedback', { moduleIndex, correct });
    finalizeAction(io, room);
  });

  socket.on('bomb_click', ({ moduleIndex, value }) => {
    if (room.phase !== 'playing' || room.state.result) return;
    const state = room.state;
    if (socket.id !== state.defuserId) return;
    const mod = state.modules[moduleIndex];
    if (!mod || mod.solved || (mod.type !== 'symbols' && mod.type !== 'simon')) return;

    const expected = mod.solutionSequence[mod.progress];
    const correct = value === expected;
    if (correct) {
      mod.progress++;
      if (mod.progress >= mod.solutionSequence.length) mod.solved = true;
    } else {
      mod.progress = 0;
      state.strikes++;
    }
    io.to(state.defuserId).emit('bomb_action_feedback', { moduleIndex, correct });
    finalizeAction(io, room);
  });
}

module.exports = {
  key: 'bombdefusal',
  meta: {
    title: 'Jinakkan Bom',
    icon: '💣',
    desc: 'Kerja sama jinakin bom — satu lihat bomnya, satu baca manual. Nyalain telepon dulu biar bisa ngobrol!',
  },
  createState,
  start,
  reset,
  registerSocket,
};
