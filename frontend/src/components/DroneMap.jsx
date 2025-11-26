import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Polygon, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { getRestrictedAreas, getServicePoints } from '../utils/api';

const DroneMap = ({ drones }) => {
  const [restrictedAreas, setRestrictedAreas] = useState([]);
  const [servicePoints, setServicePoints] = useState([]);
  const [flightPaths, setFlightPaths] = useState({}); // Store full paths for each drone
  const [deliveryPoints, setDeliveryPoints] = useState({}); // Delivery destinations
  const [completedPaths, setCompletedPaths] = useState({}); // Paths fading out

  const center = [55.9445, -3.1892];

  console.log('🗺️ DroneMap render - Service points count:', servicePoints.length);
  console.log('🗺️ DroneMap render - Delivery points:', Object.keys(deliveryPoints).length);
  console.log('🗺️ DroneMap render - Drones count:', drones.length);

  // Fetch restricted areas
  useEffect(() => {
    const fetchRestrictedAreas = async () => {
      try {
        const response = await fetch('https://ilp-rest-2025-bvh6e9hschfagrgy.ukwest-01.azurewebsites.net/restricted-areas');
        if (!response.ok) {
          console.error('Failed to fetch restricted areas:', response.status);
          return;
        }
        const areas = await response.json();
        console.log('✅ Loaded restricted areas:', areas);
        setRestrictedAreas(areas);
      } catch (error) {
        console.error('❌ Error fetching restricted areas:', error);
      }
    };
    fetchRestrictedAreas();
  }, []);

  // Fetch service points - fetch directly to ensure it works
  useEffect(() => {
    const fetchServicePoints = async () => {
      try {
        console.log('📡 Fetching service points...');
        const response = await fetch('https://ilp-rest-2025-bvh6e9hschfagrgy.ukwest-01.azurewebsites.net/service-points');
        if (!response.ok) {
          console.error('Failed to fetch service points:', response.status);
          return;
        }
        const points = await response.json();
        console.log('✅ Loaded service points:', points);
        setServicePoints(points);
      } catch (error) {
        console.error('❌ Error fetching service points:', error);
      }
    };
    fetchServicePoints();
  }, []);

  // Update flight paths and delivery points when new drones appear
  useEffect(() => {
    drones.forEach(drone => {
      // If we have route data, store the full path
      if (drone.route && !flightPaths[drone.droneId]) {
        console.log(`📍 Storing route for drone ${drone.droneId}, ${drone.route.length} points`);
        setFlightPaths(prev => ({
          ...prev,
          [drone.droneId]: drone.route
        }));
      }

      // Store delivery destination
      if (drone.deliveryLatitude && drone.deliveryLongitude && !deliveryPoints[drone.droneId]) {
        console.log(`🎯 Setting delivery point for drone ${drone.droneId}:`, 
          drone.deliveryLatitude, drone.deliveryLongitude);
        setDeliveryPoints(prev => ({
          ...prev,
          [drone.droneId]: {
            position: [drone.deliveryLatitude, drone.deliveryLongitude],
            deliveryId: drone.deliveryId,
            completed: false
          }
        }));
      } else if (!drone.deliveryLatitude || !drone.deliveryLongitude) {
        console.log(`⚠️ Drone ${drone.droneId} missing delivery coords:`, 
          drone.deliveryLatitude, drone.deliveryLongitude);
      }

      // Mark delivery as completed when drone completes
      if (drone.status === 'COMPLETED' && deliveryPoints[drone.droneId]) {
        setDeliveryPoints(prev => ({
          ...prev,
          [drone.droneId]: {
            ...prev[drone.droneId],
            completed: true
          }
        }));
      }
    });

    // Clean up paths and markers for completed drones
    const activeDroneIds = new Set(drones.map(d => d.droneId));
    
    Object.keys(flightPaths).forEach(droneId => {
      if (!activeDroneIds.has(droneId)) {
        // Move to completed paths
        setCompletedPaths(prev => ({
          ...prev,
          [droneId]: flightPaths[droneId]
        }));

        // Remove after 3 seconds
        setTimeout(() => {
          setCompletedPaths(prev => {
            const updated = { ...prev };
            delete updated[droneId];
            return updated;
          });
          setFlightPaths(prev => {
            const updated = { ...prev };
            delete updated[droneId];
            return updated;
          });
          setDeliveryPoints(prev => {
            const updated = { ...prev };
            delete updated[droneId];
            return updated;
          });
        }, 3000);
      }
    });
  }, [drones, flightPaths, deliveryPoints]);

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

  const createDeliveryIcon = (completed) => {
    const color = completed ? '#27ae60' : '#e74c3c';
    const emoji = completed ? '✅' : '📍';
    
    return L.divIcon({
      html: `<div style="
        background: ${color};
        color: white;
        width: 28px;
        height: 28px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
        border: 2px solid white;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      ">${emoji}</div>`,
      className: '',
      iconSize: [28, 28],
      iconAnchor: [14, 14]
    });
  };

  const createServicePointIcon = () => {
    return L.divIcon({
      html: `<div style="
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 16px;
        border: 3px solid white;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      ">🏥</div>`,
      className: '',
      iconSize: [32, 32],
      iconAnchor: [16, 16]
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
        {restrictedAreas && restrictedAreas.length > 0 && restrictedAreas.map((area, index) => {
          if (!area.vertices || !Array.isArray(area.vertices) || area.vertices.length < 3) {
            return null;
          }
          
          const positions = area.vertices
            .filter(v => v && typeof v.lat === 'number' && typeof v.lng === 'number')
            .map(v => [v.lat, v.lng]);

          if (positions.length < 3) {
            return null;
          }

          return (
            <Polygon
              key={`restricted-${area.id || index}`}
              positions={positions}
              pathOptions={{
                color: '#e74c3c',
                fillColor: '#fadbd8',
                fillOpacity: 0.35,
                weight: 2,
                dashArray: '8, 4'
              }}
            >
              <Popup>
                <strong>🚫 Restricted Area</strong><br/>
                {area.name || `Zone ${index + 1}`}
              </Popup>
            </Polygon>
          );
        })}

        {/* Service Points - Always Visible */}
        {servicePoints && servicePoints.length > 0 && servicePoints.map((point, index) => {
          if (!point.location || typeof point.location.lat !== 'number') {
            return null;
          }

          return (
            <Marker
              key={`service-${point.id || index}`}
              position={[point.location.lat, point.location.lng]}
              icon={createServicePointIcon()}
              zIndexOffset={100}
            >
              <Popup>
                <strong>🏥 Service Point</strong><br/>
                {point.name || `Point ${index + 1}`}
              </Popup>
            </Marker>
          );
        })}

        {/* Completed Flight Paths (fading) */}
        {Object.entries(completedPaths).map(([droneId, path]) => (
          <Polyline
            key={`completed-${droneId}`}
            positions={path}
            pathOptions={{
              color: '#95a5a6',
              weight: 2,
              opacity: 0.3,
              dashArray: '8, 4'
            }}
          />
        ))}

        {/* Active Flight Paths (pre-plotted) */}
        {Object.entries(flightPaths).map(([droneId, path]) => (
          <Polyline
            key={`path-${droneId}`}
            positions={path}
            pathOptions={{
              color: '#3498db',
              weight: 2.5,
              opacity: 0.5,
              dashArray: '8, 4',
              lineCap: 'round'
            }}
          />
        ))}

        {/* Delivery Destination Markers */}
        {Object.entries(deliveryPoints).map(([droneId, point]) => (
          <Marker
            key={`delivery-${droneId}`}
            position={point.position}
            icon={createDeliveryIcon(point.completed)}
            zIndexOffset={50}
          >
            <Popup>
              <strong>{point.completed ? '✅ Delivered' : '📍 Delivery Point'}</strong><br/>
              Delivery #{point.deliveryId}<br/>
              Drone {droneId}
            </Popup>
          </Marker>
        ))}

        {/* Active Drones */}
        {drones && drones.length > 0 && drones.map((drone) => (
          <Marker
            key={`drone-${drone.droneId}`}
            position={[drone.latitude, drone.longitude]}
            icon={createDroneIcon(drone.droneId)}
            zIndexOffset={200}
          >
            <Popup>
              <strong>🚁 Drone {drone.droneId}</strong><br/>
              Status: {drone.status}<br/>
              {drone.batchId && (
                <>
                  Batch: {drone.batchId}<br/>
                  Delivery {drone.currentDeliveryInBatch}/{drone.totalDeliveriesInBatch}<br/>
                </>
              )}
              {!drone.batchId && (
                <>Delivery: #{drone.deliveryId}<br/></>
              )}
              Progress: {drone.progress?.toFixed(0)}%
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
};

export default DroneMap;