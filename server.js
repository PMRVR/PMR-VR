const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');

const app = express();
const server = http.createServer(app);
app.set('trust proxy', 1);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, 'public')));

const rooms = {};
const bannedUsers = {};

io.on('connection', (socket) => {
  socket.on('joinRoom', (data) => {
    const { roomCode, username } = data;
    if (bannedUsers[roomCode] && bannedUsers[roomCode].includes(username)) {
      socket.emit('bannedError', 'Foste banido desta sala.');
      return;
    }

    socket.join(roomCode);
    if (!rooms[roomCode]) rooms[roomCode] = { players: {}, ownerId: socket.id };
    
    const isOwner = rooms[roomCode].ownerId === socket.id;
    rooms[roomCode].players[socket.id] = { 
      position: { x: 0, y: 1.6, z: 0 }, rotY: 0, username, muted: false, accessory: 'none', isOwner
    };
    
    socket.emit('currentPlayers', rooms[roomCode].players);
    socket.emit('ownerStatus', isOwner);
    socket.to(roomCode).emit('newPlayer', { id: socket.id, ...rooms[roomCode].players[socket.id] });
  });

  socket.on('updatePosition', (data) => {
    const { roomCode, position } = data;
    if (rooms[roomCode] && rooms[roomCode].players[socket.id]) {
      rooms[roomCode].players[socket.id].position = position;
      socket.to(roomCode).emit('playerMoved', { id: socket.id, position });
    }
  });

  socket.on('updateRotation', (data) => {
    const { roomCode, rotY } = data;
    if (rooms[roomCode] && rooms[roomCode].players[socket.id]) {
      rooms[roomCode].players[socket.id].rotY = rotY;
      socket.to(roomCode).emit('playerRotated', { id: socket.id, rotY });
    }
  });

  socket.on('updateAccessory', (data) => {
    const { roomCode, accessory } = data;
    if (rooms[roomCode] && rooms[roomCode].players[socket.id]) {
      rooms[roomCode].players[socket.id].accessory = accessory;
      socket.to(roomCode).emit('playerAccessoryChanged', { id: socket.id, accessory });
    }
  });

  socket.on('toggleMute', (data) => {
    const { roomCode, muted } = data;
    if (rooms[roomCode] && rooms[roomCode].players[socket.id]) {
      rooms[roomCode].players[socket.id].muted = muted;
      socket.to(roomCode).emit('playerMuteChanged', { id: socket.id, muted });
    }
  });

  socket.on('moderatePlayer', (data) => {
    const { roomCode, targetId, action } = data;
    if (rooms[roomCode] && rooms[roomCode].ownerId === socket.id) {
      const targetName = rooms[roomCode].players[targetId]?.username;
      if (action === 'kick') {
        const targetSocket = io.sockets.sockets.get(targetId);
        if (targetSocket) { targetSocket.emit('kickedError', 'Foste expulso.'); targetSocket.disconnect(); }
      } else if (action === 'ban') {
        if (!bannedUsers[roomCode]) bannedUsers[roomCode] = [];
        if (targetName) bannedUsers[roomCode].push(targetName);
        const targetSocket = io.sockets.sockets.get(targetId);
        if (targetSocket) { targetSocket.emit('bannedError', 'Foste banido.'); targetSocket.disconnect(); }
      }
    }
  });

  socket.on('webrtc-offer', (data) => { io.to(data.target).emit('webrtc-offer', { sender: socket.id, offer: data.offer }); });
  socket.on('webrtc-answer', (data) => { io.to(data.target).emit('webrtc-answer', { sender: socket.id, answer: data.answer }); });
  socket.on('webrtc-ice-candidate', (data) => { io.to(data.target).emit('webrtc-ice-candidate', { sender: socket.id, candidate: data.candidate }); });

  socket.on('disconnect', () => {
    for (const roomCode in rooms) {
      if (rooms[roomCode].players[socket.id]) {
        delete rooms[roomCode].players[socket.id];
        socket.to(roomCode).emit('playerDisconnected', socket.id);
        if (rooms[roomCode].ownerId === socket.id) {
          const remaining = Object.keys(rooms[roomCode].players);
          if (remaining.length > 0) {
            rooms[roomCode].ownerId = remaining[0];
            io.to(rooms[roomCode].ownerId).emit('ownerStatus', true);
            io.to(roomCode).emit('newOwner', rooms[roomCode].ownerId);
          }
        }
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor na porta ${PORT}`));