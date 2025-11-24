import { useEffect, useState, useRef } from 'react';
import SockJS from 'sockjs-client';
import { Client } from '@stomp/stompjs';

export function useWebSocket({ onDroneUpdate, onSystemUpdate }) {
  const [connected, setConnected] = useState(false);
  const clientRef = useRef(null);

  useEffect(() => {
    const socket = new SockJS('http://localhost:8080/ws');
    const stompClient = new Client({
      webSocketFactory: () => socket,
      debug: (str) => {
        console.log('STOMP:', str);
      },
      
      onConnect: () => {
        console.log('WebSocket connected');
        setConnected(true);

        stompClient.subscribe('/topic/drones', (message) => {
          const dronePositions = JSON.parse(message.body);
          onDroneUpdate(dronePositions);
        });

        stompClient.subscribe('/topic/system', (message) => {
          const systemState = JSON.parse(message.body);
          onSystemUpdate(systemState);
        });
      },

      onDisconnect: () => {
        console.log('WebSocket disconnected');
        setConnected(false);
      },

      onStompError: (frame) => {
        console.error('STOMP error:', frame);
      }
    });

    stompClient.activate();
    clientRef.current = stompClient;

    return () => {
      if (clientRef.current) {
        clientRef.current.deactivate();
      }
    };
  }, [onDroneUpdate, onSystemUpdate]);

  return { connected, client: clientRef.current };
}