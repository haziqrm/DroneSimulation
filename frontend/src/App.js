import React, { useState, useEffect } from 'react';
import './App.css';
import DeliveryForm from './components/DeliveryForm';
import DroneMap from './components/DroneMap';
import DroneList from './components/DroneList';
import ActiveDeliveries from './components/ActiveDeliveries';
import { useWebSocket } from './hooks/useWebSocket';
import { getSystemStatus, getAvailableDrones } from './utils/api';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

function App() {
  const [activeDrones, setActiveDrones] = useState([]);
  const [activeDeliveries, setActiveDeliveries] = useState([]);
  const [selectedDroneId, setSelectedDroneId] = useState(null);
  const [availableDronesCount, setAvailableDronesCount] = useState(0);

  // WebSocket callbacks
  const onDroneUpdate = (update) => {
    console.log('Drone update received:', update);
    
    setActiveDrones(prev => {
      const existing = prev.find(d => d.droneId === update.droneId);
      if (existing) {
        return prev.map(d => d.droneId === update.droneId ? update : d);
      }
      return [...prev, update];
    });

    setActiveDeliveries(prev => {
      const existing = prev.find(d => d.deliveryId === update.deliveryId);
      if (existing) {
        return prev.map(d => d.deliveryId === update.deliveryId ? update : d);
      }
      return [...prev, update];
    });
  };

  const onSystemState = (state) => {
    console.log('System state update:', state);
    setAvailableDronesCount(state.availableDrones || 0);
  };

  const onDeliveryStatus = (status) => {
    console.log('Delivery status update:', status);
    
    if (status.status === 'COMPLETED') {
      toast.success(`✅ Delivery ${status.deliveryId} completed!`, {
        position: "top-right",
        autoClose: 5000
      });
      setActiveDrones(prev => prev.filter(d => d.deliveryId !== status.deliveryId));
      setActiveDeliveries(prev => prev.filter(d => d.deliveryId !== status.deliveryId));
      
      // Refresh available count
      fetchAvailableDrones();
    } else if (status.status === 'FAILED') {
      toast.error(`❌ Delivery ${status.deliveryId} failed: ${status.message}`, {
        position: "top-right",
        autoClose: 5000
      });
    }
  };

  // Connect to WebSocket
  const { connected } = useWebSocket(onDroneUpdate, onSystemState, onDeliveryStatus);

  // Fetch available drones count
  const fetchAvailableDrones = async () => {
    try {
      const drones = await getAvailableDrones();
      console.log('Available drones fetched:', drones.length);
      setAvailableDronesCount(drones.length);
    } catch (error) {
      console.error('Error fetching available drones:', error);
    }
  };

  // Fetch initial data on mount
  useEffect(() => {
    console.log('App mounted - fetching initial data...');
    fetchAvailableDrones();
    
    // Log system status for debugging (don't use availableDrones from it)
    getSystemStatus()
      .then(status => {
        console.log('Initial system status:', status);
        // Don't set availableDronesCount here - systemStatus doesn't return that field!
      })
      .catch(error => {
        console.error('Error fetching system status:', error);
      });
  }, []);

  // Poll available drones every 5 seconds
  useEffect(() => {
    const interval = setInterval(fetchAvailableDrones, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleDeliverySubmitted = (result) => {
    console.log('Delivery submitted:', result);
    // Refresh available count immediately
    fetchAvailableDrones();
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>🚁 Drone Dispatch System</h1>
        <div className="connection-status">
          <span className={`status-indicator ${connected ? 'connected' : 'disconnected'}`}></span>
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
            drones={activeDrones}
            selectedDroneId={selectedDroneId}
            onDroneSelect={setSelectedDroneId}
          />
          <ActiveDeliveries 
            deliveries={activeDeliveries}
          />
        </aside>
      </div>

      <ToastContainer />
    </div>
  );
}

export default App;