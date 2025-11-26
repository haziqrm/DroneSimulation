import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Polygon, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const DroneMap = ({ drones }) => {
  const [restrictedAreas, setRestrictedAreas] = useState([]);
  const [servicePoints, setServicePoints] = useState([]);
  const [flightPaths, setFlightPaths] = useState({});
  const [deliveryPoints, setDeliveryPoints] = useState({});
  const [completedPaths, setCompletedPaths] = useState({});

  const center = [55.9445, -3.1892];

  // Fetch restricted areas from backend (to avoid CORS)
  useEffect(() => {
    const fetchRestrictedAreas = async () => {
      try {
        console.log('🔍 Fetching restricted areas from backend...');
        const response = await fetch('http://localhost:8080/api/v1/map/restricted-areas');
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const areas = await response.json();
        console.log('✅ Restricted areas loaded:', areas.length);
        setRestrictedAreas(areas);
      } catch (error) {
        console.error('❌ Error fetching restricted areas:', error);
      }
    };
    fetchRestrictedAreas();
  }, []);

  // Fetch service points from backend (to avoid CORS) - CRITICAL: Must load on mount
  useEffect(() => {
    const fetchServicePoints = async () => {
      try {
        console.log('🏥 Fetching service points from backend...');
        const response = await fetch('http://localhost:8080/api/v1/map/service-points');
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const points = await response.json();
        console.log('✅ Service points loaded:', points.length, points);
        setServicePoints(points);
      } catch (error) {
        console.error('❌ Error fetching service points:', error);
      }
    };
    fetchServicePoints();
  }, []); // Empty deps = run once on mount

  // Update flight paths and delivery points when drones update
  useEffect(() => {
    console.log('🔄 Drone update - Processing', drones.length, 'drones');
    
    drones.forEach(drone => {
      console.log(`🔍 Drone ${drone.droneId} check:`, {
        hasDeliveryLat: !!drone.deliveryLatitude,
        hasDeliveryLng: !!drone.deliveryLongitude,
        deliveryLat: drone.deliveryLatitude,
        deliveryLng: drone.deliveryLongitude,
        inState: !!deliveryPoints[drone.droneId]
      });
      
      // Store full route on first update
      if (drone.route && !flightPaths[drone.droneId]) {
        console.log(`📍 Storing route for drone ${drone.droneId}: ${drone.route.length} waypoints`);
        setFlightPaths(prev => ({
          ...prev,
          [drone.droneId]: drone.route
        }));
      }

      // Store delivery destination
      if (drone.deliveryLatitude && drone.deliveryLongitude) {
        if (!deliveryPoints[drone.droneId]) {
          console.log(`🎯 CREATING NEW delivery marker for ${drone.droneId} at [${drone.deliveryLatitude}, ${drone.deliveryLongitude}]`);
          
          setDeliveryPoints(prev => ({
            ...prev,
            [drone.droneId]: {
              position: [drone.deliveryLatitude, drone.deliveryLongitude],
              deliveryId: drone.deliveryId,
              droneId: drone.droneId,
              completed: false
            }
          }));
        } else if (drone.status === 'COMPLETED' && !deliveryPoints[drone.droneId].completed) {
          console.log(`✅ Marking delivery ${drone.droneId} as COMPLETED`);
          setDeliveryPoints(prev => ({
            ...prev,
            [drone.droneId]: {
              ...prev[drone.droneId],
              completed: true
            }
          }));
        }
      } else {
        console.warn(`❌ Drone ${drone.droneId} MISSING delivery coordinates - no marker will appear!`);
      }
    });
    
    console.log(`📊 DELIVERY MARKERS IN STATE:`, {
      count: Object.keys(deliveryPoints).length,
      markers: deliveryPoints
    });

    // Clean up completed drones
    const activeDroneIds = new Set(drones.map(d => d.droneId));
    Object.keys(flightPaths).forEach(droneId => {
      if (!activeDroneIds.has(droneId)) {
        console.log(`🧹 Cleaning up completed drone ${droneId}`);
        setCompletedPaths(prev => ({ ...prev, [droneId]: flightPaths[droneId] }));
        
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

  // Log current state for debugging
  useEffect(() => {
    console.log('📊 MAP STATE:', {
      servicePoints: servicePoints.length,
      deliveryPoints: Object.keys(deliveryPoints).length,
      activeDrones: drones.length,
      flightPaths: Object.keys(flightPaths).length
    });
  }, [servicePoints, deliveryPoints, drones, flightPaths]);

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
        font-size: 12px;
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
        width: 40px;
        height: 40px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 20px;
        border: 3px solid white;
        box-shadow: 0 4px 12px rgba(0,0,0,0.4);
      ">${emoji}</div>`,
      className: '',
      iconSize: [40, 40],
      iconAnchor: [20, 20]
    });
  };

  const createServicePointIcon = () => {
    return L.divIcon({
      html: `<div style="
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        width: 48px;
        height: 48px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 24px;
        border: 4px solid white;
        box-shadow: 0 4px 12px rgba(0,0,0,0.4);
      ">🏥</div>`,
      className: '',
      iconSize: [48, 48],
      iconAnchor: [24, 24]
    });
  };

  console.log('🗺️ RENDERING MAP with:', {
    servicePoints: servicePoints.length,
    deliveryPoints: Object.keys(deliveryPoints).length,
    restrictedAreas: restrictedAreas.length,
    drones: drones.length
  });

  // Debug: Log what we're actually rendering
  console.log('🏥 Service points to render:', servicePoints);
  console.log('📍 Delivery points to render:', deliveryPoints);

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

        {/* Restricted Areas - LOWEST LAYER */}
        {restrictedAreas.map((area, index) => {
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

        {/* SERVICE POINTS - ALWAYS VISIBLE - PERMANENT MARKERS */}
        {servicePoints.map((point, index) => {
          if (!point || !point.location) {
            console.warn('⚠️ Invalid service point:', point);
            return null;
          }

          const lat = point.location.lat;
          const lng = point.location.lng;

          if (typeof lat !== 'number' || typeof lng !== 'number') {
            console.warn('⚠️ Invalid service point coords:', point);
            return null;
          }

          console.log(`🏥 Rendering service point: ${point.name} at [${lat}, ${lng}]`);

          return (
            <Marker
              key={`service-${point.id || index}`}
              position={[lat, lng]}
              icon={createServicePointIcon()}
              zIndexOffset={10000}
            >
              <Popup>
                <div style={{ textAlign: 'center' }}>
                  <strong>🏥 {point.name}</strong><br/>
                  <small>Service Point #{point.id}</small><br/>
                  <small>{lat.toFixed(4)}, {lng.toFixed(4)}</small>
                </div>
              </Popup>
            </Marker>
          );
        })}

        {/* DELIVERY DESTINATION MARKERS - HIGH PRIORITY */}
        {Object.entries(deliveryPoints).map(([droneId, point]) => {
          console.log(`📍 Rendering delivery marker for drone ${droneId}:`, point);
          
          return (
            <Marker
              key={`delivery-${droneId}`}
              position={point.position}
              icon={createDeliveryIcon(point.completed)}
              zIndexOffset={5000}
            >
              <Popup>
                <div style={{ textAlign: 'center' }}>
                  <strong>{point.completed ? '✅ Delivered' : '📍 Delivery Point'}</strong><br/>
                  <small>Delivery #{point.deliveryId}</small><br/>
                  <small>Drone {point.droneId}</small><br/>
                  <small>{point.position[0].toFixed(4)}, {point.position[1].toFixed(4)}</small>
                </div>
              </Popup>
            </Marker>
          );
        })}

        {/* Active Drones - ALWAYS ON TOP */}
        {drones.map((drone) => (
          <Marker
            key={`drone-${drone.droneId}`}
            position={[drone.latitude, drone.longitude]}
            icon={createDroneIcon(drone.droneId)}
            zIndexOffset={20000}
          >
            <Popup>
              <div style={{ textAlign: 'center' }}>
                <strong>🚁 Drone {drone.droneId}</strong><br/>
                <small>Status: {drone.status}</small><br/>
                {drone.batchId && (
                  <>
                    <small>Batch: {drone.batchId}</small><br/>
                    <small>Delivery {drone.currentDeliveryInBatch}/{drone.totalDeliveriesInBatch}</small><br/>
                  </>
                )}
                {!drone.batchId && (
                  <>
                    <small>Delivery: #{drone.deliveryId}</small><br/>
                  </>
                )}
                <small>Progress: {drone.progress?.toFixed(0)}%</small>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {/* Debug Overlays */}
      {servicePoints.length === 0 && (
        <div style={{
          position: 'absolute',
          top: '10px',
          right: '10px',
          background: 'rgba(231, 76, 60, 0.9)',
          color: 'white',
          padding: '10px 15px',
          borderRadius: '8px',
          fontSize: '14px',
          fontWeight: 'bold',
          zIndex: 1000,
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
        }}>
          ⚠️ No service points loaded
        </div>
      )}
      
      {Object.keys(deliveryPoints).length === 0 && drones.length > 0 && (
        <div style={{
          position: 'absolute',
          top: '50px',
          right: '10px',
          background: 'rgba(243, 156, 18, 0.9)',
          color: 'white',
          padding: '10px 15px',
          borderRadius: '8px',
          fontSize: '14px',
          fontWeight: 'bold',
          zIndex: 1000,
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
        }}>
          ⚠️ No delivery markers (check backend logs)
        </div>
      )}
    </div>
  );
};

export default DroneMap;