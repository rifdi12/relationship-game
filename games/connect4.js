const ROWS = 6;
const COLS = 7;

function createState() {
  return {
    board: Array(ROWS * COLS).fill(null), // row-major, index = row*COLS+col, row 0 = top
    symbols: {}, // socketId -> 'R' | 'Y'
    turn: 'R',
    winner: null, // null | 'R' | 'Y' | 'draw'
    scores: { R: 0, Y: 0, draws: 0 },
    starter: 'R',
  };
}

function countDir(board, row, col, dr, dc, symbol) {
  let r = row + dr;
  let c = col + dc;
  let count = 0;
  while (r >= 0 && r < ROWS && c >= 0 && c < COLS && board[r * COLS + c] === symbol) {
    count++;
    r += dr;
    c += dc;
  }
  return count;
}

function checkWin(board, row, col, symbol) {
  const dirs = [
    [0, 1], // horizontal
    [1, 0], // vertical
    [1, 1], // diagonal down-right
    [1, -1], // diagonal down-left
  ];
  return dirs.some(([dr, dc]) => {
    const count = 1 + countDir(board, row, col, dr, dc, symbol) + countDir(board, row, col, -dr, -dc, symbol);
    return count >= 4;
  });
}

function emitState(io, room) {
  const state = room.state;
  const names = {};
  for (const [id, sym] of Object.entries(state.symbols)) {
    const p = room.players.get(id);
    names[sym] = p ? p.name : '???';
  }
  io.to(room.code).emit('c4_state', {
    board: state.board,
    turn: state.turn,
    winner: state.winner,
    scores: state.scores,
    symbolOf: state.symbols,
    names,
  });
}

function start(io, room, helpers) {
  if (room.phase !== 'lobby') return;
  const state = room.state;
  const ids = Array.from(room.players.keys());
  state.symbols = { [ids[0]]: 'R', [ids[1]]: 'Y' };
  state.board = Array(ROWS * COLS).fill(null);
  state.winner = null;
  state.turn = state.starter;
  room.phase = 'playing';
  helpers.broadcastRoomState(room);
  emitState(io, room);
}

function reset(io, room, helpers) {
  room.phase = 'lobby';
  room.state = createState();
  helpers.broadcastRoomState(room);
}

function registerSocket(io, socket, room) {
  socket.on('c4_drop', ({ col }) => {
    if (room.phase !== 'playing') return;
    const state = room.state;
    if (state.winner) return;
    const mySymbol = state.symbols[socket.id];
    if (!mySymbol || state.turn !== mySymbol) return;
    if (typeof col !== 'number' || col < 0 || col >= COLS) return;

    let landedRow = -1;
    for (let r = ROWS - 1; r >= 0; r--) {
      const idx = r * COLS + col;
      if (!state.board[idx]) {
        landedRow = r;
        break;
      }
    }
    if (landedRow === -1) return; // column full

    const idx = landedRow * COLS + col;
    state.board[idx] = mySymbol;

    if (checkWin(state.board, landedRow, col, mySymbol)) {
      state.winner = mySymbol;
      state.scores[mySymbol]++;
    } else if (state.board.every((v) => v)) {
      state.winner = 'draw';
      state.scores.draws++;
    } else {
      state.turn = mySymbol === 'R' ? 'Y' : 'R';
    }

    emitState(io, room);
  });

  socket.on('c4_next_round', () => {
    if (room.phase !== 'playing') return;
    const state = room.state;
    if (!state.winner) return;
    state.starter = state.starter === 'R' ? 'Y' : 'R';
    state.board = Array(ROWS * COLS).fill(null);
    state.turn = state.starter;
    state.winner = null;
    emitState(io, room);
  });
}

module.exports = {
  key: 'connect4',
  meta: {
    title: 'Connect 4',
    icon: '🔴',
    desc: 'Gantian jatuhin token, siapa duluan bikin 4 sejajar menang.',
  },
  createState,
  start,
  reset,
  registerSocket,
};
