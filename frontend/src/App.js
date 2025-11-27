import React, { useState } from 'react';
import DeliveryForm from './components/DeliveryForm';
import DroneMap from './components/DroneMap';
import useWebSocket from './hooks/useWebSocket';
import './App.css';

function App() {
  const { drones, isConnected } = useWebSocket();
  const [isPinMode, setIsPinMode] = useState(false);
  const [onCoordinateSelect, setOnCoordinateSelect] = useState(null);

  const activeDrones = drones.filter(drone => 
    drone.status === 'FLYING' || drone.status === 'DELIVERING' || drone.status === 'RETURNING'
  );
  
  const pendingDrones = drones.filter(drone => 
    drone.status === 'IDLE' || drone.status === 'PENDING' || drone.status === 'DEPLOYING'
  );

  const enablePinMode = (callback) => {
    setIsPinMode(true);
    setOnCoordinateSelect(() => callback);
  };

  const handleMapClick = (lat, lng) => {
    if (onCoordinateSelect) {
      onCoordinateSelect(lat, lng);
      setIsPinMode(false);
      setOnCoordinateSelect(null);
    }
  };

  const cancelPinMode = () => {
    setIsPinMode(false);
    setOnCoordinateSelect(null);
  };

  return (
    <div className="app-container">
      <header className="header">
        <h1>Drone Dispatch System</h1>
        <div className={`connection-status ${isConnected ? 'connected' : 'disconnected'}`}>
          {isConnected ? '● Connected' : '○ Disconnected'}
        </div>
      </header>

      <div className="main-content">
        <div className="sidebar">
          <DeliveryForm 
            enablePinMode={enablePinMode}
            isPinMode={isPinMode}
            cancelPinMode={cancelPinMode}
          />

          <div className="delivery-section">
            <h2>Active Deliveries ({activeDrones.length})</h2>
            {activeDrones.length === 0 ? (
              <div className="empty-state">No active deliveries</div>
            ) : (
              <div className="delivery-list">
                {activeDrones.map((drone) => (
                  <div key={drone.droneId} className="delivery-card active">
                    <div className="delivery-header">
                      <div className="drone-number">Drone {drone.droneId}</div>
                      <span className={`status-badge ${drone.status.toLowerCase()}`}>
                        {drone.status}
                      </span>
                    </div>
                    <div className="delivery-info">
                      <div className="customer-name">{drone.customerName}</div>
                      {drone.batchId && (
                        <div className="batch-info">
                          <span className="batch-badge">
                            {drone.batchId}
                          </span>
                          {drone.currentDeliveryInBatch && drone.totalDeliveriesInBatch && (
                            <span className="batch-progress-text">
                              ({drone.currentDeliveryInBatch}/{drone.totalDeliveriesInBatch})
                            </span>
                          )}
                        </div>
                      )}
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

          <div className="delivery-section">
            <h2>Pending Deliveries ({pendingDrones.length})</h2>
            {pendingDrones.length === 0 ? (
              <div className="empty-state">No pending deliveries</div>
            ) : (
              <div className="delivery-list">
                {pendingDrones.map((drone) => (
                  <div key={drone.droneId} className="delivery-card pending">
                    <div className="delivery-header">
                      <div className="drone-number">Drone {drone.droneId}</div>
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

        <div className={`map-container ${isPinMode ? 'pin-mode-active' : ''}`}>
          <DroneMap 
            drones={drones} 
            isPinMode={isPinMode}
            onMapClick={handleMapClick}
          />
          {isPinMode && (
            <div className="pin-mode-overlay">
              <div className="pin-mode-banner">
                Click on the map to select delivery location
                <button className="btn-cancel-pin" onClick={cancelPinMode}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;