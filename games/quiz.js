const { shuffle } = require('./utils');

const QUESTION_TIME_MS = 15000;
const REVEAL_TIME_MS = 4000;

function createState() {
  return {
    questions: [], // { id, text, options, correctIndex, authorId }
    order: [], // shuffled question indices for this round
    currentIndex: -1,
    answers: new Map(), // socketId -> { selectedIndex, elapsedMs }
    questionDeadline: 0,
  };
}

function eligibleAnswererCount(room, question) {
  let count = 0;
  for (const p of room.players.values()) {
    if (p.id !== question.authorId) count++;
  }
  return count;
}

function nextQuestion(io, room) {
  const state = room.state;
  clearTimeout(room.timer);
  state.currentIndex++;
  if (state.currentIndex >= state.order.length) {
    finishGame(io, room);
    return;
  }
  const qIdx = state.order[state.currentIndex];
  const question = state.questions[qIdx];
  state.answers = new Map();
  room.phase = 'playing';
  state.questionDeadline = Date.now() + QUESTION_TIME_MS;

  const author = room.players.get(question.authorId);
  io.to(room.code).emit('quiz_new_question', {
    index: state.currentIndex,
    total: state.order.length,
    text: question.text,
    options: question.options,
    timeLimitMs: QUESTION_TIME_MS,
    authorId: question.authorId,
    authorName: author ? author.name : '???',
  });

  room.timer = setTimeout(() => revealAnswer(io, room), QUESTION_TIME_MS);
}

function maybeRevealEarly(io, room) {
  const state = room.state;
  const qIdx = state.order[state.currentIndex];
  const question = state.questions[qIdx];
  const needed = eligibleAnswererCount(room, question);
  if (needed > 0 && state.answers.size >= needed) {
    revealAnswer(io, room);
  }
}

function revealAnswer(io, room) {
  if (room.phase !== 'playing') return;
  const state = room.state;
  clearTimeout(room.timer);
  room.phase = 'reveal';

  const qIdx = state.order[state.currentIndex];
  const question = state.questions[qIdx];

  for (const [socketId, ans] of state.answers.entries()) {
    if (ans.selectedIndex === question.correctIndex) {
      const timeFraction = Math.max(0, 1 - ans.elapsedMs / QUESTION_TIME_MS);
      const points = Math.round(500 + 500 * timeFraction);
      const player = room.players.get(socketId);
      if (player) player.score += points;
    }
  }

  const author = room.players.get(question.authorId);

  io.to(room.code).emit('quiz_reveal_answer', {
    correctIndex: question.correctIndex,
    text: question.text,
    options: question.options,
    authorId: question.authorId,
    authorName: author ? author.name : '???',
    playerAnswers: Array.from(state.answers.entries()).map(([id, a]) => ({
      id,
      selectedIndex: a.selectedIndex,
    })),
    players: publicPlayersSorted(room),
  });

  room.timer = setTimeout(() => nextQuestion(io, room), REVEAL_TIME_MS);
}

function finishGame(io, room) {
  room.phase = 'finished';
  io.to(room.code).emit('quiz_game_over', { players: publicPlayersSorted(room) });
}

function publicPlayersSorted(room) {
  return Array.from(room.players.values())
    .map((p) => ({ id: p.id, name: p.name, score: p.score }))
    .sort((a, b) => b.score - a.score);
}

function start(io, room, helpers) {
  if (room.phase !== 'lobby') return;
  const state = room.state;
  if (state.questions.length < 1) return;
  room.phase = 'playing';
  state.order = shuffle(state.questions.map((_, i) => i));
  state.currentIndex = -1;
  helpers.broadcastRoomState(room);
  io.to(room.code).emit('quiz_game_started');
  nextQuestion(io, room);
}

function reset(io, room, helpers) {
  const state = room.state;
  clearTimeout(room.timer);
  room.phase = 'lobby';
  state.questions = [];
  state.order = [];
  state.currentIndex = -1;
  state.answers = new Map();
  for (const p of room.players.values()) p.score = 0;
  helpers.broadcastRoomState(room);
  io.to(room.code).emit('quiz_lobby_update', { questionCount: 0 });
}

function registerSocket(io, socket, room) {
  socket.emit('quiz_lobby_update', { questionCount: room.state.questions.length });

  socket.on('quiz_submit_question', ({ text, options, correctIndex }) => {
    if (room.phase !== 'lobby') return;
    const cleanText = (text || '').trim().slice(0, 200);
    const cleanOptions = Array.isArray(options)
      ? options.slice(0, 4).map((o) => (o || '').trim().slice(0, 80))
      : [];
    if (!cleanText || cleanOptions.length !== 4 || cleanOptions.some((o) => !o)) return;
    if (typeof correctIndex !== 'number' || correctIndex < 0 || correctIndex > 3) return;
    room.state.questions.push({
      id: `${socket.id}-${Date.now()}`,
      text: cleanText,
      options: cleanOptions,
      correctIndex,
      authorId: socket.id,
    });
    io.to(room.code).emit('quiz_lobby_update', { questionCount: room.state.questions.length });
  });

  socket.on('quiz_submit_answer', ({ selectedIndex }) => {
    if (room.phase !== 'playing') return;
    const state = room.state;
    if (state.answers.has(socket.id)) return;
    const qIdx = state.order[state.currentIndex];
    const question = state.questions[qIdx];
    if (!question || question.authorId === socket.id) return;
    if (typeof selectedIndex !== 'number' || selectedIndex < 0 || selectedIndex > 3) return;
    const elapsedMs = Date.now() - (state.questionDeadline - QUESTION_TIME_MS);
    state.answers.set(socket.id, { selectedIndex, elapsedMs });
    io.to(room.code).emit('quiz_answer_progress', {
      answeredCount: state.answers.size,
      neededCount: eligibleAnswererCount(room, question),
    });
    maybeRevealEarly(io, room);
  });
}

module.exports = {
  key: 'quiz',
  meta: {
    title: 'Quiz Party',
    icon: '🎉',
    desc: 'Kalian berdua bikin soal, lalu saling jawab soal pasangan.',
  },
  createState,
  start,
  reset,
  registerSocket,
};
