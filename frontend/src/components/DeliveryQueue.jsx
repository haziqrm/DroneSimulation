import React from 'react';
import './DeliveryQueue.css';

function DeliveryQueue({ drones }) {
  const activeDeliveries = drones
    .filter(d => d.currentDeliveryId !== null)
    .map(d => ({
      droneId: d.droneId,
      deliveryId: d.currentDeliveryId,
      status: d.status,
      movesRemaining: d.movesRemaining
    }));

  return (
    <div className="delivery-queue">
      <h3>Active Deliveries</h3>
      {activeDeliveries.length === 0 ? (
        <div className="empty-state">
          <p>No active deliveries</p>
        </div>
      ) : (
        <ul>
          {activeDeliveries.map((delivery, idx) => (
            <li key={idx} className="delivery-item">
              <div className="delivery-header">
                <span className="delivery-id">
                  Delivery #{delivery.deliveryId}
                </span>
              </div>
              <div className="delivery-info">
                <div>Drone {delivery.droneId}</div>
                <div className={`status-badge ${delivery.status.toLowerCase()}`}>
                  {delivery.status}
                </div>
              </div>
              <div className="delivery-progress">
                <div className="progress-text">
                  {delivery.movesRemaining} moves remaining
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default DeliveryQueue;