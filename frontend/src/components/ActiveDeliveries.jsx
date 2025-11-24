import React from 'react';
import './ActiveDeliveries.css';

const ActiveDeliveries = ({ deliveries = [] }) => {
  const statusConfig = {
    DEPLOYING: { emoji: '🚀', color: '#3b82f6' },
    FLYING: { emoji: '✈️', color: '#3b82f6' },
    DELIVERING: { emoji: '📦', color: '#10b981' },
    RETURNING: { emoji: '🔙', color: '#f59e0b' },
    COMPLETED: { emoji: '✅', color: '#6b7280' }
  };

  if (!deliveries || deliveries.length === 0) {
    return (
      <div className="active-deliveries">
        <h3>📦 Active Deliveries</h3>
        <div className="empty-state">
          <div className="empty-icon">📦</div>
          <p>No active deliveries</p>
          <small>Deliveries will appear here when dispatched</small>
        </div>
      </div>
    );
  }

  return (
    <div className="active-deliveries">
      <h3>📦 Active Deliveries ({deliveries.length})</h3>
      <div className="delivery-cards">
        {deliveries.map(delivery => {
          const config = statusConfig[delivery.status] || { emoji: '📦', color: '#6b7280' };

          return (
            <div
              key={delivery.deliveryId}
              className="delivery-card"
              style={{ borderLeftColor: config.color }}
            >
              <div className="delivery-header">
                <span className="delivery-id">
                  {config.emoji} Delivery #{delivery.deliveryId}
                </span>
                <span 
                  className="delivery-status"
                  style={{ 
                    backgroundColor: config.color + '20',
                    color: config.color 
                  }}
                >
                  {delivery.status}
                </span>
              </div>

              <div className="delivery-info">
                <div className="info-row">
                  <span className="info-label">Drone:</span>
                  <span className="info-value">{delivery.droneId}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Location:</span>
                  <span className="info-value">
                    {(delivery.latitude || 0).toFixed(4)}, {(delivery.longitude || 0).toFixed(4)}
                  </span>
                </div>
              </div>

              <div className="progress-container">
                <div className="progress-label">
                  {((delivery.progress || 0) * 100).toFixed(0)}% Complete
                </div>
                <div className="progress-bar">
                  <div 
                    className="progress-fill"
                    style={{ 
                      width: `${((delivery.progress || 0) * 100)}%`,
                      backgroundColor: config.color
                    }}
                  ></div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ActiveDeliveries;