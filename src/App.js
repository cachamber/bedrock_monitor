import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  const [sortField, setSortField] = useState('status');
  const [sortDirection, setSortDirection] = useState('desc');
  const [pollingInterval, setPollingInterval] = useState(2000);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);

  const sortPlayers = useCallback((players, field, direction) => {
    return [...players].sort((a, b) => {
      let aVal = a[field];
      let bVal = b[field];
      
      if (field === 'lastSeen') {
        aVal = new Date(aVal);
        bVal = new Date(bVal);
      }
      
      if (aVal < bVal) return direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, []);

  const sortedPlayers = useMemo(() => {
    return sortPlayers(allPlayers, sortField, sortDirection);
  }, [allPlayers, sortField, sortDirection, sortPlayers]);

  const fetchData = useCallback(async () => {
    try {
      const response = await fetch('/api/player-data');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.players) {
        setAllPlayers(data.players);
        setCurrentPlayers(data.players.filter(p => p.status === 'online'));
        setStats({ uniquePlayers: data.players.length });
      }
      
      setMqttConnected(data.mqttConnected || false);
      setMqttError(data.mqttError);
      setEventSource(data.eventSource || 'mqtt');
      setBackendConnected(true);
      setError(null);
      setLastUpdate(new Date());
      
      if (data.pollingInterval && data.pollingInterval !== pollingInterval) {
        setPollingInterval(data.pollingInterval);
      }
    } catch (e) {
      console.error('Failed to load data:', e);
      setBackendConnected(false);
      setError(e.message);
    }
  }, [pollingInterval]);

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const response = await fetch('/api/config');
        if (response.ok) {
          const config = await response.json();
          if (config.background) setBackground(config.background);
          if (config.pollingInterval) setPollingInterval(config.pollingInterval);
        }
      } catch (e) {
        console.error('Failed to load config:', e);
      }
    };

    loadConfig();
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, pollingInterval);
    return () => clearInterval(interval);
  }, [fetchData, pollingInterval]);

  const handleSort = useCallback((field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection(field === 'status' ? 'desc' : 'asc');
    }
  }, [sortField, sortDirection]);

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
          {lastUpdate && (
            <span className="status-indicator connected">
              🕒 Last Update: {lastUpdate.toLocaleTimeString()}
            </span>
          )}
        </div>
        {error && (
          <div className="error-banner">
            ⚠️ Error: {error}
          </div>
        )}
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
              <th onClick={() => handleSort('name')} style={{cursor: 'pointer'}}>
                Player {sortField === 'name' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th onClick={() => handleSort('status')} style={{cursor: 'pointer'}}>
                Status {sortField === 'status' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th onClick={() => handleSort('world')} style={{cursor: 'pointer'}}>
                World {sortField === 'world' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th onClick={() => handleSort('container')} style={{cursor: 'pointer'}}>
                Container {sortField === 'container' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th onClick={() => handleSort('playedDuration')} style={{cursor: 'pointer'}}>
                Played Duration {sortField === 'playedDuration' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th onClick={() => handleSort('lastDuration')} style={{cursor: 'pointer'}}>
                Last Duration {sortField === 'lastDuration' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th onClick={() => handleSort('lastSeen')} style={{cursor: 'pointer'}}>
                Last Seen {sortField === 'lastSeen' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedPlayers.map((player, index) => (
              <tr key={`${player.name}-${index}`}>
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