const express = require('express');
const fs = require('fs');
const path = require('path');
const mqtt = require('mqtt');

const app = express();
const PORT = process.env.PORT || 3001;
const DATA_FILE = path.join(__dirname, 'data', 'player-data.json');

// Ensure data directory exists
if (!fs.existsSync(path.join(__dirname, 'data'))) {
  fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
}
const config = require('./src/config.json');

let logData = [];
let allPlayers = [];
let mqttConnected = false;
let mqttError = null;
let mqttInitialConnection = true;

function log(level, message) {
  const debugLevel = config.debugLevel || 'info';
  const levels = { error: 0, info: 1, debug: 2 };
  if (levels[level] <= levels[debugLevel]) {
    console.log(`[${level.toUpperCase()}] ${message}`);
  }
}

app.use(express.json());
app.use('/wallpapers', express.static(path.join(__dirname, 'wallpapers')));
app.use(express.static(path.join(__dirname, 'build')));

function processEvent(event) {
  if (event.type) {
    log('info', `Event received: ${event.type} - ${event.playerName || 'N/A'} - ${event.worldName || 'N/A'}`);
    logData = [{ ...event, timestamp: new Date().toISOString() }, ...logData.slice(0, 999)];
    allPlayers = getAllPlayers(logData);
    const onlinePlayers = allPlayers.filter(p => p.status === 'online');
    log('debug', `Players updated: ${allPlayers.length} total, ${onlinePlayers.length} online`);
    savePlayerData();
  }
}

// Event source setup
if (config.eventSource === 'mqtt') {
  const client = mqtt.connect(config.mqtt.broker, {
    clientId: config.mqtt.clientId,
    username: config.mqtt.username,
    password: config.mqtt.password
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

function getAllPlayers(events = []) {
  const playerStatus = new Map();
  const playerSessions = new Map();
  
  events.slice().reverse().forEach(event => {
    if (event.playerName) {
      const existing = playerStatus.get(event.playerName);
      const sessions = playerSessions.get(event.playerName) || [];
      
      if (event.type === 'PLAYER_CONNECTED') {
        sessions.push({ start: new Date(event.timestamp), end: null });
        playerSessions.set(event.playerName, sessions);
        playerStatus.set(event.playerName, {
          name: event.playerName,
          status: 'online',
          lastSeen: event.timestamp,
          xuid: event.playerXuid,
          world: event.worldName,
          container: event.containerName?.replace(/^\//, '') || event.containerName
        });
      } else if (event.type === 'PLAYER_DISCONNECTED') {
        const lastSession = sessions[sessions.length - 1];
        if (lastSession && !lastSession.end) {
          lastSession.end = new Date(event.timestamp);
        }
        playerSessions.set(event.playerName, sessions);
        playerStatus.set(event.playerName, {
          name: event.playerName,
          status: 'disconnected',
          lastSeen: event.timestamp,
          xuid: event.playerXuid,
          world: existing?.world || event.worldName,
          container: existing?.container || event.containerName?.replace(/^\//, '') || event.containerName
        });
      }
    }
  });
  
  return Array.from(playerStatus.values()).map(player => {
    const sessions = playerSessions.get(player.name) || [];
    const totalMs = sessions.reduce((total, session) => {
      const end = session.end || new Date();
      return total + (end - session.start);
    }, 0);
    const hours = Math.floor(totalMs / (1000 * 60 * 60));
    const minutes = Math.floor((totalMs % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((totalMs % (1000 * 60)) / 1000);
    
    const lastSession = sessions[sessions.length - 1];
    let lastDuration = '0h 0m 0s';
    if (lastSession) {
      const lastEnd = lastSession.end || new Date();
      const lastMs = lastEnd - lastSession.start;
      const lastHours = Math.floor(lastMs / (1000 * 60 * 60));
      const lastMinutes = Math.floor((lastMs % (1000 * 60 * 60)) / (1000 * 60));
      const lastSeconds = Math.floor((lastMs % (1000 * 60)) / 1000);
      lastDuration = `${lastHours}h ${lastMinutes}m ${lastSeconds}s`;
    }
    
    let currentSessionDuration = '0h 0m 0s';
    if (player.status === 'online' && lastSession && !lastSession.end) {
      const currentMs = new Date() - lastSession.start;
      const currentHours = Math.floor(currentMs / (1000 * 60 * 60));
      const currentMinutes = Math.floor((currentMs % (1000 * 60 * 60)) / (1000 * 60));
      const currentSeconds = Math.floor((currentMs % (1000 * 60)) / 1000);
      currentSessionDuration = `${currentHours}h ${currentMinutes}m ${currentSeconds}s`;
    }
    
    return {
      ...player,
      playedDuration: `${hours}h ${minutes}m ${seconds}s`,
      lastDuration,
      currentSessionDuration
    };
  });
}

function savePlayerData() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify({
      players: allPlayers,
      timestamp: new Date().toISOString()
    }, null, 2));
  } catch (error) {
    console.error('Error saving player data:', error);
  }
}

// Load existing data on startup
if (fs.existsSync(DATA_FILE)) {
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    allPlayers = data.players || [];
  } catch (e) {
    console.error('Failed to load existing data:', e);
  }
}

// Get current player data
app.get('/api/player-data', (req, res) => {
  const updatedPlayers = getAllPlayers(logData);
  allPlayers = updatedPlayers;
  res.json({
    players: updatedPlayers,
    timestamp: new Date().toISOString(),
    mqttConnected,
    mqttError,
    eventSource: config.eventSource
  });
});

// Get UI configuration
app.get('/api/config', (req, res) => {
  res.json(config.ui || {});
});

// Receive events directly via JSON
app.post('/api/events', (req, res) => {
  try {
    processEvent(req.body);
    res.json({ success: true });
  } catch (error) {
    log('error', `Error processing event: ${error.message}`);
    res.status(500).json({ error: 'Failed to process event' });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

app.listen(PORT, () => {
  log('info', `Server running on port ${PORT}`);
});