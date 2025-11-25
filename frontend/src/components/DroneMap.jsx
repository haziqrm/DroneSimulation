import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polygon, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './DroneMap.css';
import { getRestrictedAreas } from '../utils/api';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const createDroneIcon = (color, isSelected) => {
  return L.divIcon({
    className: 'custom-drone-icon',
    html: `
      <div style="
        background: ${color};
        width: ${isSelected ? '40px' : '32px'};
        height: ${isSelected ? '40px' : '32px'};
        border-radius: 50%;
        border: 3px solid white;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: ${isSelected ? '20px' : '16px'};
        transition: all 0.3s ease;
      ">
        🚁
      </div>
    `,
    iconSize: [isSelected ? 40 : 32, isSelected ? 40 : 32],
    iconAnchor: [isSelected ? 20 : 16, isSelected ? 20 : 16],
  });
};

const DRONE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

const getDroneColor = (droneId, droneList) => {
  const index = droneList.indexOf(droneId);
  return DRONE_COLORS[index % DRONE_COLORS.length];
};

function MapUpdater({ drones }) {
  const map = useMap();
  
  useEffect(() => {
    if (Object.keys(drones).length > 0) {
      const positions = Object.values(drones)
        .filter(d => d.currentPosition)
        .map(d => [d.currentPosition.latitude, d.currentPosition.longitude]);
      
      if (positions.length > 0) {
        const bounds = L.latLngBounds(positions);
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
      }
    }
  }, [drones, map]);
  
  return null;
}

const DroneMap = ({ activeDrones = {}, selectedDroneId }) => {
  const edinburghCenter = [55.9445, -3.1892];
  const defaultZoom = 13;
  const [restrictedAreas, setRestrictedAreas] = useState([]);

  const droneIds = Object.keys(activeDrones);

  // Fetch restricted areas on mount
  useEffect(() => {
    const fetchAreas = async () => {
      try {
        console.log('🚫 Fetching restricted areas...');
        const areas = await getRestrictedAreas();
        console.log('✅ Fetched', areas.length, 'restricted areas');
        setRestrictedAreas(areas);
      } catch (error) {
        console.error('❌ Error fetching restricted areas:', error);
      }
    };

    fetchAreas();
  }, []);

  console.log('🗺️ DroneMap rendering with', droneIds.length, 'drones');

  return (
    <div className="drone-map">
      <MapContainer
        center={edinburghCenter}
        zoom={defaultZoom}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <MapUpdater drones={activeDrones} />

        {/* Render Restricted Areas */}
        {restrictedAreas.map((area, index) => {
          if (!area.vertices || area.vertices.length === 0) {
            return null;
          }

          // Convert vertices to Leaflet format: [lat, lng]
          const positions = area.vertices.map(v => [v.lat, v.lng]);

          return (
            <Polygon
              key={index}
              positions={positions}
              pathOptions={{
                color: '#ef4444',        // Red border
                fillColor: '#fee2e2',    // Light red fill
                fillOpacity: 0.3,
                weight: 2,
                dashArray: '5, 5'        // Dashed line
              }}
            >
              <Popup>
                <div style={{ minWidth: '150px' }}>
                  <h4 style={{ margin: '0 0 8px 0', fontWeight: 600, color: '#ef4444' }}>
                    🚫 {area.name}
                  </h4>
                  <div style={{ fontSize: '12px', color: '#6b7280' }}>
                    Restricted Airspace
                  </div>
                  {area.limits && (
                    <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>
                      Altitude: {area.limits.lower}m - {area.limits.upper}m
                    </div>
                  )}
                </div>
              </Popup>
            </Polygon>
          );
        })}

        {/* Render Drones */}
        {Object.entries(activeDrones).map(([droneId, drone]) => {
          if (!drone.currentPosition) {
            console.warn('Drone', droneId, 'has no position');
            return null;
          }

          const { latitude, longitude } = drone.currentPosition;
          const color = getDroneColor(droneId, droneIds);
          const isSelected = droneId === selectedDroneId;

          return (
            <Marker
              key={droneId}
              position={[latitude, longitude]}
              icon={createDroneIcon(isSelected ? '#ef4444' : color, isSelected)}
            >
              <Popup>
                <div style={{ minWidth: '200px' }}>
                  <h4 style={{ margin: '0 0 8px 0', fontWeight: 600 }}>
                    🚁 {droneId}
                  </h4>
                  <div style={{ fontSize: '13px', lineHeight: '1.6' }}>
                    <div><strong>Position:</strong></div>
                    <div style={{ fontFamily: 'monospace', fontSize: '11px', marginBottom: '8px' }}>
                      {latitude.toFixed(6)}, {longitude.toFixed(6)}
                    </div>
                    
                    <div><strong>Delivery:</strong> #{drone.deliveryId}</div>
                    <div><strong>Status:</strong> {drone.status}</div>
                    <div><strong>Progress:</strong> {((drone.progress || 0) * 100).toFixed(0)}%</div>
                    
                    {drone.capacityUsed !== undefined && (
                      <div style={{ marginTop: '8px' }}>
                        <strong>Capacity:</strong> {drone.capacityUsed.toFixed(1)} / {drone.totalCapacity.toFixed(1)} kg
                      </div>
                    )}
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      {droneIds.length === 0 && (
        <div className="map-overlay">
          <div className="map-message">
            <div className="map-icon">🗺️</div>
            <h3>No Active Drones</h3>
            <p>Dispatch a delivery to see drones on the map</p>
            {restrictedAreas.length > 0 && (
              <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '8px' }}>
                🚫 {restrictedAreas.length} restricted areas shown in red
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default DroneMap;