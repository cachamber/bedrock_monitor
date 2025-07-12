import React, { useState, useEffect } from 'react';
import './App.css';

function App() {
  const [stats, setStats] = useState({});
  const [currentPlayers, setCurrentPlayers] = useState([]);
  const [allPlayers, setAllPlayers] = useState([]);
  const [background, setBackground] = useState("url('wallpapers/wallpaper_minecraft_bedrock_edition_1920x1080.png')");
  const [mqttConnected, setMqttConnected] = useState(false);
  const [backendConnected, setBackendConnected] = useState(false);
  const [mqttError, setMqttError] = useState(null);
  const [eventSource, setEventSource] = useState('mqtt');

  useEffect(() => {
    fetch('/api/config')
      .then(response => response.json())
      .then(config => {
        if (config.background) setBackground(config.background);
      })
      .catch(e => console.error('Failed to load config:', e));

    const fetchData = () => {
      fetch('/api/player-data')
        .then(response => response.json())
        .then(data => {
          if (data.players) {
            setAllPlayers(data.players);
            setCurrentPlayers(data.players.filter(p => p.status === 'online'));
            setStats({ uniquePlayers: data.players.length });
          }
          setMqttConnected(data.mqttConnected || false);
          setMqttError(data.mqttError);
          setEventSource(data.eventSource || 'mqtt');
          setBackendConnected(true);
        })
        .catch(e => {
          console.error('Failed to load data:', e);
          setBackendConnected(false);
        });
    };

    fetchData();
    const interval = setInterval(fetchData, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="App" style={{ 
      background, 
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
      backgroundAttachment: 'fixed'
    }}>
      <header className="header">
        <h1>🎮 Minecraft Server Event Monitor</h1>
        <div className="mqtt-status">
          <span className={`status-indicator ${backendConnected ? 'connected' : 'disconnected'}`}>
            {backendConnected ? '🟢 Backend Connected' : '🔴 Backend Disconnected'}
          </span>
          <span className="status-indicator connected">
            📡 Events: {eventSource.toUpperCase()}
          </span>
          {eventSource === 'mqtt' && (
            <span className={`status-indicator ${mqttConnected ? 'connected' : 'disconnected'}`}>
              {mqttConnected ? '🟢 MQTT Connected' : `🔴 MQTT Disconnected${mqttError ? `: ${mqttError}` : ''}`}
            </span>
          )}
        </div>
      </header>

      <div className="stats">
        <div className="stat-card">
          <h3>👥 Unique Players</h3>
          <div className="stat-value">{stats.uniquePlayers}</div>
        </div>
        <div className="stat-card">
          <h3>🎮 Currently Online</h3>
          <div className="stat-value">{currentPlayers.length}</div>
        </div>
      </div>

      {currentPlayers.length > 0 && (
        <div className="current-players">
          <h2>🟢 Current Players ({currentPlayers.length})</h2>
          <div className="players-grid">
            {currentPlayers.map((player, index) => (
              <div key={index} className="player-card">
                <div className="player-name">{player.name}</div>
                <div className="player-info">World: {player.world}</div>
                <div className="player-info">Connected for: {player.currentSessionDuration}</div>
                <div className="player-info">Last seen: {new Date(player.lastSeen).toLocaleString()}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="players-table">
        <h2>👥 All Players</h2>
        <table>
          <thead>
            <tr>
              <th>Player</th>
              <th>Status</th>
              <th>World</th>
              <th>Container</th>
              <th>Played Duration</th>
              <th>Last Duration</th>
              <th>Last Seen</th>
            </tr>
          </thead>
          <tbody>
            {allPlayers.map((player, index) => (
              <tr key={index}>
                <td>{player.name}</td>
                <td>
                  <span className={`status ${player.status}`}>
                    {player.status === 'online' ? '🟢 Online' : '🔴 Disconnected'}
                  </span>
                </td>
                <td>{player.world || 'Unknown'}</td>
                <td>{player.container || 'Unknown'}</td>
                <td>{player.playedDuration}</td>
                <td>{player.lastDuration}</td>
                <td>{new Date(player.lastSeen).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default App;