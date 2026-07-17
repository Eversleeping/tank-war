import type { BulletKind } from '../../game/BulletKind.ts';
import { Player } from '../../game/entities/Player.ts';
import type { Tank } from '../../game/entities/Tank.ts';
import type { Team, Vec2 } from '../../game/types.ts';
import type { OnlineParticipant } from './types.ts';

export const ONLINE_PLAYER_COLORS = [
  '#22c55e', '#38bdf8', '#f97316', '#e879f9', '#facc15',
  '#14b8a6', '#fb7185', '#a78bfa', '#84cc16', '#f8fafc',
];

export class OnlineTank extends Player {
  readonly playerId: string;
  readonly playerName: string;
  readonly color: string;
  kills = 0;
  deaths = 0;
  score = 0;
  respawnMs = 0;
  deathHandled = false;
  readonly inventoryOrder: BulletKind[] = [];

  constructor(participant: OnlineParticipant, color: string, team: Team, x: number, y: number) {
    super(x, y);
    this.team = team;
    this.playerId = participant.id;
    this.playerName = participant.name;
    this.color = color;
  }

  hasWeapon(kind: BulletKind): boolean {
    return kind === 'normal' || this.inventoryOrder.includes(kind);
  }

  grantWeapon(kind: BulletKind): void {
    if (kind === 'normal') return;
    if (this.inventoryOrder.includes(kind)) this.upgradeBullet(kind);
    else this.inventoryOrder.push(kind);
  }

  unlockedWeapons(): BulletKind[] {
    return ['normal', ...this.inventoryOrder];
  }

  respawnAt(pos: Vec2): void {
    super.respawn(pos.x, pos.y);
    this.respawnMs = 0;
    this.deathHandled = false;
    this.lastAttacker = null;
  }

  takeZoneDamage(damage: number): void {
    if (!this.alive || damage <= 0) return;
    this.lastAttacker = null;
    this.hp -= damage;
    if (this.hp <= 0) {
      this.hp = 0;
      this.destroy();
    }
  }

  protected override onKilled(_attacker: Tank): void {
    this.destroy();
  }
}
