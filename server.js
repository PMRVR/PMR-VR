const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, 'public')));

// Estrutura: { "123": { players: { "id": { pos, username, muted } } } }
const rooms = {};

io.on('connection', (socket) => {
  socket.on('joinRoom', (data) => {
    const { roomCode, username } = data;
    socket.join(roomCode);
    
    if (!rooms[roomCode]) rooms[roomCode] = { players: {} };
    
    // Posição inicial e estado de voz
    rooms[roomCode].players[socket.id] = { 
      position: { x: 0, y: 1.6, z: 0 }, 
      username: username,
      muted: false
    };
    
    // Envia para o novo jogador a lista de quem já está na sala
    socket.emit('currentPlayers', rooms[roomCode].players);
    // Avisa os outros que alguém entrou
    socket.to(roomCode).emit('newPlayer', { id: socket.id, ...rooms[roomCode].players[socket.id] });
  });

  socket.on('updatePosition', (data) => {
    const { roomCode, position } = data;
    if (rooms[roomCode] && rooms[roomCode].players[socket.id]) {
      rooms[roomCode].players[socket.id].position = position;
      socket.to(roomCode).emit('playerMoved', { id: socket.id, position });
    }
  });

  // Quando alguém liga/desliga o microfone
  socket.on('toggleMute', (data) => {
    const { roomCode, muted } = data;
    if (rooms[roomCode] && rooms[roomCode].players[socket.id]) {
      rooms[roomCode].players[socket.id].muted = muted;
      socket.to(roomCode).emit('playerMuteChanged', { id: socket.id, muted });
    }
  });

  socket.on('disconnect', () => {
    for (const roomCode in rooms) {
      if (rooms[roomCode].players[socket.id]) {
        delete rooms[roomCode].players[socket.id];
        socket.to(roomCode).emit('playerDisconnected', socket.id);
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor na porta ${PORT}`));