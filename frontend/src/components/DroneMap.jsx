import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Polygon, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const DroneMap = ({ drones }) => {
  const [restrictedAreas, setRestrictedAreas] = useState([]);
  const [servicePoints, setServicePoints] = useState([]);
  const [flightPaths, setFlightPaths] = useState({});
  const [deliveryMarkers, setDeliveryMarkers] = useState({});
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

  // Fetch service points from backend (to avoid CORS)
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
  }, []);

  // Update flight paths and delivery markers when drones update
  useEffect(() => {
    console.log('🔄 Drone update - Processing', drones.length, 'drones');
    
    drones.forEach(drone => {
      // Store full route on first update
      if (drone.route && !flightPaths[drone.droneId]) {
        console.log(`📍 Storing route for drone ${drone.droneId}: ${drone.route.length} waypoints`);
        setFlightPaths(prev => ({
          ...prev,
          [drone.droneId]: drone.route
        }));
      }

      // Update delivery markers with completion tracking
      // Update delivery markers with completion tracking
      if (drone.allDeliveryDestinations && drone.allDeliveryDestinations.length > 0) {
        console.log(`🎯 Drone ${drone.droneId} - Status: ${drone.status}, Completed deliveries: ${drone.currentDeliveryInBatch}`);
        
        // Create markers for ALL destinations with proper completion tracking
        const markers = drone.allDeliveryDestinations.map((dest, idx) => {
          // currentDeliveryInBatch tracks how many deliveries have been COMPLETED
          // So if currentDeliveryInBatch = 1, then delivery 0 is complete
          const isCompleted = idx < drone.currentDeliveryInBatch || drone.status === 'COMPLETED';
          
          console.log(`   → Delivery ${idx + 1}: ${isCompleted ? '✅ COMPLETED' : '⏳ PENDING'} (completed count: ${drone.currentDeliveryInBatch})`);
          
          return {
            position: [dest[0], dest[1]],
            deliveryId: drone.deliveryId !== -1 ? drone.deliveryId : `${drone.droneId}-${idx}`,
            droneId: drone.droneId,
            batchId: drone.batchId,
            index: idx,
            total: drone.allDeliveryDestinations.length,
            completed: isCompleted
          };
        });
        
        // ALWAYS update markers to reflect completion status changes
        setDeliveryMarkers(prev => ({
          ...prev,
          [drone.droneId]: markers
        }));
        
        console.log(`✅ Updated ${markers.length} delivery markers for drone ${drone.droneId}`);
      }
    });

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
          setDeliveryMarkers(prev => {
            const updated = { ...prev };
            delete updated[droneId];
            return updated;
          });
        }, 3000);
      }
    });
  }, [drones]);

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

  const createDeliveryIcon = (completed, index, total) => {
    // Simple color change - no animations
    const backgroundColor = completed ? '#27ae60' : '#e74c3c';
    const emoji = '📦';
    const label = total > 1 ? `${index + 1}` : '';
    
    return L.divIcon({
      html: `<div style="
        background: ${backgroundColor};
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
        position: relative;
      ">
        ${emoji}
        ${label ? `<div style="
          position: absolute;
          top: -8px;
          right: -8px;
          background: #2c3e50;
          color: white;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          font-weight: bold;
          border: 2px solid white;
        ">${label}</div>` : ''}
      </div>`,
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
    deliveryMarkers: Object.keys(deliveryMarkers).length,
    restrictedAreas: restrictedAreas.length,
    drones: drones.length
  });

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

        {/* SERVICE POINTS - ALWAYS VISIBLE */}
        {servicePoints.map((point, index) => {
          if (!point || !point.location) {
            return null;
          }

          const lat = point.location.lat;
          const lng = point.location.lng;

          if (typeof lat !== 'number' || typeof lng !== 'number') {
            return null;
          }

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

        {/* DELIVERY DESTINATION MARKERS - ALL DESTINATIONS */}
        {Object.entries(deliveryMarkers).map(([droneId, markers]) => {
          console.log(`📍 Rendering ${markers.length} markers for drone ${droneId}`);
          
          return markers.map((marker, idx) => {
            console.log(`   → Marker ${idx}: completed: ${marker.completed}`);
            
            return (
              <Marker
                key={`delivery-${droneId}-${idx}-${marker.completed ? 'done' : 'pending'}`}
                position={marker.position}
                icon={createDeliveryIcon(marker.completed, marker.index, marker.total)}
                zIndexOffset={5000}
              >
                <Popup>
                  <div style={{ textAlign: 'center' }}>
                    <strong>{marker.completed ? '✅ Delivered' : '📦 Delivery Point'}</strong><br/>
                    {marker.batchId && (
                      <>
                        <small>Batch: {marker.batchId}</small><br/>
                        <small>Stop {marker.index + 1} of {marker.total}</small><br/>
                      </>
                    )}
                    {!marker.batchId && (
                      <>
                        <small>Delivery #{marker.deliveryId}</small><br/>
                      </>
                    )}
                    <small>Drone {marker.droneId}</small><br/>
                    <small>{marker.position[0].toFixed(4)}, {marker.position[1].toFixed(4)}</small>
                  </div>
                </Popup>
              </Marker>
            );
          });
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
      
      {Object.keys(deliveryMarkers).length === 0 && drones.length > 0 && (
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