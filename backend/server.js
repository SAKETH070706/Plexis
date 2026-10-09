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

if (process.env.NODE_ENV === 'production' && (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'your_jwt_secret_here' || process.env.JWT_SECRET === 'secret')) {
  console.error('[FATAL SECURITY ERROR] Insecure or default JWT_SECRET detected in production environment.');
  process.exit(1);
}

connectDB();

const app = express();
const server = http.createServer(app);

// ─── Security Headers Middleware ──────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// ─── Dynamic Multi-Origin CORS Configuration ──────────────────────────
const getAllowedOrigins = () => {
  const envOrigins = process.env.CLIENT_ORIGIN
    ? process.env.CLIENT_ORIGIN.split(',').map((o) => o.trim())
    : [];
  return [
    ...envOrigins,
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:5173',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001',
    'http://127.0.0.1:5173',
  ];
};

const corsOptions = {
  origin: (origin, callback) => {
    // Allow non-browser requests (Postman, curl, server-to-server) or same-origin
    if (!origin) return callback(null, true);

    const allowed = getAllowedOrigins();
    if (
      allowed.includes(origin) ||
      process.env.NODE_ENV !== 'production' ||
      origin.endsWith('.vercel.app') ||
      origin.endsWith('.netlify.app') ||
      origin.endsWith('.onrender.com')
    ) {
      return callback(null, true);
    }
    return callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
};

app.use(cors(corsOptions));

const io = socketIo(server, {
  cors: {
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const allowed = getAllowedOrigins();
      if (
        allowed.includes(origin) ||
        process.env.NODE_ENV !== 'production' ||
        origin.endsWith('.vercel.app') ||
        origin.endsWith('.netlify.app') ||
        origin.endsWith('.onrender.com')
      ) {
        return callback(null, true);
      }
      return callback(null, true);
    },
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
  const orgId = socket.user?.organizationId;
  if (userId) {
    socket.join(userId);
    console.log(`[Socket] User ${userId} joined room: ${userId}`);
  }

  // Join tenant organization room
  if (orgId) {
    socket.join(`org:${orgId}`);
  }

  // If the user is an admin, join both tenant-admin room and legacy admin room
  if (socket.user?.role === 'admin') {
    socket.join('admin');
    if (orgId) {
      socket.join(`admin:${orgId}`);
      console.log(`[Socket] Admin ${userId} joined room: admin:${orgId}`);
    }
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

// ─── Centralized Error Handling Middleware ────────────────────────────
app.use((err, req, res, next) => {
  console.error('[Unhandled API Error]:', err.message);
  res.status(err.status || 500).json({
    message: err.message || 'Internal server error',
  });
});

// ─── Start Server ─────────────────────────────────────────────────────
// ─── Graceful Process Termination (Production Lifecycle) ──────────────
function gracefulShutdown(signal) {
  console.log(`\n[Server] Received ${signal}. Starting graceful shutdown...`);

  io.close(() => {
    console.log('[Socket.IO] All socket connections closed.');
  });

  server.close(async () => {
    console.log('[HTTP] Closed all incoming HTTP listeners.');
    try {
      await mongoose.connection.close(false);
      console.log('[MongoDB] Database connection closed cleanly.');
      process.exit(0);
    } catch (dbErr) {
      console.error('[MongoDB Shutdown Error]:', dbErr.message);
      process.exit(1);
    }
  });

  // Force close after 10s if ongoing requests hang
  setTimeout(() => {
    console.error('[Server] Graceful shutdown timed out (10s). Forcing termination.');
    process.exit(1);
  }, 10000).unref();
}

if (process.env.NODE_ENV !== 'test') {
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

// ─── Start Server ─────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
if (require.main === module) {
  server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

module.exports = { app, server, gracefulShutdown };

