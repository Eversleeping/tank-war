import type { OnlineMode, RoomState, ServerMessage } from '../protocol.ts';
import type { OnlineClient } from './OnlineClient.ts';

export class OnlineOverlay {
  private root: HTMLDivElement;

  constructor(root: HTMLDivElement) {
    this.root = root;
  }

  showEntry(mode: OnlineMode): Promise<
    | { action: 'matchmake' | 'create' | 'join'; code?: string }
    | { action: 'back' }
  > {
    const title = mode === 'duo' ? '双人无尽模式' : '10 人生存模式';
    const capacity = mode === 'duo' ? 2 : 10;
    return new Promise((resolve) => {
      this.show(`
        <div class="panel panel-online-entry">
          <div class="ribbon">ONLINE · ${capacity}P</div>
          <h2>${title}</h2>
          <div class="online-entry-grid">
            <button class="online-entry-action" data-act="matchmake">
              <strong>快速匹配</strong><span>自动寻找同模式玩家，满员后立即开始</span>
            </button>
            <button class="online-entry-action" data-act="create">
              <strong>创建房间</strong><span>生成房间码，由房主自由组织队伍</span>
            </button>
          </div>
          <div class="room-join-row">
            <input class="input-name room-code-input" maxlength="6" placeholder="输入 6 位房间码" autocomplete="off" />
            <button class="btn btn-primary" data-act="join">加入房间</button>
          </div>
          <div class="online-error" data-el="error"></div>
          <button class="btn btn-ghost" data-act="back">返回模式选择</button>
        </div>
      `);
      const input = this.root.querySelector<HTMLInputElement>('.room-code-input')!;
      this.root.querySelector<HTMLButtonElement>('[data-act="matchmake"]')!.onclick = () => resolve({ action: 'matchmake' });
      this.root.querySelector<HTMLButtonElement>('[data-act="create"]')!.onclick = () => resolve({ action: 'create' });
      this.root.querySelector<HTMLButtonElement>('[data-act="join"]')!.onclick = () => {
        const code = input.value.trim().toUpperCase();
        if (code.length !== 6) {
          this.root.querySelector<HTMLElement>('[data-el="error"]')!.textContent = '请输入完整的 6 位房间码';
          return;
        }
        resolve({ action: 'join', code });
      };
      this.root.querySelector<HTMLButtonElement>('[data-act="back"]')!.onclick = () => resolve({ action: 'back' });
    });
  }

  showRoom(client: OnlineClient, initialRoom: RoomState): Promise<'started' | 'leave'> {
    return new Promise((resolve) => {
      if (client.lastGameStart) {
        resolve('started');
        return;
      }
      let room = initialRoom;
      let error = '';
      let finished = false;
      let unsubscribe = (): void => undefined;
      const finish = (result: 'started' | 'leave'): void => {
        if (finished) return;
        finished = true;
        unsubscribe();
        resolve(result);
      };
      const render = (): void => {
        const self = room.players.find((player) => player.id === client.playerId);
        const enoughPlayers = room.players.length >= room.minPlayers;
        const canStart = room.kind === 'custom' && self?.host && enoughPlayers;
        const players = room.players.map((player, index) => `
          <div class="room-player ${player.id === client.playerId ? 'is-self' : ''}">
            <span>${index + 1}</span><strong>${escapeHtml(player.name)}</strong>
            <em>${player.host ? '房主' : '成员'}</em>
          </div>`).join('');
        const empty = Array.from({ length: room.capacity - room.players.length }, (_, index) => `
          <div class="room-player is-empty"><span>${room.players.length + index + 1}</span><strong>等待加入</strong><em>空位</em></div>`).join('');
        const tip = room.kind === 'matchmaking'
          ? '匹配房将在人数满员后自动开始'
          : canStart
            ? '队伍已达到最低人数，房主可以开始'
            : enoughPlayers
              ? '等待房主开始战斗'
              : `至少需要 ${room.minPlayers} 名玩家`;
        this.show(`
          <div class="panel panel-room">
            <div class="room-heading">
              <div><small>${room.kind === 'matchmaking' ? '快速匹配' : '自由组队'}</small><h2>${room.mode === 'duo' ? '双人无尽' : '10 人生存战'}</h2></div>
              <div class="room-code"><label>房间码</label><strong>${room.code}</strong></div>
            </div>
            <div class="room-progress"><span style="width:${room.players.length / room.capacity * 100}%"></span></div>
            <div class="room-count">${room.players.length} / ${room.capacity} 名玩家</div>
            <div class="room-player-list">${players}${empty}</div>
            <div class="online-error">${escapeHtml(error)}</div>
            <div class="btn-row">
              ${room.kind === 'custom' && self?.host ? `<button class="btn btn-primary" data-act="start" ${canStart ? '' : 'disabled'}>开始战斗</button>` : ''}
              <button class="btn" data-act="copy">复制房间码</button>
              <button class="btn btn-ghost" data-act="leave">离开房间</button>
            </div>
            <p class="tip">${tip}</p>
          </div>
        `);
        const start = this.root.querySelector<HTMLButtonElement>('[data-act="start"]');
        if (start) start.onclick = () => client.send({ type: 'start_room' });
        this.root.querySelector<HTMLButtonElement>('[data-act="leave"]')!.onclick = () => {
          client.send({ type: 'leave_room' });
          finish('leave');
        };
        this.root.querySelector<HTMLButtonElement>('[data-act="copy"]')!.onclick = () => {
          void navigator.clipboard?.writeText(room.code);
        };
      };
      unsubscribe = client.subscribe((message: ServerMessage) => {
        if (message.type === 'room') {
          room = message.room;
          render();
        } else if (message.type === 'game_start') {
          finish('started');
        } else if (message.type === 'error') {
          error = message.message;
          render();
        }
      });
      render();
    });
  }

  showResult(message: Extract<ServerMessage, { type: 'game_over' }>, playerId: string): Promise<void> {
    return new Promise((resolve) => {
      const sorted = [...message.players].sort((a, b) => b.lives - a.lives || b.kills - a.kills || a.deaths - b.deaths);
      const rows = sorted.map((player, index) => `
        <tr class="${player.id === playerId ? 'is-self' : ''}">
          <td>#${index + 1}</td><td>${escapeHtml(player.name)}</td><td>${player.lives}</td><td>${player.kills}</td><td>${player.deaths}</td><td>${player.score}</td>
        </tr>`).join('');
      const heading = message.mode === 'duo'
        ? '合作战斗结束'
        : message.winnerId === playerId ? '你成为最后生存者' : '生存战结算';
      this.show(`
        <div class="panel panel-online-result">
          <h2>${heading}</h2>
          <p class="over-line">${escapeHtml(message.reason)}</p>
          ${message.winnerName ? `<div class="online-winner">胜者：${escapeHtml(message.winnerName)}</div>` : ''}
          <div class="board-scroll"><table><thead><tr><th>#</th><th>玩家</th><th>生命</th><th>击破</th><th>阵亡</th><th>得分</th></tr></thead><tbody>${rows}</tbody></table></div>
          <button class="btn btn-primary" data-act="close">返回主菜单</button>
        </div>
      `);
      this.root.querySelector<HTMLButtonElement>('[data-act="close"]')!.onclick = () => resolve();
    });
  }

  showError(message: string): Promise<void> {
    return new Promise((resolve) => {
      this.show(`
        <div class="panel panel-pause">
          <h2>联机服务不可用</h2><p class="over-line">${escapeHtml(message)}</p>
          <button class="btn btn-primary" data-act="close">返回</button>
        </div>`);
      this.root.querySelector<HTMLButtonElement>('[data-act="close"]')!.onclick = () => resolve();
    });
  }

  private show(html: string): void {
    this.root.classList.remove('hidden', 'overlay-menu');
    this.root.innerHTML = html;
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char] ?? char);
}
