type SocketStatus = "connecting" | "open" | "closed" | "error";

type SocketMessageHandler = (data: unknown) => void;

type SocketStatusHandler = (status: SocketStatus) => void;

type PendingPayload = { kind: "json"; data: string } | { kind: "binary"; data: Blob };

const MAX_QUEUE = 48;

class AvatarSocketManager {
  private socket: WebSocket | null = null;
  private url: string | null = null;
  private status: SocketStatus = "closed";
  private statusHandlers = new Set<SocketStatusHandler>();
  private messageHandlers = new Set<SocketMessageHandler>();
  private reconnectTimer: number | null = null;
  private reconnectAttempt = 0;
  private queue: PendingPayload[] = [];
  private usageCount = 0;
  private heartbeatTimer: number | null = null;

  acquire(url: string) {
    this.usageCount += 1;
    this.connect(url);
    return () => this.release();
  }

  private release() {
    this.usageCount = Math.max(0, this.usageCount - 1);
    if (this.usageCount === 0) {
      this.disconnect();
    }
  }

  connect(url: string) {
    if (this.socket && this.url === url) {
      return;
    }
    this.url = url;
    this.reconnectAttempt = 0;
    this.openSocket();
  }

  disconnect() {
    if (this.reconnectTimer) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.heartbeatTimer) {
      window.clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.setStatus("closed");
  }

  onStatus(handler: SocketStatusHandler) {
    this.statusHandlers.add(handler);
    handler(this.status);
    return () => this.statusHandlers.delete(handler);
  }

  onMessage(handler: SocketMessageHandler) {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  getStatus() {
    return this.status;
  }

  sendJson(payload: Record<string, unknown>) {
    const data = JSON.stringify(payload);
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      this.enqueue({ kind: "json", data });
      return false;
    }
    this.socket.send(data);
    return true;
  }

  sendBinary(payload: Blob) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      this.enqueue({ kind: "binary", data: payload });
      return false;
    }
    this.socket.send(payload);
    return true;
  }

  sendBinaryIfOpen(payload: Blob) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return false;
    }
    this.socket.send(payload);
    return true;
  }

  private enqueue(payload: PendingPayload) {
    this.queue = [...this.queue, payload].slice(-MAX_QUEUE);
  }

  private flushQueue() {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }
    this.queue.forEach((payload) => {
      if (payload.kind === "json") {
        this.socket?.send(payload.data);
      } else {
        this.socket?.send(payload.data);
      }
    });
    this.queue = [];
  }

  private openSocket() {
    if (!this.url) {
      return;
    }
    this.setStatus("connecting");
    const socket = new WebSocket(this.url);
    this.socket = socket;

    socket.onopen = () => {
      this.reconnectAttempt = 0;
      this.setStatus("open");
      this.flushQueue();
      this.startHeartbeat();
    };

    socket.onclose = () => {
      this.setStatus("closed");
      this.stopHeartbeat();
      this.scheduleReconnect();
    };

    socket.onerror = () => {
      this.setStatus("error");
      this.stopHeartbeat();
      socket.close();
    };

    socket.onmessage = (event) => {
      this.messageHandlers.forEach((handler) => handler(event.data));
    };
  }

  private scheduleReconnect() {
    if (!this.url) {
      return;
    }
    if (this.reconnectTimer) {
      return;
    }
    const delay = Math.min(8000, 600 + this.reconnectAttempt * 800);
    this.reconnectAttempt += 1;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      if (this.usageCount > 0) {
        this.openSocket();
      }
    }, delay);
  }

  private startHeartbeat() {
    if (this.heartbeatTimer) {
      window.clearInterval(this.heartbeatTimer);
    }
    this.heartbeatTimer = window.setInterval(() => {
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
        return;
      }
      this.socket.send(JSON.stringify({ type: "ping" }));
    }, 15000);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      window.clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private setStatus(status: SocketStatus) {
    this.status = status;
    this.statusHandlers.forEach((handler) => handler(status));
  }
}

const manager = new AvatarSocketManager();

export const getSocketManager = () => manager;
export type { SocketStatus };
