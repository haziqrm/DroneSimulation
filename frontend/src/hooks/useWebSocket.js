import { useEffect, useState, useRef } from 'react';
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';

export default function useWebSocket() {
  const [drones, setDrones] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const stompClientRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const heartbeatIntervalRef = useRef(null);
  const connectionAttempts = useRef(0);
  const isConnectingRef = useRef(false);
  const statusStableTimeoutRef = useRef(null);
  const droneNumberMapRef = useRef(new Map()); // Track drone ID to number mapping

  useEffect(() => {
    const connect = () => {
      if (isConnectingRef.current || (stompClientRef.current && stompClientRef.current.connected)) {
        console.log('⏭️ Skipping connection attempt - already connected/connecting');
        return;
      }

      isConnectingRef.current = true;
      console.log('🔌 Attempting WebSocket connection...');

      const socket = new SockJS('http://localhost:8080/ws');
      const stompClient = new Client({
        webSocketFactory: () => socket,
        reconnectDelay: 5000,
        heartbeatIncoming: 20000,
        heartbeatOutgoing: 20000,
        debug: (str) => {
          if (!str.includes('PING') && !str.includes('PONG')) {
            console.log('STOMP:', str);
          }
        },
        onConnect: () => {
          console.log('✅ WebSocket connected successfully');
          connectionAttempts.current = 0;
          isConnectingRef.current = false;
          
          clearTimeout(statusStableTimeoutRef.current);
          statusStableTimeoutRef.current = setTimeout(() => {
            setIsConnected(true);
          }, 500);

          // Subscribe to drone updates
          stompClient.subscribe('/topic/drone-updates', (message) => {
            try {
              const droneUpdate = JSON.parse(message.body);
              console.log('🚁 Drone update:', droneUpdate);
              
              setDrones(prevDrones => {
                // Get or assign drone number
                if (!droneNumberMapRef.current.has(droneUpdate.droneId)) {
                  const nextNumber = droneNumberMapRef.current.size + 1;
                  droneNumberMapRef.current.set(droneUpdate.droneId, nextNumber);
                }
                const droneNumber = droneNumberMapRef.current.get(droneUpdate.droneId);

                // Remove completed drones after a delay
                if (droneUpdate.status === 'COMPLETED') {
                  console.log('✅ Drone', droneUpdate.droneId, 'completed, will remove in 3 seconds');
                  setTimeout(() => {
                    setDrones(prev => prev.filter(d => d.droneId !== droneUpdate.droneId));
                  }, 3000);
                  return prevDrones;
                }

                // Update or add drone
                const existingIndex = prevDrones.findIndex(d => d.droneId === droneUpdate.droneId);
                
                const updatedDrone = {
                  droneId: droneUpdate.droneId,
                  droneNumber: droneNumber,
                  deliveryId: droneUpdate.deliveryId,
                  customerName: droneUpdate.batchId ? 
                    `${droneUpdate.batchId} (${droneUpdate.currentDeliveryInBatch || 1}/${droneUpdate.totalDeliveriesInBatch || 1})` :
                    `Delivery #${droneUpdate.deliveryId}`,
                  status: droneUpdate.status,
                  latitude: droneUpdate.latitude,
                  longitude: droneUpdate.longitude,
                  progress: (droneUpdate.progress || 0) * 100,
                  battery: 100 - ((droneUpdate.progress || 0) * 100),
                  deliveryLatitude: droneUpdate.latitude,
                  deliveryLongitude: droneUpdate.longitude,
                  route: null,
                  // Batch tracking
                  batchId: droneUpdate.batchId,
                  currentDeliveryInBatch: droneUpdate.currentDeliveryInBatch,
                  totalDeliveriesInBatch: droneUpdate.totalDeliveriesInBatch
                };

                if (existingIndex >= 0) {
                  const newDrones = [...prevDrones];
                  newDrones[existingIndex] = updatedDrone;
                  return newDrones;
                } else {
                  return [...prevDrones, updatedDrone];
                }
              });
            } catch (error) {
              console.error('❌ Error parsing drone update:', error);
            }
          });

          // Start heartbeat
          if (heartbeatIntervalRef.current) {
            clearInterval(heartbeatIntervalRef.current);
          }
          heartbeatIntervalRef.current = setInterval(() => {
            if (stompClient.connected) {
              console.log('💓 Connection alive');
            } else {
              console.warn('⚠️ Connection lost');
              clearInterval(heartbeatIntervalRef.current);
            }
          }, 30000);
        },
        onDisconnect: () => {
          console.log('📴 WebSocket disconnected');
          isConnectingRef.current = false;
          clearTimeout(statusStableTimeoutRef.current);
          setIsConnected(false);
          
          if (heartbeatIntervalRef.current) {
            clearInterval(heartbeatIntervalRef.current);
          }
        },
        onStompError: (frame) => {
          console.error('❌ STOMP error:', frame);
          isConnectingRef.current = false;
          clearTimeout(statusStableTimeoutRef.current);
          setIsConnected(false);
        },
        onWebSocketError: (error) => {
          console.error('❌ WebSocket error:', error);
          isConnectingRef.current = false;
          clearTimeout(statusStableTimeoutRef.current);
          setIsConnected(false);
          
          if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
          }
          
          const delay = Math.min(5000 * Math.pow(2, connectionAttempts.current), 30000);
          console.log(`🔄 Scheduling reconnect in ${delay}ms (attempt ${connectionAttempts.current + 1})`);
          connectionAttempts.current++;
          
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, delay);
        }
      });

      stompClientRef.current = stompClient;
      stompClient.activate();
    };

    connect();

    return () => {
      console.log('🧹 Cleaning up WebSocket connection');
      
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
      
      if (statusStableTimeoutRef.current) {
        clearTimeout(statusStableTimeoutRef.current);
      }
      
      if (stompClientRef.current) {
        stompClientRef.current.deactivate();
      }
      
      isConnectingRef.current = false;
    };
  }, []);

  return { drones, isConnected };
}