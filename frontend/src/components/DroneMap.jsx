import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Polygon, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { getRestrictedAreas, getServicePoints } from '../utils/api';

const DroneMap = ({ drones }) => {
  const [restrictedAreas, setRestrictedAreas] = useState([]);
  const [servicePoints, setServicePoints] = useState([]);

  const center = [55.9445, -3.1892];

  useEffect(() => {
    const fetchRestrictedAreas = async () => {
      try {
        const areas = await getRestrictedAreas();
        if (areas && Array.isArray(areas)) {
          setRestrictedAreas(areas);
          console.log('✅ Loaded restricted areas:', areas.length);
        }
      } catch (error) {
        console.error('Error fetching restricted areas:', error);
      }
    };
    fetchRestrictedAreas();
  }, []);

  useEffect(() => {
    const fetchServicePoints = async () => {
      try {
        const points = await getServicePoints();
        if (points && Array.isArray(points)) {
          setServicePoints(points);
          console.log('✅ Loaded service points:', points.length);
        }
      } catch (error) {
        console.error('Error fetching service points:', error);
      }
    };
    fetchServicePoints();
  }, []);

  const createDroneIcon = (droneId) => {
    return L.divIcon({
      html: `<div style="
        background: #3498db;
        color: white;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: bold;
        font-size: 14px;
        border: 2px solid white;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      ">${droneId}</div>`,
      className: '',
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    });
  };

  const createDeliveryIcon = () => {
    return L.divIcon({
      html: `<div style="
        background: #e74c3c;
        color: white;
        width: 24px;
        height: 24px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 12px;
        border: 2px solid white;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      ">📦</div>`,
      className: '',
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    });
  };

  const createServicePointIcon = () => {
    return L.divIcon({
      html: `<div style="
        background: #27ae60;
        color: white;
        width: 28px;
        height: 28px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 16px;
        border: 2px solid white;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      ">🏥</div>`,
      className: '',
      iconSize: [28, 28],
      iconAnchor: [14, 14]
    });
  };

  return (
    <div style={{ height: '100%', width: '100%', position: 'relative' }}>
      <MapContainer
        center={center}
        zoom={14}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Restricted Areas */}
        {restrictedAreas.map((area, index) => {
          if (!area.vertices || !Array.isArray(area.vertices)) return null;
          
          const positions = area.vertices
            .map(v => (v && typeof v.lat === 'number' && typeof v.lng === 'number') ? [v.lat, v.lng] : null)
            .filter(pos => pos !== null);

          if (positions.length < 3) return null;

          return (
            <Polygon
              key={`restricted-${index}`}
              positions={positions}
              pathOptions={{
                color: '#e74c3c',
                fillColor: '#fadbd8',
                fillOpacity: 0.3,
                weight: 2,
                dashArray: '5, 5'
              }}
            >
              <Popup>{area.name || `Restricted Zone ${index + 1}`}</Popup>
            </Polygon>
          );
        })}

        {/* Service Points */}
        {servicePoints.map((point, index) => {
          if (!point.location || typeof point.location.lat !== 'number') return null;

          return (
            <Marker
              key={`service-${index}`}
              position={[point.location.lat, point.location.lng]}
              icon={createServicePointIcon()}
            >
              <Popup>
                <strong>Service Point</strong><br/>
                {point.name || `Point ${index + 1}`}
              </Popup>
            </Marker>
          );
        })}

        {/* Active Drones */}
        {drones && drones.length > 0 && drones.map((drone) => (
          <Marker
            key={drone.droneId}
            position={[drone.latitude, drone.longitude]}
            icon={createDroneIcon(drone.droneId)}
          >
            <Popup>
              <strong>Drone {drone.droneId}</strong><br/>
              Status: {drone.status}<br/>
              Delivery: #{drone.deliveryId}<br/>
              Progress: {drone.progress?.toFixed(0)}%
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
};

export default DroneMap;