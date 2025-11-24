import React, { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import L from 'leaflet';
import SockJS from 'sockjs-client';
import { Stomp } from '@stomp/stompjs';
import 'leaflet/dist/leaflet.css';
import './DroneMap.css';

// Fix Leaflet default icon issue
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Custom drone icon
const createDroneIcon = (color) => {
  return L.divIcon({
    className: 'custom-drone-icon',
    html: `
      <div style="
        background: ${color};
        width: 32px;
        height: 32px;
        border-radius: 50%;
        border: 3px solid white;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 16px;
      ">
        🚁
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
};

const DroneMap = ({ selectedDroneId }) => {
  const [activeDrones, setActiveDrones] = useState({});
  const [droneColors] = useState({});
  const stompClientRef = useRef(null);
  const mapRef = useRef(null);
  
  // Edinburgh coordinates
  const edinburghCenter = [55.9445, -3.1892];
  const defaultZoom = 13;

  // Generate consistent color for each drone
  const getDroneColor = (droneId) => {
    if (!droneColors[droneId]) {
      const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
      droneColors[droneId] = colors[Object.keys(droneColors).length % colors.length];
    }
    return droneColors[droneId];
  };

  useEffect(() => {
    console.log('🔌 Connecting to STOMP WebSocket...');
    
    // Create SockJS connection
    const socket = new SockJS('http://localhost:8080/ws');
    const stompClient = Stomp.over(socket);
    stompClientRef.current = stompClient;

    // Connect to WebSocket
    stompClient.connect({}, 
      (frame) => {
        console.log('✅ STOMP Connected:', frame);
        
        // Subscribe to drone updates
        stompClient.subscribe('/topic/drones', (message) => {
          try {
            const data = JSON.parse(message.body);
            console.log('📥 Drone update received:', data);
            
            if (data.type === 'DRONE_POSITION_UPDATE') {
              setActiveDrones(prev => {
                const updated = {
                  ...prev,
                  [data.droneId]: {
                    ...prev[data.droneId],
                    droneId: data.droneId,
                    currentPosition: data.position,
                    progress: data.progress,
                    status: data.status,
                    delivery: data.delivery,
                    flightPath: data.flightPath || prev[data.droneId]?.flightPath || []
                  }
                };
                console.log('📊 Updated drones:', Object.keys(updated).length);
                return updated;
              });
            } else if (data.type === 'DRONE_MISSION_COMPLETE') {
              console.log('✅ Mission completed:', data.droneId);
              setTimeout(() => {
                setActiveDrones(prev => {
                  const updated = { ...prev };
                  delete updated[data.droneId];
                  return updated;
                });
              }, 3000);
            }
          } catch (error) {
            console.error('❌ Error processing drone update:', error);
          }
        });

        // Subscribe to delivery status (optional)
        stompClient.subscribe('/topic/deliveries', (message) => {
          console.log('📦 Delivery status:', message.body);
        });

        // Subscribe to system state (optional)
        stompClient.subscribe('/topic/system', (message) => {
          console.log('🖥️ System state:', message.body);
        });
      },
      (error) => {
        console.error('❌ STOMP connection error:', error);
      }
    );

    // Cleanup on unmount
    return () => {
      console.log('🧹 Disconnecting STOMP...');
      if (stompClient.connected) {
        stompClient.disconnect();
      }
    };
  }, []);

  // Debug: Log active drones
  useEffect(() => {
    console.log('🗺️ DroneMap: Active drones updated:', Object.keys(activeDrones).length);
    Object.entries(activeDrones).forEach(([id, drone]) => {
      console.log(`  Drone ${id}:`, {
        position: drone.currentPosition,
        delivery: drone.delivery?.orderId,
        pathLength: drone.flightPath?.length || 0
      });
    });
  }, [activeDrones]);

  return (
    <div className="drone-map">
      <MapContainer
        center={edinburghCenter}
        zoom={defaultZoom}
        style={{ height: '100%', width: '100%' }}
        ref={mapRef}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Render each active drone */}
        {Object.entries(activeDrones).map(([droneId, droneData]) => {
          const color = getDroneColor(droneId);
          const isSelected = droneId === selectedDroneId;
          
          // Current position
          const position = droneData.currentPosition;
          if (!position || !position.latitude || !position.longitude) {
            console.warn(`Drone ${droneId} has invalid position:`, position);
            return null;
          }

          return (
            <React.Fragment key={droneId}>
              {/* Drone marker */}
              <Marker
                position={[position.latitude, position.longitude]}
                icon={createDroneIcon(isSelected ? '#ef4444' : color)}
              >
                <Popup>
                  <div style={{ minWidth: '200px' }}>
                    <h4 style={{ margin: '0 0 8px 0', fontWeight: 600 }}>
                      🚁 {droneId}
                    </h4>
                    <div style={{ fontSize: '13px', lineHeight: '1.6' }}>
                      <div><strong>Position:</strong></div>
                      <div style={{ fontFamily: 'monospace', fontSize: '11px', marginBottom: '8px' }}>
                        {position.latitude.toFixed(6)}, {position.longitude.toFixed(6)}
                      </div>
                      
                      {droneData.delivery && (
                        <>
                          <div><strong>Delivery:</strong> {droneData.delivery.orderId}</div>
                          <div><strong>To:</strong> {droneData.delivery.destination?.name || 'Unknown'}</div>
                          <div><strong>Progress:</strong> {droneData.progress || 0}%</div>
                        </>
                      )}
                      
                      {droneData.status && (
                        <div style={{ 
                          marginTop: '8px', 
                          padding: '4px 8px', 
                          background: '#f0f4ff',
                          borderRadius: '4px',
                          fontSize: '12px'
                        }}>
                          {droneData.status}
                        </div>
                      )}
                    </div>
                  </div>
                </Popup>
              </Marker>

              {/* Flight path */}
              {droneData.flightPath && droneData.flightPath.length > 1 && (
                <Polyline
                  positions={droneData.flightPath.map(pos => [pos.latitude, pos.longitude])}
                  color={isSelected ? '#ef4444' : color}
                  weight={3}
                  opacity={0.7}
                  dashArray={isSelected ? '10, 5' : undefined}
                />
              )}

              {/* Destination marker (if delivery exists) */}
              {droneData.delivery && droneData.delivery.destination && (
                <Marker
                  position={[
                    droneData.delivery.destination.latitude,
                    droneData.delivery.destination.longitude
                  ]}
                  icon={L.divIcon({
                    className: 'destination-marker',
                    html: `
                      <div style="
                        background: ${color};
                        width: 24px;
                        height: 24px;
                        border-radius: 50%;
                        border: 2px solid white;
                        box-shadow: 0 2px 6px rgba(0,0,0,0.3);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 12px;
                      ">
                        📍
                      </div>
                    `,
                    iconSize: [24, 24],
                    iconAnchor: [12, 12],
                  })}
                >
                  <Popup>
                    <div>
                      <h4 style={{ margin: '0 0 4px 0' }}>Destination</h4>
                      <div>{droneData.delivery.destination.name}</div>
                    </div>
                  </Popup>
                </Marker>
              )}
            </React.Fragment>
          );
        })}
      </MapContainer>

      {/* Debug overlay */}
      {Object.keys(activeDrones).length === 0 && (
        <div className="map-overlay">
          <div className="map-message">
            <div className="map-icon">🗺️</div>
            <h3>No Active Drones</h3>
            <p>Dispatch a delivery to see drones on the map</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default DroneMap;