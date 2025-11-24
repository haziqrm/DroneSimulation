import React from 'react';
import './DroneList.css';

const DroneList = ({ drones = [], selectedDroneId = null, onDroneSelect }) => {
  const statusConfig = {
    DEPLOYING: { emoji: '🚀', color: '#3b82f6' },
    FLYING: { emoji: '✈️', color: '#3b82f6' },
    DELIVERING: { emoji: '📦', color: '#10b981' },
    RETURNING: { emoji: '🔙', color: '#f59e0b' },
    COMPLETED: { emoji: '✅', color: '#6b7280' }
  };

  if (!drones || drones.length === 0) {
    return (
      <div className="drone-list">
        <h3>🚁 Active Drones</h3>
        <div className="empty-state">
          <div className="empty-icon">🚁</div>
          <p>No active deliveries</p>
          <small>Submit a delivery to see drones in action</small>
        </div>
      </div>
    );
  }

  return (
    <div className="drone-list">
      <h3>🚁 Active Drones ({drones.length})</h3>
      <div className="drone-cards">
        {drones.map(drone => {
          const config = statusConfig[drone.status] || { emoji: '🚁', color: '#6b7280' };
          const isSelected = selectedDroneId === drone.droneId;

          return (
            <div
              key={drone.droneId}
              className={`drone-card ${isSelected ? 'selected' : ''}`}
              onClick={() => onDroneSelect && onDroneSelect(drone.droneId)}
              style={{ borderLeftColor: config.color }}
            >
              <div className="drone-header">
                <span className="drone-id">{config.emoji} {drone.droneId}</span>
                <span 
                  className="drone-status"
                  style={{ 
                    backgroundColor: config.color + '20',
                    color: config.color 
                  }}
                >
                  {drone.status}
                </span>
              </div>
              
              <div className="drone-info">
                <div className="info-row">
                  <span className="info-label">Delivery:</span>
                  <span className="info-value">#{drone.deliveryId}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Progress:</span>
                  <span className="info-value">{((drone.progress || 0) * 100).toFixed(0)}%</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Capacity:</span>
                  <span className="info-value">
                    {(drone.capacityUsed || 0).toFixed(1)} / {(drone.totalCapacity || 0).toFixed(1)} kg
                  </span>
                </div>
              </div>

              <div className="progress-bar-mini">
                <div 
                  className="progress-fill-mini"
                  style={{ 
                    width: `${((drone.progress || 0) * 100)}%`,
                    backgroundColor: config.color
                  }}
                ></div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default DroneList;