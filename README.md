# Minecraft Server Event Monitor

A React web application that monitors Minecraft server events in real-time via MQTT or direct HTTP.

This project is designed to work with events generated by [minecraft-webhook](https://github.com/edward3h/minecraft-webhook), which monitors Minecraft server logs and publishes events.

## Features

- Real-time event monitoring via MQTT
- Player connection/disconnection tracking
- Session duration tracking (total and last session) with seconds precision
- Live current session duration for online players
- Server status monitoring
- Backup completion notifications
- Persistent player data storage on server
- Current players display (only when online)
- Comprehensive player statistics table
- Configurable background wallpapers
- Connection status indicators (Backend & MQTT)
- Docker deployment support

## Configuration

Edit `src/config.json`:

```json
{
  "eventSource": "mqtt",
  "debugLevel": "info",
  "pollingInterval": 2000,
  "maxLogEntries": 1000,
  "rateLimit": {
    "windowMs": 60000,
    "maxRequests": 100
  },
  "mqtt": {
    "broker": "ws://your-mqtt-broker:9001",
    "topic": "mc-webhook",
    "clientId": "mclog-viewer",
    "username": "your-username",
    "password": "your-password"
  },
  "ui": {
    "background": "url('wallpapers/wallpaper_minecraft_bedrock_edition_1920x1080.png')"
  }
}
```

### Event Sources
- `"mqtt"` - Receive events from MQTT broker
- `"direct"` - Receive events via HTTP POST to `/api/events`

### Configuration Options
- `"eventSource"` - Event source: `"mqtt"` or `"direct"`
- `"debugLevel"` - Logging level: `"error"`, `"info"`, or `"debug"`
- `"pollingInterval"` - Frontend polling interval in milliseconds (default: 2000)
- `"maxLogEntries"` - Maximum log entries to keep in memory (default: 1000)
- `"rateLimit"` - API rate limiting configuration
  - `"windowMs"` - Time window in milliseconds (default: 60000)
  - `"maxRequests"` - Max requests per window (default: 100)

## Event Types

The application expects JSON events with these types:
- `PLAYER_CONNECTED`
- `PLAYER_DISCONNECTED` 
- `SERVER_STARTED`
- `SERVER_STOPPED`
- `BACKUP_COMPLETE`

## Event Format

```json
{
  "type": "PLAYER_CONNECTED",
  "containerId": "container-id",
  "containerName": "/minecraft1",
  "worldName": "My Level",
  "playerName": "Steve",
  "playerXuid": "12345"
}
```

## Wallpapers

Place wallpaper images in the `wallpapers/` directory. Configure the background in `src/config.json`:

- **Image**: `"url('wallpapers/your-image.png')"`
- **Gradient**: `"linear-gradient(135deg, #667eea 0%, #764ba2 100%)"`
- **Solid color**: `"#2c3e50"`

## Installation

```bash
npm install
npm start
```

## Data Persistence

Player data is automatically saved to `data/player-data.json` on every event and restored on page load via `/api/player-data` endpoint. The `data/` directory is created automatically on first run.

## API Endpoints

- `GET /api/player-data` - Load current player data (cached for performance)
- `GET /api/config` - Get UI configuration
- `POST /api/events` - Receive events directly (when eventSource is "direct")
- `GET /api/health` - Health check endpoint

### Direct Event Example

```bash
curl -X POST http://localhost:3001/api/events \
  -H "Content-Type: application/json" \
  -d '{
    "type": "PLAYER_CONNECTED",
    "playerName": "Steve",
    "worldName": "My Level",
    "containerName": "/minecraft1",
    "playerXuid": "12345"
  }'
```

## Development

```bash
# Terminal 1 - React dev server
npm start

# Terminal 2 - API server  
npm run server
```

## Production

```bash
npm run prod
```

## Docker Deployment

```bash
# Build and run
docker-compose up -d

# Stop
docker-compose down
```

### Docker Compose Example

```yaml
version: '3.8'

services:
  mcwebsite:
    build: .
    ports:
      - "3001:3001"
    volumes:
      - ./src/config.json:/app/src/config.json
      - ./wallpapers:/app/wallpapers
      - player-data:/app/data
    environment:
      - NODE_ENV=production
      - UID=${UID:-1000}
      - GID=${GID:-1000}
    restart: unless-stopped

volumes:
  player-data:
```

### User Configuration

Set UID/GID environment variables to match your host user:

```bash
# Use current user
export UID=$(id -u)
export GID=$(id -g)
docker-compose up -d

# Or specify custom values
UID=1001 GID=1001 docker-compose up -d
```

### Docker Features
- Volume mounts for config and wallpapers
- Persistent data storage
- Auto-restart on failure
- Production optimized build
- Configurable UID/GID for file permissions
