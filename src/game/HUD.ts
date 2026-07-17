import type { BulletKind } from './BulletKind.ts';
import { BULLET_SPECS } from './BulletTypes.ts';
import type { Player } from './entities/Player.ts';

/** HUD 底部默认操作提示文本。 */
export const DEFAULT_HINT =
  '← ↑ → ↓ / WASD 移动 · 空格 或 鼠标左键 开火 · Q/E 或 滚轮 切换弹种 · 1-9 直接切换 · Esc 退出确认';

/** HUD 顶部覆盖显示：分数 / 关卡 / 生命 / 基地 / 当前弹种 / 弹药。 */
export class HUD {
  private root: HTMLDivElement;
  private scoreEl: HTMLSpanElement;
  private stageEl: HTMLSpanElement;
  private livesEl: HTMLSpanElement;
  private baseHpEl: HTMLSpanElement;
  private killsEl: HTMLSpanElement;
  private remainingEl: HTMLSpanElement;
  private ammoEl: HTMLDivElement;
  private energyFillEl: HTMLDivElement;
  private energyValueEl: HTMLSpanElement;
  private chargeEl: HTMLDivElement;
  private chargeFillEl: HTMLDivElement;
  private chargeValueEl: HTMLSpanElement;
  private buffsEl: HTMLDivElement;
  private hintEl: HTMLDivElement;

  constructor(root: HTMLDivElement) {
    this.root = root;
    this.root.className = 'hud solo-hud';
    this.root.innerHTML = `
      <div class="hud-topbar">
        <div class="hud-cluster hud-mission">
          <div class="hud-stage"><small>当前战区</small><strong>STAGE <span data-el="stage">1</span></strong></div>
          <div class="hud-divider"></div>
          <div class="hud-stat"><label>分数</label><span data-el="score">0</span></div>
          <div class="hud-stat"><label>击破</label><span data-el="kills">0</span></div>
          <div class="hud-stat hud-remaining"><label>剩余敌军</label><span data-el="remaining">0</span></div>
        </div>
        <div class="hud-cluster hud-vitals">
          <div class="hud-stat hud-lives"><label>装甲储备</label><span data-el="lives">3</span></div>
          <div class="hud-stat hud-base"><label>基地耐久</label><span data-el="base">3</span></div>
        </div>
      </div>
      <div class="hud-bottom">
        <div class="hud-arsenal">
          <div class="hud-energy-head"><span class="hud-section-label">武器能量</span><span data-el="energy-value">100</span></div>
          <div class="hud-energy-track"><div class="hud-energy-fill" data-el="energy-fill"></div></div>
          <div class="hud-charge" data-el="charge">
            <div class="hud-charge-head"><span>聚焦同步</span><span data-el="charge-value">0%</span></div>
            <div class="hud-charge-track"><div class="hud-charge-fill" data-el="charge-fill"></div></div>
          </div>
          <div class="hud-ammo" data-el="ammo"></div>
        </div>
        <div class="hud-buffs" data-el="buffs"></div>
        <div class="hud-hint" data-el="hint">← ↑ → ↓ / WASD 移动 · 空格 或鼠标左键开火 · Q/E 或滚轮切换弹种</div>
      </div>
    `;
    this.scoreEl = root.querySelector('[data-el="score"]') as HTMLSpanElement;
    this.stageEl = root.querySelector('[data-el="stage"]') as HTMLSpanElement;
    this.livesEl = root.querySelector('[data-el="lives"]') as HTMLSpanElement;
    this.baseHpEl = root.querySelector('[data-el="base"]') as HTMLSpanElement;
    this.killsEl = root.querySelector('[data-el="kills"]') as HTMLSpanElement;
    this.remainingEl = root.querySelector('[data-el="remaining"]') as HTMLSpanElement;
    this.ammoEl = root.querySelector('[data-el="ammo"]') as HTMLDivElement;
    this.energyFillEl = root.querySelector('[data-el="energy-fill"]') as HTMLDivElement;
    this.energyValueEl = root.querySelector('[data-el="energy-value"]') as HTMLSpanElement;
    this.chargeEl = root.querySelector('[data-el="charge"]') as HTMLDivElement;
    this.chargeFillEl = root.querySelector('[data-el="charge-fill"]') as HTMLDivElement;
    this.chargeValueEl = root.querySelector('[data-el="charge-value"]') as HTMLSpanElement;
    this.buffsEl = root.querySelector('[data-el="buffs"]') as HTMLDivElement;
    this.hintEl = root.querySelector('[data-el="hint"]') as HTMLDivElement;
  }

  update(state: {
    stage: number;
    score: number;
    kills: number;
    remainingEnemies: number;
    baseHp: number;
    baseMaxHp: number;
    player: Player | null;
    inventoryOrder: BulletKind[];
    buffs?: { haste: number; rapidFire: number; regen: number };
    ddaLabel?: string;
    weaponCharge?: number;
  }): void {
    this.stageEl.textContent = state.stage.toString();
    this.scoreEl.textContent = state.score.toString();
    this.killsEl.textContent = state.kills.toString();
    this.remainingEl.textContent = state.remainingEnemies.toString();
    this.baseHpEl.textContent = `${state.baseHp}/${state.baseMaxHp}`;
    this.livesEl.textContent = state.player ? state.player.lives.toString() : '0';
    const energy = state.player?.weaponEnergy ?? 0;
    const maxEnergy = state.player?.maxWeaponEnergy ?? 100;
    this.energyFillEl.style.width = `${Math.max(0, Math.min(100, (energy / maxEnergy) * 100))}%`;
    this.energyValueEl.textContent = `${Math.floor(energy)}/${maxEnergy}`;
    const charge = Math.max(0, Math.min(1, state.weaponCharge ?? 0));
    this.chargeEl.classList.toggle('is-active', charge > 0);
    this.chargeFillEl.style.width = `${charge * 100}%`;
    this.chargeValueEl.textContent = charge >= 1 ? '临界' : `${Math.round(charge * 100)}%`;
    this.renderAmmo(state.player, state.inventoryOrder);
    this.renderBuffs(state.buffs, state.ddaLabel);
  }

  setHint(text: string): void {
    this.hintEl.textContent = text;
  }

  private renderAmmo(player: Player | null, order: BulletKind[]): void {
    const kinds: BulletKind[] = ['normal', ...order];
    const cur = player?.currentBullet ?? 'normal';
    const html = kinds
      .map((k, i) => {
        const spec = BULLET_SPECS[k];
        const count = k === 'normal' ? '∞' : `-${spec.energyCost}`;
        const active = k === cur ? 'is-active' : '';
        const empty = k !== 'normal' && !player?.canSpendEnergy(spec.energyCost) ? 'is-empty' : '';
        const hotkey = i < 9 ? (i + 1).toString() : '·';
        const lv = player ? player.levelOf(k) : 1;
        const lvBadge = lv > 1 ? `<span class="ammo-lv">Lv${lv}</span>` : '';
        return `<div class="ammo-chip ${active} ${empty}" style="--c:${spec.color}">
          <span class="ammo-key">${hotkey}</span>
          <span class="ammo-name">${spec.name}</span>
          ${lvBadge}
          <span class="ammo-count">${count}</span>
        </div>`;
      })
      .join('');
    this.ammoEl.innerHTML = html;
  }

  private renderBuffs(
    buffs?: { haste: number; rapidFire: number; regen: number },
    ddaLabel?: string,
  ): void {
    const chips: string[] = [];
    if (buffs) {
      const defs: Array<[keyof typeof buffs, string, string]> = [
        ['haste', '移速', '#5eead4'],
        ['rapidFire', '射速', '#fbbf24'],
        ['regen', '再生', '#86efac'],
      ];
      for (const [k, label, color] of defs) {
        if (buffs[k] > 0) {
          chips.push(
            `<div class="buff-chip" style="--c:${color}"><span class="buff-name">${label}</span><span class="buff-lv">×${buffs[k]}</span></div>`,
          );
        }
      }
    }
    // DDA 压力档位指示：加压偏红、喘息偏绿
    if (ddaLabel) {
      const color = ddaLabel.startsWith('压力') ? '#f87171' : '#86efac';
      chips.push(`<div class="buff-chip" style="--c:${color}"><span class="buff-name">${ddaLabel}</span></div>`);
    }
    this.buffsEl.innerHTML = chips.join('');
  }
}
