import { useEffect, useState, useRef, useCallback } from 'react';
import SockJS from 'sockjs-client';
import { Client } from '@stomp/stompjs';

export function useWebSocket(onDroneUpdate, onSystemState, onDeliveryStatus) {
  const [connected, setConnected] = useState(false);
  const clientRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const heartbeatIntervalRef = useRef(null);
  const connectionAttempts = useRef(0);

  const connect = useCallback(() => {
    // Clear any existing reconnect timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    // Don't attempt if already connected
    if (clientRef.current && clientRef.current.connected) {
      console.log('🔌 Already connected, skipping connection attempt');
      return;
    }

    console.log('🔌 Attempting WebSocket connection...');
    connectionAttempts.current++;
    
    const socket = new SockJS('http://localhost:8080/ws');
    const stompClient = new Client({
      webSocketFactory: () => socket,
      
      // Connection configuration
      reconnectDelay: 5000,
      heartbeatIncoming: 10000,
      heartbeatOutgoing: 10000,
      
      debug: (str) => {
        // Only log important messages
        if (str.includes('ERROR') || str.includes('CONNECTED') || str.includes('DISCONNECTED')) {
          console.log('STOMP:', str);
        }
      },
      
      onConnect: () => {
        console.log('✅ WebSocket connected (attempt #' + connectionAttempts.current + ')');
        setConnected(true);
        connectionAttempts.current = 0; // Reset counter on successful connection

        // Subscribe to drone position updates
        stompClient.subscribe('/topic/drone-updates', (message) => {
          try {
            const update = JSON.parse(message.body);
            console.log('📥 Drone update:', update.droneId, update.status);
            onDroneUpdate(update);
          } catch (error) {
            console.error('❌ Error parsing drone update:', error);
          }
        });

        // Subscribe to system state updates
        stompClient.subscribe('/topic/system-state', (message) => {
          try {
            const state = JSON.parse(message.body);
            console.log('🖥️ System state:', state);
            onSystemState(state);
          } catch (error) {
            console.error('❌ Error parsing system state:', error);
          }
        });

        // Subscribe to delivery status updates
        stompClient.subscribe('/topic/delivery-status', (message) => {
          try {
            const status = JSON.parse(message.body);
            console.log('📦 Delivery status:', status.deliveryId, status.status);
            onDeliveryStatus(status);
          } catch (error) {
            console.error('❌ Error parsing delivery status:', error);
          }
        });

        // Start heartbeat to keep connection alive
        if (heartbeatIntervalRef.current) {
          clearInterval(heartbeatIntervalRef.current);
        }
        heartbeatIntervalRef.current = setInterval(() => {
          if (stompClient.connected) {
            console.log('💓 Heartbeat - connection alive');
          }
        }, 30000); // Check every 30 seconds
      },

      onDisconnect: () => {
        console.log('❌ WebSocket disconnected');
        setConnected(false);

        // Clear heartbeat
        if (heartbeatIntervalRef.current) {
          clearInterval(heartbeatIntervalRef.current);
          heartbeatIntervalRef.current = null;
        }

        // Schedule reconnection with exponential backoff
        const delay = Math.min(5000 * Math.pow(2, connectionAttempts.current), 30000);
        console.log(`🔄 Scheduling reconnect in ${delay}ms (attempt #${connectionAttempts.current + 1})...`);
        
        reconnectTimeoutRef.current = setTimeout(() => {
          console.log('🔄 Attempting to reconnect...');
          connect();
        }, delay);
      },

      onStompError: (frame) => {
        console.error('❌ STOMP error:', frame.headers['message']);
        setConnected(false);

        // Don't immediately reconnect on error, wait for onDisconnect
      },

      onWebSocketClose: (event) => {
        console.log('🔌 WebSocket closed:', event.code, event.reason);
        // Let onDisconnect handle reconnection
      },

      onWebSocketError: (error) => {
        console.error('❌ WebSocket error:', error);
        // Let onDisconnect handle reconnection
      }
    });

    // Store client reference
    clientRef.current = stompClient;

    // Activate the connection
    try {
      stompClient.activate();
    } catch (error) {
      console.error('❌ Error activating STOMP client:', error);
      setConnected(false);
    }
  }, [onDroneUpdate, onSystemState, onDeliveryStatus]);

  useEffect(() => {
    console.log('🚀 Initializing WebSocket hook');
    connect();

    // Cleanup function
    return () => {
      console.log('🧹 Cleaning up WebSocket connection');
      
      // Clear reconnect timeout
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }

      // Clear heartbeat
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }

      // Deactivate client
      if (clientRef.current) {
        try {
          clientRef.current.deactivate();
        } catch (error) {
          console.error('Error deactivating client:', error);
        }
      }
    };
  }, [connect]);

  return { connected, client: clientRef.current };
}