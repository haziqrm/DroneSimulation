import React from 'react';
import './DroneList.css';

function DroneList({ drones, selectedDrone, onSelectDrone }) {
  const statusColors = {
    FLYING: '#3b82f6',
    DELIVERING: '#10b981',
    RETURNING: '#f59e0b',
    RETURNED: '#6b7280'
  };

  return (
    <div className="drone-list">
      <h3>🚁 Active Drones</h3>
      {drones.length === 0 ? (
        <div className="empty-state">
          <p>No active drones</p>
          <p style={{ fontSize: '12px', color: '#666' }}>
            Click "Start Simulation" to begin
          </p>
        </div>
      ) : (
        <ul>
          {drones.map((drone) => (
            <li
              key={drone.droneId}
              className={`drone-item ${selectedDrone === drone.droneId ? 'selected' : ''}`}
              onClick={() => onSelectDrone(drone.droneId)}
              style={{ borderLeft: `4px solid ${statusColors[drone.status]}` }}
            >
              <div className="drone-header">
                <span className="drone-id">Drone {drone.droneId}</span>
                <span 
                  className="drone-status"
                  style={{ color: statusColors[drone.status] }}
                >
                  {drone.status}
                </span>
              </div>
              {drone.currentDeliveryId && (
                <div className="drone-delivery">
                  📦 Delivery #{drone.currentDeliveryId}
                </div>
              )}
              <div className="drone-info">
                <span>⚡ {drone.movesRemaining} moves left</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default DroneList;