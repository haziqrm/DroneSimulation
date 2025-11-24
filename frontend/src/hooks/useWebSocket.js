import { useEffect, useState, useRef } from 'react';
import SockJS from 'sockjs-client';
import { Client } from '@stomp/stompjs';

export function useWebSocket({ onDroneUpdate, onSystemState, onDeliveryStatus }) {
  const [connected, setConnected] = useState(false);
  const clientRef = useRef(null);

  useEffect(() => {
    const socket = new SockJS('http://localhost:8080/ws');
    const stompClient = new Client({
      webSocketFactory: () => socket,
      debug: (str) => {
        // console.log('STOMP:', str);
      },
      
      onConnect: () => {
        console.log('✅ WebSocket connected');
        setConnected(true);

        // Subscribe to drone position updates
        stompClient.subscribe('/topic/drone-updates', (message) => {
          const update = JSON.parse(message.body);
          onDroneUpdate(update);
        });

        // Subscribe to system state updates
        stompClient.subscribe('/topic/system-state', (message) => {
          const state = JSON.parse(message.body);
          onSystemState(state);
        });

        // Subscribe to delivery status updates
        stompClient.subscribe('/topic/delivery-status', (message) => {
          const status = JSON.parse(message.body);
          onDeliveryStatus(status);
        });
      },

      onDisconnect: () => {
        console.log('❌ WebSocket disconnected');
        setConnected(false);
      },

      onStompError: (frame) => {
        console.error('STOMP error:', frame);
        setConnected(false);
      }
    });

    stompClient.activate();
    clientRef.current = stompClient;

    return () => {
      if (clientRef.current) {
        clientRef.current.deactivate();
      }
    };
  }, [onDroneUpdate, onSystemState, onDeliveryStatus]);

  return { connected, client: clientRef.current };
}