import React from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, Circle } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet icon issue
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
  iconUrl: require('leaflet/dist/images/marker-icon.png'),
  shadowUrl: require('leaflet/dist/images/marker-shadow.png'),
});

// Custom drone icons
const createDroneIcon = (status) => {
  const emoji = {
    FLYING: '🚁',
    DELIVERING: '📦',
    RETURNING: '🔙',
    RETURNED: '✅'
  }[status] || '🚁';

  return L.divIcon({
    html: `<div style="font-size: 24px;">${emoji}</div>`,
    className: 'drone-marker',
    iconSize: [30, 30]
  });
};

// Delivery marker icons
const createDeliveryIcon = (completed) => {
  const emoji = completed ? '✅' : '📍';
  const color = completed ? '#10b981' : '#ef4444';
  
  return L.divIcon({
    html: `<div style="font-size: 28px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));">${emoji}</div>`,
    className: 'delivery-marker',
    iconSize: [30, 30]
  });
};

// Drone colors for paths
const droneColors = [
  '#3b82f6', // blue
  '#10b981', // green
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
];

function DroneMap({ drones, selectedDrone }) {
  const center = [55.9445, -3.1892]; // Edinburgh

  return (
    <MapContainer
      center={center}
      zoom={14}
      style={{ height: '100%', width: '100%' }}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; OpenStreetMap contributors'
      />

      {/* Render paths and deliveries for each drone */}
      {drones.map((drone, index) => {
        const droneColor = droneColors[index % droneColors.length];
        
        return (
          <React.Fragment key={drone.droneId}>
            {/* Completed path (solid line) */}
            {drone.completedPath && drone.completedPath.length > 1 && (
              <Polyline
                positions={drone.completedPath.map(p => [p[1], p[0]])} // [lat, lng]
                color={droneColor}
                weight={4}
                opacity={0.8}
                dashArray="none"
              />
            )}

            {/* Remaining path (dashed line) */}
            {drone.remainingPath && drone.remainingPath.length > 1 && (
              <Polyline
                positions={drone.remainingPath.map(p => [p[1], p[0]])} // [lat, lng]
                color={droneColor}
                weight={3}
                opacity={0.4}
                dashArray="10, 10"
              />
            )}

            {/* Delivery point markers */}
            {drone.deliveryPoints && drone.deliveryPoints.map((delivery) => (
              <Marker
                key={`delivery-${drone.droneId}-${delivery.deliveryId}`}
                position={[delivery.lat, delivery.lng]}
                icon={createDeliveryIcon(delivery.completed)}
                zIndexOffset={delivery.completed ? 100 : 200}
              >
                <Popup>
                  <div style={{ minWidth: '120px' }}>
                    <h4 style={{ margin: '0 0 8px 0' }}>
                      📦 Delivery #{delivery.deliveryId}
                    </h4>
                    <p style={{ margin: '4px 0' }}>
                      <strong>Status:</strong> {delivery.completed ? 'Completed ✅' : 'Pending ⏳'}
                    </p>
                    <p style={{ margin: '4px 0' }}>
                      <strong>Drone:</strong> {drone.droneId}
                    </p>
                    <p style={{ margin: '4px 0', fontSize: '10px', color: '#666' }}>
                      {delivery.lat.toFixed(6)}, {delivery.lng.toFixed(6)}
                    </p>
                  </div>
                </Popup>
              </Marker>
            ))}

            {/* Current drone position */}
            <Marker
              position={[drone.lat, drone.lng]}
              icon={createDroneIcon(drone.status)}
              zIndexOffset={1000}
            >
              <Popup>
                <div style={{ minWidth: '150px' }}>
                  <h3 style={{ margin: '0 0 8px 0' }}>
                    🚁 Drone {drone.droneId}
                  </h3>
                  <p style={{ margin: '4px 0' }}>
                    <strong>Status:</strong> {drone.status}
                  </p>
                  {drone.currentDeliveryId && (
                    <p style={{ margin: '4px 0' }}>
                      <strong>Delivery:</strong> #{drone.currentDeliveryId}
                    </p>
                  )}
                  <p style={{ margin: '4px 0' }}>
                    <strong>Moves Left:</strong> {drone.movesRemaining}
                  </p>
                  <p style={{ margin: '4px 0', fontSize: '10px', color: '#666' }}>
                    Position: {drone.lat.toFixed(6)}, {drone.lng.toFixed(6)}
                  </p>
                </div>
              </Popup>
            </Marker>

            {/* Highlight selected drone */}
            {selectedDrone === drone.droneId && (
              <Circle
                center={[drone.lat, drone.lng]}
                radius={100}
                pathOptions={{ 
                  color: droneColor, 
                  fillColor: droneColor, 
                  fillOpacity: 0.2 
                }}
              />
            )}
          </React.Fragment>
        );
      })}

      {/* Legend */}
      <div style={{
        position: 'absolute',
        bottom: '20px',
        right: '20px',
        background: 'white',
        padding: '12px',
        borderRadius: '8px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
        zIndex: 1000,
        fontSize: '12px'
      }}>
        <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>Legend</div>
        <div style={{ marginBottom: '4px' }}>🚁 Drone (flying)</div>
        <div style={{ marginBottom: '4px' }}>📦 Drone (delivering)</div>
        <div style={{ marginBottom: '4px' }}>📍 Pending delivery</div>
        <div style={{ marginBottom: '4px' }}>✅ Completed delivery</div>
        <div style={{ marginBottom: '4px' }}>
          <span style={{ 
            display: 'inline-block', 
            width: '20px', 
            height: '3px', 
            background: '#3b82f6',
            verticalAlign: 'middle',
            marginRight: '4px'
          }}></span> 
          Completed path
        </div>
        <div>
          <span style={{ 
            display: 'inline-block', 
            width: '20px', 
            height: '3px', 
            background: '#3b82f6',
            opacity: 0.4,
            verticalAlign: 'middle',
            marginRight: '4px',
            backgroundImage: 'repeating-linear-gradient(90deg, #3b82f6, #3b82f6 5px, transparent 5px, transparent 10px)'
          }}></span> 
          Planned path
        </div>
      </div>
    </MapContainer>
  );
}

export default DroneMap;