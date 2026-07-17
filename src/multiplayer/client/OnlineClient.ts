import type { ClientMessage, RoomState, ServerMessage } from '../protocol.ts';
import { unpackWorldTiles } from '../WorldCodec.ts';
import { NetworkTelemetry, type OnlineNetworkStats } from './NetworkTelemetry.ts';

type MessageOf<T extends ServerMessage['type']> = Extract<ServerMessage, { type: T }>;
type Listener = (message: ServerMessage) => void;

export class OnlineClient {
  readonly socket: WebSocket;
  playerId = '';
  lastRoom: RoomState | null = null;
  lastGameStart: Extract<ServerMessage, { type: 'game_start' }> | null = null;
  lastSnapshot: Extract<ServerMessage, { type: 'snapshot' }>['snapshot'] | null = null;
  lastGameOver: Extract<ServerMessage, { type: 'game_over' }> | null = null;
  private listeners = new Set<Listener>();
  private telemetry = new NetworkTelemetry();
  private pingTimer: number | null = null;
  private decodingSnapshot = false;
  private pendingSnapshot: ArrayBuffer | Blob | null = null;
  private lastSnapshotSequence = 0;

  private constructor(socket: WebSocket) {
    this.socket = socket;
    socket.binaryType = 'arraybuffer';
    socket.addEventListener('message', (event) => {
      if (typeof event.data === 'string') {
        const message = parseServerText(event.data);
        if (message) this.dispatch(message);
        return;
      }
      if (!(event.data instanceof ArrayBuffer) && !(event.data instanceof Blob)) return;
      if (this.pendingSnapshot) this.telemetry.recordDroppedSnapshot();
      this.pendingSnapshot = event.data;
      void this.drainSnapshots();
    });
    socket.addEventListener('close', () => this.stopTelemetry());
  }

  static async connect(name: string, url = multiplayerUrl()): Promise<OnlineClient> {
    const socket = new WebSocket(url);
    const client = new OnlineClient(socket);
    const welcomePromise = client.waitFor('welcome');
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error('连接联机服务器超时')), 6000);
      socket.addEventListener('open', () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
      socket.addEventListener('error', () => {
        clearTimeout(timer);
        reject(new Error('无法连接联机服务器'));
      }, { once: true });
    });
    client.startTelemetry();
    client.send({ type: 'hello', name });
    const welcome = await welcomePromise;
    client.playerId = welcome.playerId;
    return client;
  }

  send(message: ClientMessage): void {
    if (this.socket.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
  }

  networkStats(nowMs = performance.now()): OnlineNetworkStats {
    return this.telemetry.stats(nowMs);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  waitFor<T extends ServerMessage['type']>(type: T, timeoutMs = 10000): Promise<MessageOf<T>> {
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        off();
        reject(new Error('等待服务器响应超时'));
      }, timeoutMs);
      const off = this.subscribe((message) => {
        if (message.type === 'error') {
          clearTimeout(timer);
          off();
          reject(new Error(message.message));
          return;
        }
        if (message.type !== type) return;
        clearTimeout(timer);
        off();
        resolve(message as MessageOf<T>);
      });
    });
  }

  async waitForRoom(timeoutMs = 10000): Promise<RoomState> {
    return (await this.waitFor('room', timeoutMs)).room;
  }

  close(): void {
    this.stopTelemetry();
    this.listeners.clear();
    if (this.socket.readyState === WebSocket.OPEN) {
      this.send({ type: 'leave_room' });
      this.socket.close(1000, 'client-leave');
    }
  }

  private startTelemetry(): void {
    this.sendPing();
    this.pingTimer = window.setInterval(() => this.sendPing(), 1000);
  }

  private stopTelemetry(): void {
    if (this.pingTimer === null) return;
    clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  private sendPing(): void {
    const id = this.telemetry.createPing(performance.now());
    this.send({ type: 'ping', id });
  }

  private async drainSnapshots(): Promise<void> {
    if (this.decodingSnapshot) return;
    this.decodingSnapshot = true;
    try {
      while (this.pendingSnapshot) {
        const value = this.pendingSnapshot;
        this.pendingSnapshot = null;
        const message = await parseCompressedSnapshot(value);
        if (message) this.dispatch(message);
      }
    } finally {
      this.decodingSnapshot = false;
    }
  }

  private dispatch(message: ServerMessage): void {
    if (message.type === 'pong') this.telemetry.recordPong(message.id, performance.now());
    if (message.type === 'welcome') this.playerId = message.playerId;
    if (message.type === 'room') this.lastRoom = message.room;
    if (message.type === 'game_start') {
      this.lastGameStart = message;
      this.lastSnapshotSequence = 0;
    }
    if (message.type === 'snapshot') {
      if (Number.isSafeInteger(message.sequence)) {
        if (message.sequence <= this.lastSnapshotSequence) return;
        this.lastSnapshotSequence = message.sequence;
      }
      this.lastSnapshot = message.snapshot;
      this.telemetry.recordSnapshot(performance.now());
    }
    if (message.type === 'game_over') this.lastGameOver = message;
    for (const listener of this.listeners) listener(message);
  }
}

function parseServerText(text: string): ServerMessage | null {
  try {
    const parsed = JSON.parse(text) as ServerMessage;
    const packedTiles = parsed.type === 'snapshot' ? parsed.snapshot.world?.packedTiles : undefined;
    if (parsed.type === 'snapshot' && parsed.snapshot.world && packedTiles) {
      const world = parsed.snapshot.world;
      world.tiles = unpackWorldTiles(packedTiles, world.cols * world.rows);
      delete world.packedTiles;
    }
    return parsed && typeof parsed.type === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

async function parseCompressedSnapshot(value: ArrayBuffer | Blob): Promise<ServerMessage | null> {
  try {
    const bytes = value instanceof ArrayBuffer ? new Blob([value]) : value;
    const stream = bytes.stream().pipeThrough(new DecompressionStream('gzip'));
    return parseServerText(await new Response(stream).text());
  } catch {
    return null;
  }
}

function multiplayerUrl(): string {
  const configured = (import.meta.env.VITE_MULTIPLAYER_URL as string | undefined)?.trim();
  if (configured) return configured;
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = import.meta.env.DEV ? `${window.location.hostname}:8787` : window.location.host;
  return `${protocol}//${host}/ws`;
}
