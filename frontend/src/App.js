import React from 'react';
import DeliveryForm from './components/DeliveryForm';
import DroneMap from './components/DroneMap';
import useWebSocket from './hooks/useWebSocket';
import './App.css';

function App() {
  const { drones, isConnected } = useWebSocket();

  const activeDrones = drones.filter(drone => 
    drone.status === 'FLYING' || drone.status === 'DELIVERING'
  );
  
  const pendingDrones = drones.filter(drone => 
    drone.status === 'IDLE' || drone.status === 'PENDING'
  );

  return (
    <div className="app-container">
      <header className="header">
        <h1>🚁 Drone Dispatch System</h1>
        <div className={`connection-status ${isConnected ? 'connected' : 'disconnected'}`}>
          {isConnected ? '● Connected' : '○ Disconnected'}
        </div>
      </header>

      <div className="main-content">
        <div className="sidebar">
          <DeliveryForm />
          
          {/* Active Deliveries */}
          <div className="delivery-section">
            <h2>Active Deliveries ({activeDrones.length})</h2>
            {activeDrones.length === 0 ? (
              <div className="empty-state">No active deliveries</div>
            ) : (
              <div className="delivery-list">
                {activeDrones.map((drone) => (
                  <div key={drone.droneId} className="delivery-card active">
                    <div className="delivery-header">
                      <div className="drone-number">Drone #{drone.droneNumber}</div>
                      <span className={`status-badge ${drone.status.toLowerCase()}`}>
                        {drone.status}
                      </span>
                    </div>
                    <div className="delivery-info">
                      <div className="customer-name">{drone.customerName}</div>
                      <div className="delivery-meta">
                        Progress: {drone.progress?.toFixed(0) || 0}%
                      </div>
                      <div className="progress-bar">
                        <div 
                          className="progress-fill" 
                          style={{ width: `${drone.progress || 0}%` }}
                        />
                      </div>
                      <div className="delivery-meta">
                        Battery: {drone.battery?.toFixed(1) || 0}%
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Pending Deliveries */}
          <div className="delivery-section">
            <h2>Pending Deliveries ({pendingDrones.length})</h2>
            {pendingDrones.length === 0 ? (
              <div className="empty-state">No pending deliveries</div>
            ) : (
              <div className="delivery-list">
                {pendingDrones.map((drone) => (
                  <div key={drone.droneId} className="delivery-card pending">
                    <div className="delivery-header">
                      <div className="drone-number">Drone #{drone.droneNumber}</div>
                      <span className="status-badge pending">
                        {drone.status}
                      </span>
                    </div>
                    <div className="delivery-info">
                      <div className="customer-name">{drone.customerName}</div>
                      <div className="delivery-meta">
                        Waiting for dispatch...
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="map-container">
          <DroneMap drones={drones} />
        </div>
      </div>
    </div>
  );
}

export default App;