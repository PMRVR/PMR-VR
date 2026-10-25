const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');

const app = express();
const server = http.createServer(app);

// IMPORTANTE para o Render (IP real e WebSockets)
app.set('trust proxy', 1);

const io = new Server(server, { 
  cors: { origin: "*" },
  maxHttpBufferSize: 1e6 // Permite pacotes maiores para o WebRTC
});

app.use(express.static(path.join(__dirname, 'public')));

// Estrutura das salas
// rooms = { "123": { players: { "socketId": { position, username, muted } } } }
const rooms = {};

io.on('connection', (socket) => {
  console.log(`[+] Novo jogador conectado: ${socket.id}`);

  // Entrar numa sala
  socket.on('joinRoom', (data) => {
    const { roomCode, username } = data;
    socket.join(roomCode);
    
    if (!rooms[roomCode]) rooms[roomCode] = { players: {} };
    
    rooms[roomCode].players[socket.id] = { 
      position: { x: 0, y: 1.6, z: 0 }, 
      username: username,
      muted: false
    };
    
    // Envia a lista atual para o novo jogador
    socket.emit('currentPlayers', rooms[roomCode].players);
    
    // Avisa os outros que alguém entrou
    socket.to(roomCode).emit('newPlayer', { id: socket.id, ...rooms[roomCode].players[socket.id] });
    console.log(`Jogador ${username} entrou na sala ${roomCode}`);
  });

  // Atualizar posição
  socket.on('updatePosition', (data) => {
    const { roomCode, position } = data;
    if (rooms[roomCode] && rooms[roomCode].players[socket.id]) {
      rooms[roomCode].players[socket.id].position = position;
      socket.to(roomCode).emit('playerMoved', { id: socket.id, position });
    }
  });

  // Ativar/Desativar Microfone
  socket.on('toggleMute', (data) => {
    const { roomCode, muted } = data;
    if (rooms[roomCode] && rooms[roomCode].players[socket.id]) {
      rooms[roomCode].players[socket.id].muted = muted;
      socket.to(roomCode).emit('playerMuteChanged', { id: socket.id, muted });
    }
  });

  // ============ WEBRTC SIGNALING (VOICE CHAT) ============
  
  // 1. Quem quer falar envia a oferta
  socket.on('webrtc-offer', (data) => {
    // data = { target: "id", offer: RTCSessionDescription }
    io.to(data.target).emit('webrtc-offer', { 
      sender: socket.id, 
      offer: data.offer 
    });
  });

  // 2. Quem recebe responde com a resposta
  socket.on('webrtc-answer', (data) => {
    // data = { target: "id", answer: RTCSessionDescription }
    io.to(data.target).emit('webrtc-answer', { 
      sender: socket.id, 
      answer: data.answer 
    });
  });

  // 3. Troca de candidatos ICE (caminhos de rede)
  socket.on('webrtc-ice-candidate', (data) => {
    // data = { target: "id", candidate: RTCIceCandidate }
    io.to(data.target).emit('webrtc-ice-candidate', { 
      sender: socket.id, 
      candidate: data.candidate 
    });
  });

  // Desconectar
  socket.on('disconnect', () => {
    for (const roomCode in rooms) {
      if (rooms[roomCode].players[socket.id]) {
        const username = rooms[roomCode].players[socket.id].username;
        delete rooms[roomCode].players[socket.id];
        socket.to(roomCode).emit('playerDisconnected', socket.id);
        console.log(`[-] Jogador ${username} saiu da sala ${roomCode}`);
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ Servidor Blocky Tag a correr na porta ${PORT}`);
});