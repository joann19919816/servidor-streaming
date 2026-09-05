const fs = require('fs');
const http = require('http');
const https = require('https');
const express = require('express');
const { Server } = require('socket.io');

const app = express();

// Opcion B: si se proveen certificados (mismos del dominio), se sirve wss:// directo en este puerto.
const SSL_CERT_PATH = process.env.SSL_CERT_PATH || '';
const SSL_KEY_PATH = process.env.SSL_KEY_PATH || '';
const SSL_CA_PATH = process.env.SSL_CA_PATH || '';

let server;
if (SSL_CERT_PATH && SSL_KEY_PATH && fs.existsSync(SSL_CERT_PATH) && fs.existsSync(SSL_KEY_PATH)) {
  const httpsOptions = {
    cert: fs.readFileSync(SSL_CERT_PATH),
    key: fs.readFileSync(SSL_KEY_PATH)
  };
  if (SSL_CA_PATH && fs.existsSync(SSL_CA_PATH)) {
    httpsOptions.ca = fs.readFileSync(SSL_CA_PATH);
  }
  server = https.createServer(httpsOptions, app);
} else {
  server = http.createServer(app);
}

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const getRoomName = (serviceId) => `klarbite-service-${Number(serviceId || 0)}`;

io.on('connection', (socket) => {
  socket.on('join-room', ({ serviceId, role }) => {
    const room = getRoomName(serviceId);
    socket.join(room);
    socket.data.room = room;
    socket.data.role = role || 'viewer';

    socket.emit('joined-room', {
      serviceId: Number(serviceId || 0),
      room,
      role: socket.data.role
    });

    socket.to(room).emit('room-status', {
      serviceId: Number(serviceId || 0),
      role: socket.data.role,
      joined: true
    });
  });

  socket.on('stream-status', (payload) => {
    const room = socket.data.room || getRoomName(payload && payload.serviceId);
    if (!room) return;
    socket.to(room).emit('stream-status', payload);
  });

  socket.on('offer', (payload) => {
    const room = socket.data.room || getRoomName(payload && payload.serviceId);
    if (!room) return;
    socket.to(room).emit('remote-offer', payload);
  });

  socket.on('answer', (payload) => {
    const room = socket.data.room || getRoomName(payload && payload.serviceId);
    if (!room) return;
    socket.to(room).emit('remote-answer', payload);
  });

  socket.on('candidate', (payload) => {
    const room = socket.data.room || getRoomName(payload && payload.serviceId);
    if (!room) return;
    socket.to(room).emit('remote-candidate', payload);
  });

  socket.on('disconnect', () => {
    const room = socket.data.room;
    if (room) {
      socket.to(room).emit('room-status', {
        room,
        disconnected: true,
        role: socket.data.role || 'viewer'
      });
    }
  });
});

const PORT = process.env.PORT || 3001;
const protocol = server instanceof https.Server ? 'https' : 'http';
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Klarbite signal server escuchando en ${protocol}://0.0.0.0:${PORT}`);
});
