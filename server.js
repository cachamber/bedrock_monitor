const express = require('express');
const fs = require('fs');
const path = require('path');
const mqtt = require('mqtt');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

const app = express();
const PORT = process.env.PORT || 3001;
const DATA_FILE = path.join(__dirname, 'data', 'player-data.json');

// Ensure data directory exists
if (!fs.existsSync(path.join(__dirname, 'data'))) {
  fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
}

let config;
try {
  config = require('./src/config.json');
} catch (error) {
  console.error('Failed to load config:', error);
  process.exit(1);
}

// State management
let logData = [];
let cachedPlayers = [];
let cacheTimestamp = 0;
let mqttConnected = false;
let mqttError = null;
let mqttInitialConnection = true;
let serverStartTime = new Date();

function log(level, message) {
  const debugLevel = config.debugLevel || 'info';
  const levels = { error: 0, info: 1, debug: 2 };
  if (levels[level] <= levels[debugLevel]) {
    console.log(`[${level.toUpperCase()}] ${new Date().toISOString()} ${message}`);
  }
}

// Rate limiting configuration
const limiter = rateLimit({
  windowMs: config.rateLimit?.windowMs || 60000,
  max: config.rateLimit?.maxRequests || 100,
  message: { error: 'Too many requests' },
  standardHeaders: true,
  legacyHeaders: false
});

function validateEvent(event) {
  const validTypes = ['PLAYER_CONNECTED', 'PLAYER_DISCONNECTED', 'SERVER_STARTED', 'SERVER_STOPPED', 'BACKUP_COMPLETE'];
  
  if (!event || typeof event !== 'object') {
    throw new Error('Event must be an object');
  }
  
  if (!validTypes.includes(event.type)) {
    throw new Error(`Invalid event type: ${event.type}`);
  }
  
  if ((event.type === 'PLAYER_CONNECTED' || event.type === 'PLAYER_DISCONNECTED') && !event.playerName) {
    throw new Error('Player events must include playerName');
  }
  
  // Sanitize strings
  if (event.playerName) event.playerName = String(event.playerName).trim().slice(0, 50);
  if (event.worldName) event.worldName = String(event.worldName).trim().slice(0, 100);
  if (event.containerName) event.containerName = String(event.containerName).trim().slice(0, 100);
  
  return event;
}

function formatDuration(ms) {
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((ms % (1000 * 60)) / 1000);
  return `${hours}h ${minutes}m ${seconds}s`;
}

function updatePlayerFromEvent(event) {
  const playerName = event.playerName;
  const existing = cachedPlayers.find(p => p.name === playerName);
  
  if (event.type === 'PLAYER_CONNECTED') {
    if (existing) {
      existing.status = 'online';
      existing.lastSeen = event.timestamp;
      existing.sessionStart = new Date(event.timestamp);
      if (event.worldName) existing.world = event.worldName;
      if (event.containerName) existing.container = event.containerName?.replace(/^\//, '') || event.containerName;
    } else {
      cachedPlayers.push({
        name: playerName,
        status: 'online',
        lastSeen: event.timestamp,
        xuid: event.playerXuid,
        world: event.worldName,
        container: event.containerName?.replace(/^\//, '') || event.containerName,
        playedDuration: '0h 0m 0s',
        lastDuration: '0h 0m 0s',
        currentSessionDuration: '0h 0m 0s',
        sessionStart: new Date(event.timestamp)
      });
    }
  } else if (event.type === 'PLAYER_DISCONNECTED') {
    if (existing) {
      const sessionStart = existing.sessionStart || serverStartTime;
      const sessionDuration = new Date(event.timestamp) - sessionStart;
      
      existing.status = 'disconnected';
      existing.lastSeen = event.timestamp;
      existing.lastDuration = formatDuration(sessionDuration);
      existing.currentSessionDuration = '0h 0m 0s';
      
      // Add session duration to total played time
      const currentTotal = parseDuration(existing.playedDuration || '0h 0m 0s');
      existing.playedDuration = formatDuration(currentTotal + sessionDuration);
      
      delete existing.sessionStart;
    }
  }
}

function parseDuration(durationStr) {
  const match = durationStr.match(/(\d+)h (\d+)m (\d+)s/);
  if (!match) return 0;
  const [, hours, minutes, seconds] = match;
  return (parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseInt(seconds)) * 1000;
}

function updateCurrentSessions() {
  const now = new Date();
  cachedPlayers.forEach(player => {
    if (player.status === 'online' && player.sessionStart) {
      player.currentSessionDuration = formatDuration(now - player.sessionStart);
    }
  });
}

function processEvent(event) {
  try {
    const validatedEvent = validateEvent(event);
    log('info', `Event received: ${validatedEvent.type} - ${validatedEvent.playerName || 'N/A'} - ${validatedEvent.worldName || 'N/A'}`);
    
    const timestampedEvent = { ...validatedEvent, timestamp: new Date().toISOString() };
    
    if (timestampedEvent.playerName) {
      updatePlayerFromEvent(timestampedEvent);
    }
    
    cacheTimestamp = Date.now();
    savePlayerData();
  } catch (error) {
    log('error', `Event validation failed: ${error.message}`);
    throw error;
  }
}

function getCachedPlayers() {
  const now = Date.now();
  if (now - cacheTimestamp > 5000) {
    updateCurrentSessions();
    cacheTimestamp = now;
    log('debug', `Cache updated: ${cachedPlayers.length} players`);
  }
  return cachedPlayers;
}

function savePlayerData() {
  try {
    const players = getCachedPlayers();
    fs.writeFileSync(DATA_FILE, JSON.stringify({
      players,
      timestamp: new Date().toISOString()
    }, null, 2));
  } catch (error) {
    log('error', `Error saving player data: ${error.message}`);
  }
}

// Middleware
app.use(helmet({
  contentSecurityPolicy: false // Allow inline styles for React
}));
app.use(express.json({ limit: '1mb' }));
app.use(limiter);
app.use('/wallpapers', express.static(path.join(__dirname, 'wallpapers')));
app.use(express.static(path.join(__dirname, 'build')));

// CORS for production
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', process.env.NODE_ENV === 'production' ? 'same-origin' : '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Methods', 'GET, POST');
  next();
});

// MQTT setup
if (config.eventSource === 'mqtt') {
  const client = mqtt.connect(config.mqtt.broker, {
    clientId: config.mqtt.clientId,
    username: config.mqtt.username,
    password: config.mqtt.password,
    reconnectPeriod: 5000,
    connectTimeout: 10000
  });

  client.on('connect', () => {
    if (mqttInitialConnection) {
      log('info', 'Connected to MQTT broker');
      mqttInitialConnection = false;
    }
    mqttConnected = true;
    mqttError = null;
    client.subscribe(config.mqtt.topic);
  });

  client.on('disconnect', () => {
    log('info', 'Disconnected from MQTT broker');
    mqttConnected = false;
  });

  client.on('error', (error) => {
    log('error', `MQTT connection error: ${error.message}`);
    mqttConnected = false;
    mqttError = error.message || 'Connection failed';
  });

  client.on('message', (topic, message) => {
    try {
      const event = JSON.parse(message.toString());
      processEvent(event);
    } catch (e) {
      log('error', `Failed to parse JSON message: ${e.message}`);
    }
  });
} else {
  log('info', 'Event source set to direct JSON - MQTT disabled');
  mqttConnected = false;
}

// Load existing data on startup
if (fs.existsSync(DATA_FILE)) {
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    if (data.players) {
      cachedPlayers = data.players.map(player => ({
        ...player,
        status: 'disconnected',
        currentSessionDuration: '0h 0m 0s',
        sessionStart: player.status === 'online' ? serverStartTime : undefined
      }));
      cacheTimestamp = Date.now();
      log('info', `Loaded ${data.players.length} players from saved data (all set to disconnected)`);
    }
  } catch (e) {
    log('error', `Failed to load existing data: ${e.message}`);
  }
} else {
  log('info', 'No existing player data found, starting fresh');
}

// API Routes
app.get('/api/player-data', (req, res) => {
  try {
    const players = getCachedPlayers();
    res.json({
      players,
      timestamp: new Date().toISOString(),
      mqttConnected,
      mqttError,
      eventSource: config.eventSource,
      pollingInterval: config.pollingInterval || 2000
    });
  } catch (error) {
    log('error', `Error getting player data: ${error.message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/config', (req, res) => {
  try {
    res.json({
      ...config.ui,
      pollingInterval: config.pollingInterval || 2000
    });
  } catch (error) {
    log('error', `Error getting config: ${error.message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/events', (req, res) => {
  try {
    processEvent(req.body);
    res.json({ success: true });
  } catch (error) {
    log('error', `Error processing event: ${error.message}`);
    res.status(400).json({ error: error.message });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});



// Graceful shutdown
process.on('SIGTERM', () => {
  log('info', 'Received SIGTERM, shutting down gracefully');
  savePlayerData();
  process.exit(0);
});

app.listen(PORT, () => {
  log('info', `Server running on port ${PORT}`);
});