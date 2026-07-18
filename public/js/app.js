const socket = io();

window.GAMES = window.GAMES || {};

const GAME_META = [
  { key: 'quiz', title: 'Quiz Party', icon: '🎉', desc: 'Kalian berdua bikin soal, lalu saling jawab soal pasangan.' },
  { key: 'wyr', title: 'Would You Rather', icon: '🤔', desc: 'Pilih A atau B, lalu lihat apakah pilihan kalian cocok.' },
  { key: 'truthordare', title: 'Truth or Dare', icon: '🎲', desc: 'Gantian giliran, pilih truth atau dare, dapat tantangan random.' },
  { key: 'connect4', title: 'Connect 4', icon: '🔴', desc: 'Gantian jatuhin token, siapa duluan bikin 4 sejajar menang.' },
  { key: 'guessword', title: 'Tebak Kata', icon: '🔤', desc: 'Satu bikin kata rahasia, satu nebak dengan petunjuk warna ala Wordle.' },
  { key: 'pictionary', title: 'Tebak Gambar', icon: '🎨', desc: 'Satu gambar di canvas, satu nebak lewat teks sebelum waktu habis.' },
  { key: 'bombdefusal', title: 'Jinakkan Bom', icon: '💣', desc: 'Kerja sama jinakin bom — satu lihat bomnya, satu baca manual. Nyalain telepon dulu biar bisa ngobrol!' },
];

function fireConfetti(count = 28) {
  const colors = ['#ff5da2', '#4dd7ff', '#ffd15c', '#7c5cff', '#38d976'];
  for (let i = 0; i < count; i++) {
    const el = document.createElement('div');
    el.className = 'confetti-piece';
    el.style.left = `${Math.random() * 100}vw`;
    el.style.background = colors[Math.floor(Math.random() * colors.length)];
    el.style.animationDelay = `${Math.random() * 0.3}s`;
    el.style.animationDuration = `${1.6 + Math.random() * 1}s`;
    el.style.setProperty('--rot', `${Math.floor(Math.random() * 360)}deg`);
    document.body.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
  }
}
window.fireConfetti = fireConfetti;

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

const screenCache = {};
function getScreen(id) {
  if (!screenCache[id]) screenCache[id] = document.getElementById(id);
  return screenCache[id];
}

function showScreen(id) {
  document.querySelectorAll('.screen.active').forEach((s) => s.classList.remove('active'));
  const el = getScreen(id);
  if (el) el.classList.add('active');
}

let myId = null;
let myRoomCode = null;
let myGameType = null;
let selectedGameType = null;

function makeCtx() {
  return {
    socket,
    get myId() { return myId; },
    get roomCode() { return myRoomCode; },
    showScreen,
    escapeHtml,
  };
}

// ---------- HOME: game hub ----------
const gameGrid = document.getElementById('game-grid');
const inputName = document.getElementById('input-name');
const inputCode = document.getElementById('input-code');
const homeError = document.getElementById('home-error');
const btnCreate = document.getElementById('btn-create');

function renderGameGrid() {
  gameGrid.innerHTML = '';
  GAME_META.forEach((g) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'game-card';
    card.dataset.key = g.key;
    card.innerHTML = `
      <span class="game-card-icon">${g.icon}</span>
      <span class="game-card-title">${escapeHtml(g.title)}</span>
      <span class="game-card-desc">${escapeHtml(g.desc)}</span>
    `;
    card.addEventListener('click', () => selectGame(g.key));
    gameGrid.appendChild(card);
  });
  selectGame(GAME_META[0] ? GAME_META[0].key : null);
}

function selectGame(key) {
  selectedGameType = key;
  Array.from(gameGrid.children).forEach((el) => {
    el.classList.toggle('selected', el.dataset.key === key);
  });
  btnCreate.disabled = !key;
}

renderGameGrid();

btnCreate.addEventListener('click', () => {
  const name = inputName.value.trim();
  if (!name) return showHomeError('Isi nama kamu dulu.');
  if (!selectedGameType) return showHomeError('Pilih game dulu.');
  socket.emit('create_room', { name, gameType: selectedGameType }, handleJoinResponse);
});

document.getElementById('btn-join').addEventListener('click', () => {
  const name = inputName.value.trim();
  const code = inputCode.value.trim().toUpperCase();
  if (!name) return showHomeError('Isi nama kamu dulu.');
  if (!code) return showHomeError('Isi kode room.');
  socket.emit('join_room', { name, code }, handleJoinResponse);
});

function showHomeError(msg) {
  homeError.textContent = msg;
}

function handleJoinResponse(res) {
  if (!res.ok) {
    showHomeError(res.error || 'Gagal join room.');
    return;
  }
  homeError.textContent = '';
  myId = res.playerId;
  myRoomCode = res.code;
  myGameType = res.gameType;
  document.getElementById('lobby-code').textContent = res.code;

  const game = window.GAMES[myGameType];
  if (game && typeof game.onEnterRoom === 'function') {
    game.onEnterRoom(makeCtx());
  }
  if (window.CallWidget && typeof window.CallWidget.onEnterRoom === 'function') {
    window.CallWidget.onEnterRoom(makeCtx());
  }
  showScreen('screen-lobby');
}

// ---------- LOBBY (generic) ----------
const playerList = document.getElementById('player-list');
const playerCount = document.getElementById('player-count');

document.getElementById('btn-start').addEventListener('click', () => {
  socket.emit('start_game');
});

function resetLobbyExtras() {
  document.querySelectorAll('.lobby-extra').forEach((el) => { el.hidden = true; });
  document.getElementById('generic-lobby-note').hidden = false;
}

socket.on('room_update', (state) => {
  playerCount.textContent = state.players.length;
  playerList.innerHTML = '';
  state.players.forEach((p) => {
    const li = document.createElement('li');
    li.innerHTML = `<span>${escapeHtml(p.name)}${p.id === myId ? ' (kamu)' : ''}</span><span>${p.score}</span>`;
    playerList.appendChild(li);
  });

  if (state.phase === 'lobby') {
    resetLobbyExtras();
    const game = window.GAMES[state.gameType];
    if (game && typeof game.onLobby === 'function') {
      game.onLobby(makeCtx());
    }
    showScreen('screen-lobby');
  }
});
