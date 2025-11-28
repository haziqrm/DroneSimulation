import React, { useEffect, useState } from 'react';
import {
  MapContainer,
  TileLayer,
  Marker,
  Polyline,
  Polygon,
  Popup,
  useMapEvents
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './DroneMap.css';

import { FiBox } from "react-icons/fi";
import { MdMedicalServices } from "react-icons/md";
import { renderToStaticMarkup } from "react-dom/server";

const iconToDivIcon = (icon, size = 40, bg = "#ffffff", color = "#000000", innerPct = 60) => {
  let svgString = renderToStaticMarkup(icon);

  svgString = svgString.replace(
    /<svg([^>]*)>/,
    (match, attrs) => {
      if (/style=/.test(attrs)) {
        return `<svg${attrs.replace(/style=(["'])(.*?)\1/, (m, q, cur) => {
          const extra = 'display:block;width:100%;height:100%;';
          if (cur.includes('display:block') || cur.includes('height:100%')) {
            return `style=${q}${cur}${q}`;
          }
          return `style=${q}${extra}${cur}${q}`;
        })}>`;
      } else {
        return `<svg${attrs} style="display:block;width:100%;height:100%;">`;
      }
    }
  );

  const html = `
    <div style="
      background: ${bg};
      width: ${size}px;
      height: ${size}px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      line-height: 0;
      overflow: hidden;
    ">
      <div style="
        width: ${innerPct}%;
        height: ${innerPct}%;
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        ${svgString}
      </div>
    </div>
  `;

  const rounded = Math.round(size / 2);
  return L.divIcon({
    html,
    className: "",
    iconSize: [size, size],
    iconAnchor: [rounded, rounded]
  });
};

const MapClickHandler = ({ isPinMode, onMapClick }) => {
  useMapEvents({
    click: (e) => {
      if (isPinMode && onMapClick) {
        onMapClick(e.latlng.lat, e.latlng.lng);
      }
    }
  });
  return null;
};

const DroneMap = ({ drones, isPinMode = false, onMapClick }) => {
  const [restrictedAreas, setRestrictedAreas] = useState([]);
  const [servicePoints, setServicePoints] = useState([]);
  const [flightPaths, setFlightPaths] = useState({});
  const [deliveryMarkers, setDeliveryMarkers] = useState({});
  const [completedPaths, setCompletedPaths] = useState({});
  const [storedDestinations, setStoredDestinations] = useState({});

  const center = [55.9445, -3.1892];

  useEffect(() => {
    fetch("http://localhost:8080/api/v1/map/restricted-areas")
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setRestrictedAreas)
      .catch(console.error);
  }, []);

  useEffect(() => {
    fetch("http://localhost:8080/api/v1/map/service-points")
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setServicePoints)
      .catch(console.error);
  }, []);

  useEffect(() => {
    drones.forEach(drone => {
      if (drone.route && !flightPaths[drone.droneId]) {
        setFlightPaths(prev => ({ ...prev, [drone.droneId]: drone.route }));
      }

      if (drone.allDeliveryDestinations && !storedDestinations[drone.droneId]) {
        setStoredDestinations(prev => ({
          ...prev,
          [drone.droneId]: drone.allDeliveryDestinations
        }));
      }

      const destinations = storedDestinations[drone.droneId];
      if (destinations) {
        const markers = destinations.map((dest, idx) => {
          const isCompleted = 
            idx < (drone.currentDeliveryInBatch || 0) || 
            drone.status === 'COMPLETED' ||
            drone.status === 'RETURNING';
          
          return {
            position: [dest[0], dest[1]],
            index: idx,
            total: destinations.length,
            completed: isCompleted,
            droneId: drone.droneId
          };
        });

        setDeliveryMarkers(prev => ({
          ...prev,
          [drone.droneId]: markers
        }));
      }
    });

    const activeIds = new Set(drones.map(d => d.droneId));
    Object.keys(flightPaths).forEach(id => {
      if (!activeIds.has(id)) {
        setCompletedPaths(prev => ({ ...prev, [id]: flightPaths[id] }));
        
        setTimeout(() => {
          setCompletedPaths(prev => {
            const copy = { ...prev };
            delete copy[id];
            return copy;
          });
          setFlightPaths(prev => {
            const copy = { ...prev };
            delete copy[id];
            return copy;
          });
          setDeliveryMarkers(prev => {
            const copy = { ...prev };
            delete copy[id];
            return copy;
          });
          setStoredDestinations(prev => {
            const copy = { ...prev };
            delete copy[id];
            return copy;
          });
        }, 3000);
      }
    });
  }, [drones, storedDestinations, flightPaths]);

  const createDroneIcon = (droneId) => {
    const size = 32;
    const html = `
      <div style="
        background: white;
        color: black;
        width: ${size}px;
        height: ${size}px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        font-weight: bold;
        font-size: 14px;
        line-height: 1;
      ">
        ${droneId}
      </div>
    `;
    return L.divIcon({
      html,
      className: "",
      iconSize: [size, size],
      iconAnchor: [Math.round(size / 2), Math.round(size / 2)]
    });
  };

  const createDeliveryIcon = (completed, orderNumber) => {
    const size = 44;
    const bgColor = completed ? "#1ec46b" : "#ffb700";
    
    const html = `
      <div style="position: relative; width: ${size}px; height: ${size}px;">
        <!-- Main delivery icon -->
        <div style="
          background: ${bgColor};
          width: ${size}px;
          height: ${size}px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        ">
          <svg 
            viewBox="0 0 24 24" 
            width="28" 
            height="28" 
            stroke="white" 
            stroke-width="2" 
            fill="none" 
            stroke-linecap="round" 
            stroke-linejoin="round"
          >
            <line x1="16.5" y1="9.4" x2="7.5" y2="4.21"></line>
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
            <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
            <line x1="12" y1="22.08" x2="12" y2="12"></line>
          </svg>
        </div>

        <div style="
          position: absolute;
          top: -4px;
          right: -4px;
          background: #212121;
          color: white;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: bold;
          font-size: 11px;
          box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        ">
          ${orderNumber}
        </div>
      </div>
    `;
    
    return L.divIcon({
      html,
      className: "",
      iconSize: [size, size],
      iconAnchor: [Math.round(size / 2), Math.round(size / 2)]
    });
  };

  const createServicePointIcon = () =>
    iconToDivIcon(<MdMedicalServices size={34} />, 48, "#ffffff", "black", 62);

  return (
    <div style={{ height: "100%", width: "100%", position: "relative" }}>
      <MapContainer
        center={center}
        zoom={14}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution="&copy; Stadia Maps"
          url="https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png"
        />

        <MapClickHandler isPinMode={isPinMode} onMapClick={onMapClick} />

        {restrictedAreas.map((area, idx) => (
          <Polygon
            key={idx}
            positions={(area.vertices || []).map(v => [v.lat, v.lng])}
            pathOptions={{
              color: "#e74c3c",
              fillColor: "#b45249",
              fillOpacity: 0.35
            }}
          >
            <Popup>
              <div style={{ textAlign: 'center' }}>
                <strong>Restricted Area</strong><br />
                {area.name || `Zone ${idx + 1}`}
              </div>
            </Popup>
          </Polygon>
        ))}

        {servicePoints.map((p, i) => {
          if (!p?.location) return null;
          return (
            <Marker
              key={i}
              position={[p.location.lat, p.location.lng]}
              icon={createServicePointIcon()}
              zIndexOffset={10000}
            >
              <Popup>
                <div style={{ textAlign: 'center' }}>
                  <strong>{p.name}</strong><br />
                  <small>Service Point #{p.id}</small><br />
                  <small>{p.location.lat.toFixed(4)}, {p.location.lng.toFixed(4)}</small>
                </div>
              </Popup>
            </Marker>
          );
        })}

        {Object.values(deliveryMarkers).flat().map((m, i) => (
          <Marker
            key={`delivery-${m.droneId}-${m.index}`}
            position={m.position}
            icon={createDeliveryIcon(m.completed, m.index + 1)}
            zIndexOffset={5000}
          >
            <Popup>
              <div style={{ textAlign: 'center' }}>
                <strong>{m.completed ? 'Delivered' : 'Delivery Point'}</strong><br />
                <small>Stop {m.index + 1} of {m.total}</small><br />
                <small>{m.position[0].toFixed(4)}, {m.position[1].toFixed(4)}</small>
              </div>
            </Popup>
          </Marker>
        ))}

        {Object.entries(flightPaths).map(([droneId, path]) => (
          <Polyline
            key={droneId}
            positions={path}
            pathOptions={{
              color: "#ffffff",
              weight: 2,
              dashArray: "8,4"
            }}
          />
        ))}

        {Object.entries(completedPaths).map(([droneId, path]) => (
          <Polyline
            key={`completed-${droneId}`}
            positions={path}
            pathOptions={{
              color: "#95a5a6",
              weight: 2,
              opacity: 0.35,
              dashArray: "8,4"
            }}
          />
        ))}

        {drones.map(drone => (
          <Marker
            key={drone.droneId}
            position={[drone.latitude, drone.longitude]}
            icon={createDroneIcon(drone.droneId)}
            zIndexOffset={20000}
          >
            <Popup>
              <div style={{ textAlign: 'center' }}>
                <strong>Drone {drone.droneId}</strong><br />
                <small>Status: {drone.status}</small><br />
                {drone.batchId ? (
                  <>
                    <small>Batch: {drone.batchId}</small><br />
                    <small>Delivery {drone.currentDeliveryInBatch}/{drone.totalDeliveriesInBatch}</small><br />
                  </>
                ) : (
                  <small>Delivery: #{drone.deliveryId}</small>
                )}
                <br />
                <small>Progress: {drone.progress?.toFixed(0)}%</small>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
};

export default DroneMap;