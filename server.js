const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');

const app = express();
const server = http.createServer(app);
app.set('trust proxy', 1);

// Configuração do Socket.IO otimizada para VR/Mobile
const io = new Server(server, { 
    cors: { origin: "*" },
    pingInterval: 10000, // Testa a ligação a cada 10s
    pingTimeout: 5000,   // Se não responder em 5s, desconecta (evita fantasmas)
    maxHttpBufferSize: 1e5 // Limita o tamanho dos pacotes para evitar spam
});

app.use(express.static(path.join(__dirname, 'public')));

const rooms = {};
const bannedUsers = {};

// ============ LOOP DE FPS DO SERVIDOR ============
let serverFPS = 60;
let frameCount = 0;
let lastFpsTime = Date.now();

// Contador de FPS do servidor (corre no event loop)
setInterval(() => {
    const now = Date.now();
    const delta = (now - lastFpsTime) / 1000;
    serverFPS = Math.round(frameCount / delta);
    frameCount = 0;
    lastFpsTime = now;

    // Envia os stats para todos os jogadores na sala
    io.emit('serverStats', { fps: serverFPS });
}, 1000);

// Interceta pacotes para contar FPS (simulação de carga)
io.use((socket, next) => {
    socket.onAny(() => { frameCount++; });
    next();
});


io.on('connection', (socket) => {
  socket.on('joinRoom', (data) => {
    const { roomCode, username } = data;
    if (bannedUsers[roomCode] && bannedUsers[roomCode].includes(username)) {
      socket.emit('bannedError', 'Foste banido.');
      return;
    }
    socket.join(roomCode);
    if (!rooms[roomCode]) {
        rooms[roomCode] = { 
            players: {}, 
            ownerId: socket.id,
            updateBuffer: {} // Buffer para otimização de rede
        };
    }
    
    const isOwner = rooms[roomCode].ownerId === socket.id;
    rooms[roomCode].players[socket.id] = { 
        position: { x: 0, y: 1.6, z: 0 }, 
        rotY: 0, 
        username, 
        muted: false, 
        accessory: 'none', 
        isOwner,
        ping: 0 
    };
    
    socket.emit('currentPlayers', rooms[roomCode].players);
    socket.emit('ownerStatus', isOwner);
    socket.to(roomCode).emit('newPlayer', { id: socket.id, ...rooms[roomCode].players[socket.id] });
  });

  // ============ OTIMIZAÇÃO DE MOVIMENTO (Recebe a 20Hz, envia a 20Hz) ============
  socket.on('updatePosition', (data) => {
    const { roomCode, position } = data;
    if (rooms[roomCode] && rooms[roomCode].players[socket.id]) {
      rooms[roomCode].players[socket.id].position = position;
      // Guarda no buffer em vez de enviar logo
      if (!rooms[roomCode].updateBuffer[socket.id]) rooms[roomCode].updateBuffer[socket.id] = {};
      rooms[roomCode].updateBuffer[socket.id].position = position;
    }
  });

  socket.on('updateRotation', (data) => {
    const { roomCode, rotY } = data;
    if (rooms[roomCode] && rooms[roomCode].players[socket.id]) {
      rooms[roomCode].players[socket.id].rotY = rotY;
      if (!rooms[roomCode].updateBuffer[socket.id]) rooms[roomCode].updateBuffer[socket.id] = {};
      rooms[roomCode].updateBuffer[socket.id].rotY = rotY;
    }
  });

  // Loop de sincronização de rede (corre a 20Hz)
  setInterval(() => {
    for (const roomCode in rooms) {
      const room = rooms[roomCode];
      const playersToUpdate = Object.keys(room.updateBuffer);
      
      if (playersToUpdate.length > 0) {
        // Agrupa todas as atualizações num único pacote
        const batchedUpdates = [];
        playersToUpdate.forEach(id => {
          batchedUpdates.push({ id, ...room.updateBuffer[id] });
        });
        
        // Envia o pacote para a sala inteira
        io.to(roomCode).emit('batchUpdate', batchedUpdates);
        
        // Limpa o buffer
        room.updateBuffer = {};
      }
    }
  }, 50); // 50ms = 20Hz


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
        delete rooms[roomCode].updateBuffer[socket.id]; // Limpa o buffer
        socket.to(roomCode).emit('playerDisconnected', socket.id);
        
        if (rooms[roomCode].ownerId === socket.id) {
          const remaining = Object.keys(rooms[roomCode].players);
          if (remaining.length > 0) {
            rooms[roomCode].ownerId = remaining[0];
            io.to(rooms[roomCode].ownerId).emit('ownerStatus', true);
            io.to(roomCode).emit('newOwner', rooms[roomCode].ownerId);
          }
        }

        // === LIMPEZA DE MEMÓRIA ===
        // Se a sala ficou vazia, apaga-a após 60 segundos (para não lotar o Render)
        if (Object.keys(rooms[roomCode].players).length === 0) {
            setTimeout(() => {
                if (rooms[roomCode] && Object.keys(rooms[roomCode].players).length === 0) {
                    delete rooms[roomCode];
                    console.log(`Sala ${roomCode} apagada da memória.`);
                }
            }, 60000);
        }
      }
    }
  });
});

// ============ FPS E PING NO CLIENTE ============
// O servidor agora emite 'serverStats' para o cliente.

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor na porta ${PORT}`));