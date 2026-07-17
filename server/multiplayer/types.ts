import type { WebSocket } from 'ws';

export interface OnlinePeer {
  id: string;
  name: string;
  socket: WebSocket;
  roomCode: string | null;
}
