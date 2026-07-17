import type { BulletKind } from '../../game/BulletKind.ts';
import { BULLET_SPECS } from '../../game/BulletTypes.ts';
import { applyBulletLevel } from '../../game/BulletLevels.ts';
import type { OnlineSnapshot } from '../protocol.ts';
import type { OnlineNetworkStats } from './NetworkTelemetry.ts';

export class OnlineHUD {
  private root: HTMLDivElement;
  private errorMessage = '';
  private errorUntil = 0;
  private displayedRtt = '--';
  private displayedSnapshotAge = '--';
  private nextNetworkRefreshAt = 0;
  private lastMarkup = '';

  constructor(root: HTMLDivElement) {
    this.root = root;
    this.root.className = 'hud online-hud';
  }

  update(
    snapshot: OnlineSnapshot | null,
    playerId: string,
    selectedWeapon: BulletKind,
    network: OnlineNetworkStats,
    nowMs = performance.now(),
  ): void {
    if (!snapshot) {
      if (this.lastMarkup || this.root.childElementCount > 0) {
        this.root.innerHTML = '';
        this.lastMarkup = '';
      }
      return;
    }
    const local = snapshot.players.find((player) => player.id === playerId);
    if (nowMs >= this.nextNetworkRefreshAt) {
      this.displayedRtt = formatNetworkMetric(network.rttMs);
      this.displayedSnapshotAge = formatNetworkMetric(network.snapshotAgeMs);
      this.nextNetworkRefreshAt = nowMs + 250;
    }
    const rootClass = `hud online-hud is-${snapshot.mode}`;
    if (this.root.className !== rootClass) this.root.className = rootClass;
    const title = snapshot.mode === 'duo' ? '双人无尽' : '10 人生存战';
    const objective = snapshot.mode === 'duo'
      ? `<div class="online-stat"><label>剩余敌军</label><strong>${snapshot.remainingEnemies}</strong></div>
         <div class="online-stat"><label>装甲储备</label><strong>${snapshot.teamLives}</strong></div>
         <div class="online-stat"><label>基地</label><strong>${snapshot.baseHp}/${snapshot.baseMaxHp}</strong></div>`
      : `<div class="online-stat"><label>生命</label><strong>${local?.lives ?? 0}</strong></div>
         <div class="online-stat"><label>存活</label><strong>${snapshot.alivePlayers}</strong></div>
         <div class="online-stat"><label>${snapshot.zone?.shrinking ? '缩圈中' : '缩圈倒计时'}</label><strong>${formatTime(snapshot.zone?.nextChangeMs ?? 0)}</strong></div>`;
    const rankedPlayers = [...snapshot.players].sort((a, b) => snapshot.mode === 'duo'
      ? b.kills - a.kills || a.deaths - b.deaths
      : Number(b.lives > 0) - Number(a.lives > 0) || b.lives - a.lives || b.kills - a.kills);
    const scoreboard = rankedPlayers
      .map((player, index) => {
        const eliminated = snapshot.mode === 'brawl' && player.lives <= 0 && !player.alive;
        const result = snapshot.mode === 'duo'
          ? `${player.kills}/${player.deaths}`
          : player.lives > 0 || player.alive ? `${player.lives} 命` : '淘汰';
        return `
        <div class="online-rank ${player.id === playerId ? 'is-self' : ''} ${eliminated ? 'is-eliminated' : ''}">
          <span>${index + 1}</span><i style="--c:${player.color}"></i><b>${escapeHtml(player.name)}</b>
          <em>${result}</em>
        </div>`;
      })
      .join('');
    const error = this.errorMessage && nowMs < this.errorUntil
      ? `<div class="online-session-error">${escapeHtml(this.errorMessage)}</div>`
      : '';
    const availableWeapons: BulletKind[] = local?.unlockedWeapons.length
      ? local.unlockedWeapons
      : ['normal'];
    const weapons = availableWeapons.map((kind, index) => {
      const level = local?.bulletLevels[kind] ?? 1;
      const spec = applyBulletLevel(BULLET_SPECS[kind], level);
      const active = kind === selectedWeapon ? 'is-active' : '';
      const empty = kind !== 'normal' && (local?.energy ?? 0) < spec.energyCost ? 'is-empty' : '';
      const hotkey = index < 9 ? index + 1 : '·';
      const levelBadge = level > 1 ? `<span class="ammo-lv">Lv${level}</span>` : '';
      return `<div class="ammo-chip ${active} ${empty}" style="--c:${spec.color}">
        <span class="ammo-key">${hotkey}</span><span class="ammo-name">${spec.name}</span>
        ${levelBadge}
        <span class="ammo-count">${kind === 'normal' ? '∞' : `-${spec.energyCost}`}</span>
      </div>`;
    }).join('');
    const markup = `
      <div class="online-topbar">
        <div class="online-mode"><small>${title}</small><strong>${snapshot.mode === 'duo' ? `STAGE ${snapshot.stage}` : 'LAST TANK STANDING'}</strong><span class="online-network">RTT <b>${this.displayedRtt}</b>ms · SNAP <b>${this.displayedSnapshotAge}</b>ms</span></div>
        <div class="online-stats">
          <div class="online-stat"><label>击破</label><strong>${local?.kills ?? 0}</strong></div>
          <div class="online-stat"><label>阵亡</label><strong>${local?.deaths ?? 0}</strong></div>
          ${objective}
        </div>
      </div>
      ${error}
      <div class="online-side">
        <div class="online-scoreboard">${scoreboard}</div>
        <div class="online-bottom">
        <div class="hud-energy-head"><span class="hud-section-label">武器能量</span><span>${Math.floor(local?.energy ?? 0)}/100</span></div>
        <div class="hud-energy-track"><div class="hud-energy-fill" style="width:${Math.max(0, Math.min(100, local?.energy ?? 0))}%"></div></div>
        <div class="hud-ammo">${weapons}</div>
        <div class="hud-hint">WASD / 方向键移动 · 空格或鼠标左键开火 · Q/E 或滚轮切换 · Esc 退出确认</div>
        </div>
      </div>`;
    if (markup !== this.lastMarkup) {
      this.root.innerHTML = markup;
      this.lastMarkup = markup;
    }
  }

  showError(message: string): void {
    this.errorMessage = message;
    this.errorUntil = performance.now() + 3000;
  }

  clear(): void {
    this.errorMessage = '';
    this.errorUntil = 0;
    this.displayedRtt = '--';
    this.displayedSnapshotAge = '--';
    this.nextNetworkRefreshAt = 0;
    this.lastMarkup = '';
    this.root.innerHTML = '';
    this.root.className = 'hud';
  }
}

function formatNetworkMetric(value: number | null): string {
  return value === null ? '--' : Math.round(value).toString();
}

function formatTime(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, '0')}`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char] ?? char);
}
