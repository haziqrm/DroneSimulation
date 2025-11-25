import { useEffect, useState, useRef } from 'react';
import SockJS from 'sockjs-client';
import { Client } from '@stomp/stompjs';

export function useWebSocket(onDroneUpdate, onSystemState, onDeliveryStatus) {
  const [connected, setConnected] = useState(false);
  const clientRef = useRef(null);

  useEffect(() => {
    console.log('🔌 Initializing WebSocket connection...');
    
    const socket = new SockJS('http://localhost:8080/ws');
    const stompClient = new Client({
      webSocketFactory: () => socket,
      debug: (str) => {
        // Uncomment for detailed STOMP debugging
        // console.log('STOMP:', str);
      },
      
      onConnect: () => {
        console.log('✅ WebSocket connected');
        setConnected(true);

        // Subscribe to drone position updates
        stompClient.subscribe('/topic/drone-updates', (message) => {
          try {
            const update = JSON.parse(message.body);
            console.log('📥 Drone update received:', update);
            onDroneUpdate(update);
          } catch (error) {
            console.error('Error parsing drone update:', error);
          }
        });

        // Subscribe to system state updates
        stompClient.subscribe('/topic/system-state', (message) => {
          try {
            const state = JSON.parse(message.body);
            console.log('🖥️ System state received:', state);
            onSystemState(state);
          } catch (error) {
            console.error('Error parsing system state:', error);
          }
        });

        // Subscribe to delivery status updates
        stompClient.subscribe('/topic/delivery-status', (message) => {
          try {
            const status = JSON.parse(message.body);
            console.log('📦 Delivery status received:', status);
            onDeliveryStatus(status);
          } catch (error) {
            console.error('Error parsing delivery status:', error);
          }
        });
      },

      onDisconnect: () => {
        console.log('❌ WebSocket disconnected');
        setConnected(false);
      },

      onStompError: (frame) => {
        console.error('❌ STOMP error:', frame);
        setConnected(false);
      }
    });

    stompClient.activate();
    clientRef.current = stompClient;

    return () => {
      console.log('🧹 Cleaning up WebSocket connection');
      if (clientRef.current) {
        clientRef.current.deactivate();
      }
    };
  }, [onDroneUpdate, onSystemState, onDeliveryStatus]);

  return { connected, client: clientRef.current };
}