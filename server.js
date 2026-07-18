const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const games = require('./games/registry');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_PLAYERS = 2;

/** @type {Map<string, Room>} */
const rooms = new Map();

function makeRoomCode() {
  let code;
  do {
    code = Array.from({ length: 4 }, () =>
      ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)]
    ).join('');
  } while (rooms.has(code));
  return code;
}

function createRoom(gameType) {
  const code = makeRoomCode();
  const room = {
    code,
    gameType,
    phase: 'lobby', // lobby | playing | reveal | finished (meaning is game-specific past 'lobby')
    players: new Map(), // socketId -> { id, name, score }
    state: games[gameType].createState(),
    timer: null,
  };
  rooms.set(code, room);
  return room;
}

function publicPlayers(room) {
  return Array.from(room.players.values())
    .map((p) => ({ id: p.id, name: p.name, score: p.score }))
    .sort((a, b) => b.score - a.score);
}

function broadcastRoomState(room) {
  io.to(room.code).emit('room_update', {
    code: room.code,
    gameType: room.gameType,
    phase: room.phase,
    players: publicPlayers(room),
  });
}

const helpers = { broadcastRoomState, publicPlayers };

function otherPlayerId(room, socketId) {
  return Array.from(room.players.keys()).find((id) => id !== socketId);
}

io.on('connection', (socket) => {
  socket.on('create_room', ({ name, gameType }, cb) => {
    if (!games[gameType]) {
      cb?.({ ok: false, error: 'Game tidak dikenal.' });
      return;
    }
    const room = createRoom(gameType);
    joinRoom(socket, room, name, cb);
  });

  socket.on('join_room', ({ code, name }, cb) => {
    const room = rooms.get((code || '').toUpperCase());
    if (!room) {
      cb?.({ ok: false, error: 'Room tidak ditemukan.' });
      return;
    }
    if (room.phase !== 'lobby') {
      cb?.({ ok: false, error: 'Game sudah dimulai, tidak bisa join sekarang.' });
      return;
    }
    if (room.players.size >= MAX_PLAYERS) {
      cb?.({ ok: false, error: 'Room sudah penuh (maks 2 pemain).' });
      return;
    }
    joinRoom(socket, room, name, cb);
  });

  function joinRoom(socket, room, name, cb) {
    const trimmed = (name || '').trim().slice(0, 20) || 'Pemain';
    socket.data.roomCode = room.code;
    socket.join(room.code);
    room.players.set(socket.id, { id: socket.id, name: trimmed, score: 0 });
    games[room.gameType].registerSocket(io, socket, room, helpers);
    cb?.({ ok: true, code: room.code, playerId: socket.id, gameType: room.gameType });
    broadcastRoomState(room);
  }

  socket.on('start_game', () => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.phase !== 'lobby') return;
    if (room.players.size < MAX_PLAYERS) return;
    games[room.gameType].start(io, room, helpers);
  });

  socket.on('play_again', () => {
    const room = rooms.get(socket.data.roomCode);
    if (!room) return;
    games[room.gameType].reset(io, room, helpers);
  });

  // ---- Voice call signaling (generic, independent of game type) ----
  // Server never holds call state — it's just a relay between the two
  // players in a room. The client owns the call state machine.

  function relayToPartner(eventOut, data) {
    const room = rooms.get(socket.data.roomCode);
    if (!room) return;
    const otherId = otherPlayerId(room, socket.id);
    if (!otherId) return;
    if (data === undefined) io.to(otherId).emit(eventOut);
    else io.to(otherId).emit(eventOut, data);
  }

  socket.on('call_invite', () => {
    const room = rooms.get(socket.data.roomCode);
    if (!room) return;
    const me = room.players.get(socket.id);
    relayToPartner('call_incoming', { fromName: me ? me.name : 'Pasangan' });
  });

  socket.on('call_accept', () => relayToPartner('call_accepted'));
  socket.on('call_reject', () => relayToPartner('call_rejected'));
  socket.on('call_cancel', () => relayToPartner('call_cancelled'));
  socket.on('call_end', () => relayToPartner('call_ended'));
  socket.on('webrtc_offer', (data) => relayToPartner('webrtc_offer', data));
  socket.on('webrtc_answer', (data) => relayToPartner('webrtc_answer', data));
  socket.on('webrtc_ice_candidate', (data) => relayToPartner('webrtc_ice_candidate', data));

  socket.on('disconnect', () => {
    const room = rooms.get(socket.data.roomCode);
    if (!room) return;
    const otherId = otherPlayerId(room, socket.id);
    room.players.delete(socket.id);
    games[room.gameType].onDisconnect?.(io, room, socket, helpers);
    if (otherId) io.to(otherId).emit('call_ended');
    if (room.players.size === 0) {
      clearTimeout(room.timer);
      rooms.delete(room.code);
      return;
    }
    broadcastRoomState(room);
  });
});

server.listen(PORT, () => {
  console.log(`Game Party server running on http://localhost:${PORT}`);
});
