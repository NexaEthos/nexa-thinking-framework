import { useState, useEffect, useCallback, useRef } from "react";
import { WebSocketMessage } from "../types";
import { getWsUrl, IS_TAURI } from "./api/config";

type MessageCallback = (message: WebSocketMessage) => void;

class WebSocketService {
  private ws: WebSocket | null = null;
  private messageCallbacks: Set<MessageCallback> = new Set();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = IS_TAURI ? 15 : 5;
  private reconnectDelay = IS_TAURI ? 500 : 1000;
  private intentionalClose = false;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private initialDelayDone = false;

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) {
      return;
    }

    if (IS_TAURI && !this.initialDelayDone) {
      this.initialDelayDone = true;
      setTimeout(() => this.connect(), 2000);
      return;
    }

    this.intentionalClose = false;
    const wsUrl = getWsUrl();

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.notifyCallbacks({ type: "connection_status", data: { connected: true } });
      };

      this.ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          this.notifyCallbacks(message);
        } catch (error) {
          console.error("Failed to parse WebSocket message:", error);
        }
      };

      this.ws.onerror = (error) => {
        if (!this.intentionalClose && this.reconnectAttempts > 3) {
          console.error("WebSocket error:", error);
        }
      };

      this.ws.onclose = () => {
        this.notifyCallbacks({ type: "connection_status", data: { connected: false } });
        if (!this.intentionalClose) {
          this.reconnect();
        }
      };
    } catch (error) {
      console.error("Failed to create WebSocket connection:", error);
      if (!this.intentionalClose) {
        this.reconnect();
      }
    }
  }

  disconnect(): void {
    this.intentionalClose = true;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.ws) {
      // Only close if the connection is open or connecting
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        try {
          this.ws.close();
        } catch {
          // Ignore close errors during cleanup
        }
      }
      this.ws = null;
    }
    this.reconnectAttempts = 0;
  }

  subscribe(callback: MessageCallback): () => void {
    this.messageCallbacks.add(callback);
    if (this.messageCallbacks.size === 1) {
      this.connect();
    }
    return () => {
      this.messageCallbacks.delete(callback);
      if (this.messageCallbacks.size === 0) {
        this.disconnect();
      }
    };
  }

  private notifyCallbacks(message: WebSocketMessage): void {
    this.messageCallbacks.forEach((callback) => callback(message));
  }

  private reconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error("Max reconnection attempts reached");
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * this.reconnectAttempts;

    this.reconnectTimeout = setTimeout(() => {
      this.connect();
    }, delay);
  }
}

export const wsService = new WebSocketService();

export function useWebSocket(onMessage?: (message: WebSocketMessage) => void) {
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const onMessageRef = useRef(onMessage);

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    const unsubscribe = wsService.subscribe((message) => {
      if (message.type === "connection_status") {
        setIsConnected(message.data.connected);
      }
      setLastMessage(message);
      if (onMessageRef.current) {
        onMessageRef.current(message);
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const sendMessage = useCallback((message: WebSocketMessage) => {
    console.warn("sendMessage not implemented for this websocket service", message);
  }, []);

  return { lastMessage, isConnected, sendMessage };
}
