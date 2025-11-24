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
  const [multiDroneMode, setMultiDroneMode] = useState(true);

  // WebSocket connection
  const { connected } = useWebSocket({
    onDroneUpdate: useCallback((dronePositions) => {
      console.log('🚁 Received drone positions:', dronePositions);
      setDrones(dronePositions);
      
      // If no drones left, simulation is complete - reset button
      if (dronePositions.length === 0) {
        setIsSimulating(false);
      } else {
        setIsSimulating(true);
      }
    }, []),
    onSystemUpdate: useCallback((state) => {
      console.log('📊 System state:', state);
      setSystemState(state);
      
      // Also check system state for completion
      if (state.activeDrones === 0) {
        setIsSimulating(false);
      }
    }, [])
  });

  const handleStartSimulation = async () => {
    const dispatches = multiDroneMode ? [
      // Multi-drone scenario: 8 deliveries to force multiple drones
      {
        id: 1,
        date: "2025-03-15",
        time: "10:00",
        requirements: { capacity: 3.0, cooling: false, heating: false },
        delivery: { lng: -3.186874, lat: 55.944494 }
      },
      {
        id: 2,
        date: "2025-03-15",
        time: "10:00",
        requirements: { capacity: 3.0, cooling: false, heating: false },
        delivery: { lng: -3.192473, lat: 55.946233 }
      },
      {
        id: 3,
        date: "2025-03-15",
        time: "10:00",
        requirements: { capacity: 3.0, cooling: false, heating: false },
        delivery: { lng: -3.200000, lat: 55.950000 }
      },
      {
        id: 4,
        date: "2025-03-15",
        time: "10:00",
        requirements: { capacity: 3.0, cooling: false, heating: false },
        delivery: { lng: -3.180000, lat: 55.940000 }
      },
      {
        id: 5,
        date: "2025-03-15",
        time: "10:00",
        requirements: { capacity: 3.0, cooling: false, heating: false },
        delivery: { lng: -3.190000, lat: 55.948000 }
      },
      {
        id: 6,
        date: "2025-03-15",
        time: "10:00",
        requirements: { capacity: 3.0, cooling: true, heating: false },
        delivery: { lng: -3.188000, lat: 55.946000 }
      },
      {
        id: 7,
        date: "2025-03-15",
        time: "10:00",
        requirements: { capacity: 3.0, cooling: true, heating: false },
        delivery: { lng: -3.195000, lat: 55.943000 }
      },
      {
        id: 8,
        date: "2025-03-15",
        time: "10:00",
        requirements: { capacity: 3.0, cooling: false, heating: false },
        delivery: { lng: -3.185000, lat: 55.942000 }
      }
    ] : [
      // Simple scenario: 3 deliveries
      {
        id: 1,
        date: "2025-03-15",
        time: "10:30",
        requirements: { capacity: 2.0, cooling: false, heating: false },
        delivery: { lng: -3.186874, lat: 55.944494 }
      },
      {
        id: 2,
        date: "2025-03-15",
        time: "10:30",
        requirements: { capacity: 1.5, cooling: false, heating: false },
        delivery: { lng: -3.192473, lat: 55.946233 }
      },
      {
        id: 3,
        date: "2025-03-15",
        time: "10:30",
        requirements: { capacity: 1.0, cooling: false, heating: false },
        delivery: { lng: -3.200000, lat: 55.950000 }
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
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexDirection: 'column' }}>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <label style={{ 
                  background: 'white', 
                  padding: '10px 16px', 
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                  cursor: 'pointer',
                  userSelect: 'none'
                }}>
                  <input 
                    type="checkbox" 
                    checked={multiDroneMode}
                    onChange={(e) => setMultiDroneMode(e.target.checked)}
                    style={{ cursor: 'pointer' }}
                  />
                  Multi-Drone Mode ({multiDroneMode ? '8' : '3'} deliveries)
                </label>
                
                <button 
                  className="btn-primary"
                  onClick={handleStartSimulation}
                  disabled={isSimulating || !connected}
                >
                  {isSimulating ? '⏸ Simulating...' : '▶️ Start Simulation'}
                </button>
              </div>
              
              {!connected && (
                <div className="warning-banner">
                  ⚠️ Not connected to backend. Start Spring Boot server.
                </div>
              )}
            </div>
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