// server.js
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

// Servir o ficheiro HTML
app.use(express.static(path.join(__dirname, 'public')));

// Estrutura das salas: { "123456789012": { players: { "socketId": { x, y, z } } } }
const rooms = {};

io.on('connection', (socket) => {
  console.log('Novo jogador conectado:', socket.id);

  // Entrar numa sala
  socket.on('joinRoom', (roomCode) => {
    socket.join(roomCode);
    
    if (!rooms[roomCode]) {
      rooms[roomCode] = { players: {} };
    }

    // Adiciona o jogador na posição inicial
    rooms[roomCode].players[socket.id] = { x: 0, y: 1.6, z: 0 };
    
    // Envia a lista de jogadores atuais para o novo jogador
    socket.emit('currentPlayers', rooms[roomCode].players);
    
    // Avisa os outros que um novo jogador entrou
    socket.to(roomCode).emit('newPlayer', { id: socket.id, ...rooms[roomCode].players[socket.id] });
    
    console.log(`Jogador ${socket.id} entrou na sala ${roomCode}`);
  });

  // Atualizar posição
  socket.on('updatePosition', (data) => {
    const { roomCode, position } = data;
    if (rooms[roomCode] && rooms[roomCode].players[socket.id]) {
      rooms[roomCode].players[socket.id] = position;
      // Envia a nova posição para todos os outros na sala
      socket.to(roomCode).emit('playerMoved', { id: socket.id, position });
    }
  });

  // Desconectar
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
server.listen(PORT, () => {
  console.log(`Servidor a correr na porta ${PORT}`);
});
