import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Serve static files from the public folder
app.use(express.static('public'));

// Configuration
const PORT = process.env.PORT || 3000;
const EMIT_INTERVAL = 50; // milliseconds between each coordinate emit

// Store the latest cursor coordinates (normalized 0-1 range)
let cursorCoords = { x: 0.5, y: 0.5 };

// Track connected clients (only one mobile and one desktop allowed)
let mobileClient = null;
let desktopClient = null;

// Handle client connections
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  // Listen for client identification
  socket.on('identify', (clientType) => {
    if (clientType === 'mobile') {
      // Check if mobile client already connected
      if (mobileClient !== null) {
        console.log('Mobile client rejected - one already connected:', socket.id);
        socket.emit('rejected', 'Mobile client already connected');
        socket.disconnect();
        return;
      }
      mobileClient = socket.id;
      console.log('Mobile client identified:', socket.id);
    } else if (clientType === 'desktop') {
      // Check if desktop client already connected
      if (desktopClient !== null) {
        console.log('Desktop client rejected - one already connected:', socket.id);
        socket.emit('rejected', 'Desktop client already connected');
        socket.disconnect();
        return;
      }
      desktopClient = socket.id;
      console.log('Desktop client identified:', socket.id);
    }
  });
  
  // Listen for cursor updates from the phone client
  socket.on('cursor-update', (data) => {
    cursorCoords = data;
    // Broadcast cursor position to all other clients (desktop clients)
    socket.broadcast.emit('cursor-move', cursorCoords);
    // Uncomment for debugging:
    // console.log('Cursor updated from phone:', cursorCoords);
  });

  // Listen for mouse down / up events from the phone client and forward them
  socket.on('cursor-down', () => {
    // console.log('Cursor down received from phone');
    socket.broadcast.emit('cursor-down');
  });

  socket.on('cursor-up', () => {
    // console.log('Cursor up received from phone');
    socket.broadcast.emit('cursor-up');
  });
  // Clean up on disconnect
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    
    // Clear client tracking
    if (socket.id === mobileClient) {
      mobileClient = null;
      console.log('Mobile client disconnected');
    }
    if (socket.id === desktopClient) {
      desktopClient = null;
      console.log('Desktop client disconnected');
    }
  });
});

// Health check endpoint for Render
app.get('/', (req, res) => {
  res.sendFile('public/index.html', { root: '.' });
});

// Start server
httpServer.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});