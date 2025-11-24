import React from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, Circle } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet default marker icon issue
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
  iconUrl: require('leaflet/dist/images/marker-icon.png'),
  shadowUrl: require('leaflet/dist/images/marker-shadow.png'),
});

const DroneMap = ({ activeDrones = [], selectedDroneId = null }) => {
  const center = [55.9445, -3.1892]; // Edinburgh city center
  const baseStation = [55.9445, -3.1892];

  // Status to icon mapping
  const statusIcons = {
    DEPLOYING: '🚀',
    FLYING: '✈️',
    DELIVERING: '📦',
    RETURNING: '🔙',
    COMPLETED: '✅'
  };

  // Drone colors (cycle through for multiple drones)
  const droneColors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

  const createCustomIcon = (emoji, color) => {
    return L.divIcon({
      html: `<div style="font-size: 24px; text-shadow: 0 0 3px white;">${emoji}</div>`,
      className: 'custom-icon',
      iconSize: [30, 30],
      iconAnchor: [15, 15]
    });
  };

  return (
    <MapContainer 
      center={center} 
      zoom={14} 
      style={{ height: '100%', width: '100%' }}
      scrollWheelZoom={true}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {/* Base station marker */}
      <Marker 
        position={baseStation}
        icon={createCustomIcon('🏥', '#000000')}
      >
        <Popup>
          <strong>🏥 Base Station</strong><br />
          Edinburgh Medical Drone Hub
        </Popup>
      </Marker>

      {/* Active drones */}
      {activeDrones && activeDrones.length > 0 && activeDrones.map((drone, index) => {
        const droneColor = droneColors[index % droneColors.length];
        const icon = statusIcons[drone.status] || '🚁';
        const position = [drone.latitude, drone.longitude];

        return (
          <React.Fragment key={drone.droneId}>
            {/* Drone marker */}
            <Marker
              position={position}
              icon={createCustomIcon(icon, droneColor)}
            >
              <Popup>
                <div style={{ minWidth: '200px' }}>
                  <strong>{icon} Drone {drone.droneId}</strong><br />
                  <strong>Status:</strong> {drone.status}<br />
                  <strong>Delivery:</strong> #{drone.deliveryId}<br />
                  <strong>Progress:</strong> {(drone.progress * 100).toFixed(0)}%<br />
                  <strong>Capacity:</strong> {drone.capacityUsed?.toFixed(1) || 0} / {drone.totalCapacity?.toFixed(1) || 0} kg<br />
                  <strong>Location:</strong> {drone.latitude?.toFixed(4)}, {drone.longitude?.toFixed(4)}
                </div>
              </Popup>
            </Marker>

            {/* Highlight selected drone */}
            {selectedDroneId === drone.droneId && (
              <Circle
                center={position}
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
        padding: '10px',
        borderRadius: '8px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
        zIndex: 1000,
        fontSize: '12px'
      }}>
        <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>Legend</div>
        <div>🏥 Base Station</div>
        <div>🚀 Deploying</div>
        <div>✈️ Flying</div>
        <div>📦 Delivering</div>
        <div>🔙 Returning</div>
        <div>✅ Completed</div>
      </div>
    </MapContainer>
  );
};

export default DroneMap;