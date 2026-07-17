import type { Server as HttpServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { RoomManager } from './RoomManager.ts';
import { ONLINE_SIMULATION_HZ } from '../../src/multiplayer/protocol.ts';
import { FixedStepClock } from './FixedStepClock.ts';
import type { LeaderboardStore } from '../store.ts';

const MAX_CATCH_UP_STEPS = 5;

export interface MultiplayerServerHandle {
  manager: RoomManager;
  close(): void;
}

export function attachMultiplayerServer(
  server: HttpServer,
  leaderboardStore: LeaderboardStore | null = null,
): MultiplayerServerHandle {
  const manager = new RoomManager(leaderboardStore);
  const sockets = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });
  sockets.on('connection', (socket) => {
    const peer = manager.connect(socket);
    socket.on('message', (data) => manager.handle(peer, data.toString()));
    socket.on('close', () => manager.disconnect(peer));
    socket.on('error', () => manager.disconnect(peer));
  });
  const clock = new FixedStepClock(ONLINE_SIMULATION_HZ, MAX_CATCH_UP_STEPS, performance.now());
  const timer = setInterval(() => {
    const steps = clock.advance(performance.now());
    for (let index = 0; index < steps; index++) manager.tick(clock.stepSeconds);
  }, clock.pollIntervalMs);
  timer.unref();
  return {
    manager,
    close: () => {
      clearInterval(timer);
      sockets.close();
    },
  };
}
