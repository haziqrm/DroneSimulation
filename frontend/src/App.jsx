import React, { useState, useCallback } from 'react';
import DroneMap from './components/DroneMap';
import DroneList from './components/DroneList';
import DeliveryQueue from './components/DeliveryQueue';
import { startSimulation } from './utils/api';
import { useWebSocket } from './hooks/useWebSocket';
import './App.css';

function App() {
  const [drones, setDrones] = useState([]);
  const [systemState, setSystemState] = useState({ 
    activeSimulations: 0, 
    activeDrones: 0 
  });
  const [selectedDrone, setSelectedDrone] = useState(null);
  const [isSimulating, setIsSimulating] = useState(false);

  // WebSocket connection
  const { connected } = useWebSocket({
    onDroneUpdate: useCallback((dronePositions) => {
      setDrones(dronePositions);
      setIsSimulating(dronePositions.length > 0);
    }, []),
    onSystemUpdate: useCallback((state) => {
      setSystemState(state);
    }, [])
  });

  const handleStartSimulation = async () => {
    // Example dispatches - Edinburgh locations
    const dispatches = [
      {
        id: 1,
        date: "2025-03-15",
        time: "10:30",
        requirements: { capacity: 2.0, cooling: false, heating: false },
        delivery: { lng: -3.186874, lat: 55.944494 } // Near University
      },
      {
        id: 2,
        date: "2025-03-15",
        time: "10:30",
        requirements: { capacity: 1.5, cooling: false, heating: false },
        delivery: { lng: -3.192473, lat: 55.946233 } // Royal Infirmary area
      },
      {
        id: 3,
        date: "2025-03-15",
        time: "10:30",
        requirements: { capacity: 1.0, cooling: false, heating: false },
        delivery: { lng: -3.200000, lat: 55.950000 } // Western area
      }
    ];

    try {
      setIsSimulating(true);
      const result = await startSimulation(dispatches);
      console.log('✅ Simulation started:', result);
    } catch (error) {
      console.error('❌ Failed to start simulation:', error);
      setIsSimulating(false);
      alert('Failed to start simulation. Check console for details.');
    }
  };

  return (
    <div className="App">
      {/* Header */}
      <header className="header">
        <div className="header-left">
          <h1>🚁 AI Mission Control</h1>
          <span className="subtitle">Real-Time Drone Operations Dashboard</span>
        </div>
        <div className="header-right">
          <div className={`connection-status ${connected ? 'connected' : 'disconnected'}`}>
            <span className="status-dot"></span>
            {connected ? 'Connected' : 'Disconnected'}
          </div>
          <div className="stats">
            <div className="stat">
              <span className="stat-label">Active Drones</span>
              <span className="stat-value">{systemState.activeDrones}</span>
            </div>
            <div className="stat">
              <span className="stat-label">Simulations</span>
              <span className="stat-value">{systemState.activeSimulations}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Layout */}
      <div className="main-container">
        {/* Left Sidebar */}
        <aside className="sidebar sidebar-left">
          <DroneList 
            drones={drones} 
            selectedDrone={selectedDrone}
            onSelectDrone={setSelectedDrone}
          />
        </aside>

        {/* Map Container */}
        <main className="map-container">
          <DroneMap 
            drones={drones} 
            selectedDrone={selectedDrone}
          />
          
          {/* Floating Controls */}
          <div className="map-controls">
            <button 
              className="btn-primary"
              onClick={handleStartSimulation}
              disabled={isSimulating || !connected}
            >
              {isSimulating ? '⏸ Simulating...' : '▶️ Start Simulation'}
            </button>
            
            {!connected && (
              <div className="warning-banner">
                ⚠️ Not connected to backend. Start Spring Boot server.
              </div>
            )}
          </div>
        </main>

        {/* Right Sidebar */}
        <aside className="sidebar sidebar-right">
          <DeliveryQueue drones={drones} />
        </aside>
      </div>
    </div>
  );
}

export default App;