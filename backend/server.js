const dns = require("dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const http = require('http');
const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');
const connectDB = require('./config/db');


dotenv.config();
connectDB();

const app = express();
const server = http.createServer(app);
app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:3000', credentials: true }));

const ALLOWED_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:3000';

const io = socketIo(server, {
  cors: {
    origin: ALLOWED_ORIGIN,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// ─── Socket.IO JWT Authentication Middleware ───────────────────────────
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) {
    return next(new Error('Authentication error: no token'));
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    socket.user = decoded; // Attach user info to socket object
    next();
  } catch (err) {
    next(new Error('Authentication error: invalid token'));
  }
});

// ─── Socket.IO Connection Handler ─────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[Socket] Connected: ${socket.id} | User: ${socket.user?.id}`);

  // Join the user's personal room (named by their userId)
  const userId = socket.user?.id;
  if (userId) {
    socket.join(userId);
    console.log(`[Socket] User ${userId} joined room: ${userId}`);
  }

  // If the user is an admin, also join the 'admin' room
  if (socket.user?.role === 'admin') {
    socket.join('admin');
    console.log(`[Socket] Admin ${userId} joined admin room`);
  }

  socket.on('disconnect', (reason) => {
    console.log(`[Socket] Disconnected: ${socket.id} | reason: ${reason}`);
  });

  socket.on('error', (err) => {
    console.error(`[Socket] Error on ${socket.id}:`, err.message);
  });
});

// ─── Express Middleware ────────────────────────────────────────────────

app.use(express.json());

// Make io accessible in routes
app.set('io', io);

// ─── Routes ───────────────────────────────────────────────────────────
app.use('/api/auth', require('./routes/auth'));
app.use('/api/leads', require('./routes/leads'));
app.use('/api/events', require('./routes/events'));
app.use('/api/attendance', require('./routes/attendance'));
app.use('/api/payouts', require('./routes/payouts').router);

// ─── Start Server ─────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
if (require.main === module) {
  server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

module.exports = { app, server };