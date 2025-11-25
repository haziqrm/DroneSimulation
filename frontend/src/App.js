import React, { useState, useEffect } from 'react';
import './App.css';
import DeliveryForm from './components/DeliveryForm';
import DroneMap from './components/DroneMap';
import DroneList from './components/DroneList';
import { useWebSocket } from './hooks/useWebSocket';
import { getAvailableDrones } from './utils/api';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

function App() {
  const [activeDrones, setActiveDrones] = useState({});
  const [selectedDroneId, setSelectedDroneId] = useState(null);
  const [availableDronesCount, setAvailableDronesCount] = useState(0);

  // WebSocket callbacks
  const handleDroneUpdate = (update) => {
    console.log('📥 Drone update:', update);
    
    setActiveDrones(prev => ({
      ...prev,
      [update.droneId]: {
        droneId: update.droneId,
        deliveryId: update.deliveryId,
        currentPosition: {
          latitude: update.latitude,
          longitude: update.longitude
        },
        status: update.status,
        progress: update.progress,
        capacityUsed: update.capacityUsed,
        totalCapacity: update.totalCapacity
      }
    }));
  };

  const handleSystemState = (state) => {
    console.log('🖥️ System state:', state);
    if (state.availableDrones !== undefined) {
      setAvailableDronesCount(state.availableDrones);
    }
  };

  const handleDeliveryStatus = (status) => {
    console.log('📦 Delivery status:', status);
    
    if (status.status === 'COMPLETED') {
      toast.success(`✅ Delivery ${status.deliveryId} completed!`);
      
      // Remove completed drone after delay
      setTimeout(() => {
        setActiveDrones(prev => {
          const updated = { ...prev };
          delete updated[status.droneId];
          return updated;
        });
      }, 3000);
      
      fetchAvailableDrones();
    } else if (status.status === 'FAILED') {
      toast.error(`❌ Delivery ${status.deliveryId} failed: ${status.message}`);
    }
  };

  // Connect to WebSocket
  const { connected } = useWebSocket(
    handleDroneUpdate,
    handleSystemState,
    handleDeliveryStatus
  );

  // Fetch available drones
  const fetchAvailableDrones = async () => {
    try {
      const drones = await getAvailableDrones();
      setAvailableDronesCount(drones.length);
    } catch (error) {
      console.error('Error fetching available drones:', error);
    }
  };

  // Initial fetch
  useEffect(() => {
    fetchAvailableDrones();
    const interval = setInterval(fetchAvailableDrones, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleDeliverySubmitted = () => {
    fetchAvailableDrones();
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>🚁 Drone Dispatch System</h1>
        <div className={`connection-status ${connected ? 'connected' : 'disconnected'}`}>
          <span className="status-indicator"></span>
          <span>{connected ? 'Connected' : 'Disconnected'}</span>
        </div>
      </header>

      <div className="main-container">
        <aside className="sidebar left">
          <DeliveryForm 
            availableDrones={availableDronesCount}
            onDeliverySubmitted={handleDeliverySubmitted}
          />
        </aside>

        <main className="map-container">
          <DroneMap 
            activeDrones={activeDrones}
            selectedDroneId={selectedDroneId}
          />
        </main>

        <aside className="sidebar right">
          <DroneList 
            drones={Object.values(activeDrones)}
            selectedDroneId={selectedDroneId}
            onDroneSelect={setSelectedDroneId}
          />
        </aside>
      </div>

      <ToastContainer position="top-right" autoClose={5000} />
    </div>
  );
}

export default App;