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
          // Only log important messages, not heartbeats
          if (!str.includes('PING') && !str.includes('PONG')) {
            console.log('STOMP:', str);
          }
        },
        onConnect: () => {
          console.log('✅ WebSocket connected successfully');
          connectionAttempts.current = 0;
          isConnectingRef.current = false;
          
          // Set connected status with stability timeout
          clearTimeout(statusStableTimeoutRef.current);
          statusStableTimeoutRef.current = setTimeout(() => {
            setIsConnected(true);
          }, 500); // Wait 500ms before showing connected to avoid flicker

          // Subscribe to drone updates
          stompClient.subscribe('/topic/drones', (message) => {
            try {
              const dronesData = JSON.parse(message.body);
              console.log('📡 Received drone update:', dronesData);
              setDrones(dronesData);
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
          
          // Schedule reconnect with exponential backoff
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

    // Cleanup on unmount
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