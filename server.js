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

io.on('connection', (socket) => {
  socket.on('joinRoom', (data) => {
    const { roomCode, username } = data;
    socket.join(roomCode);
    if (!rooms[roomCode]) rooms[roomCode] = { players: {} };
    
    rooms[roomCode].players[socket.id] = { 
      position: { x: 0, y: 1.6, z: 0 }, 
      rotY: 0,
      username: username,
      muted: false
    };
    
    socket.emit('currentPlayers', rooms[roomCode].players);
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

  socket.on('toggleMute', (data) => {
    const { roomCode, muted } = data;
    if (rooms[roomCode] && rooms[roomCode].players[socket.id]) {
      rooms[roomCode].players[socket.id].muted = muted;
      socket.to(roomCode).emit('playerMuteChanged', { id: socket.id, muted });
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
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor na porta ${PORT}`));