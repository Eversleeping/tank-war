import type { BulletKind } from '../../game/BulletKind.ts';
import { BULLET_SPECS } from '../../game/BulletTypes.ts';
import { applyBulletLevel } from '../../game/BulletLevels.ts';
import type { Input } from '../../game/Input.ts';
import type { Overlay } from '../../game/Overlay.ts';
import type { SoundDirector } from '../../game/SoundDirector.ts';
import type { OnlineSnapshot, ServerMessage } from '../protocol.ts';
import { dirAngle } from '../../game/types.ts';
import { OnlineClient } from './OnlineClient.ts';
import { OnlineHUD } from './OnlineHUD.ts';
import { InputSyncPolicy } from './InputSync.ts';
import { hasNearbyDestruction, unseenCombatEffects } from './OnlineEffects.ts';
import { OnlineRenderer } from './OnlineRenderer.ts';
import { SnapshotBuffer } from './SnapshotBuffer.ts';

export type OnlineSessionResult =
  | { type: 'leave' }
  | { type: 'game_over'; message: Extract<ServerMessage, { type: 'game_over' }> };

export class OnlineSession {
  private client: OnlineClient;
  private input: Input;
  private renderer: OnlineRenderer;
  private hud: OnlineHUD;
  private sound: SoundDirector;
  private overlay: Overlay;
  private snapshot: OnlineSnapshot | null = null;
  private snapshots = new SnapshotBuffer();
  private selectedWeapon: BulletKind = 'normal';
  private seq = 0;
  private inputSync = new InputSyncPolicy();
  private snapshotReceivedAtMs = 0;
  private settled = false;
  private leaveConfirming = false;
  private pickupKey: string | null = null;
  private lastCombatEffectId = 0;
  private predictedFireCooldownMs = 0;
  private predictedMuzzleFeedbackAt: number[] = [];
  private unsubscribe: () => void;
  private resizeHandler: () => void;
  private blurHandler: () => void;
  private resolveDone!: (result: OnlineSessionResult) => void;
  readonly done: Promise<OnlineSessionResult>;

  constructor(
    client: OnlineClient,
    input: Input,
    canvas: HTMLCanvasElement,
    hudRoot: HTMLDivElement,
    sound: SoundDirector,
    overlay: Overlay,
  ) {
    this.client = client;
    this.input = input;
    this.renderer = new OnlineRenderer(canvas);
    this.hud = new OnlineHUD(hudRoot);
    this.sound = sound;
    this.overlay = overlay;
    this.snapshot = client.lastSnapshot;
    if (this.snapshot) {
      this.snapshotReceivedAtMs = performance.now();
      this.snapshots.push(this.snapshot, this.snapshotReceivedAtMs);
    }
    this.done = new Promise((resolve) => {
      this.resolveDone = resolve;
    });
    this.unsubscribe = client.subscribe((message) => this.onMessage(message));
    this.resizeHandler = () => this.renderer.resize(window.innerWidth, window.innerHeight);
    this.blurHandler = () => this.sendInputState(null, false, false, 0, true);
    window.addEventListener('resize', this.resizeHandler);
    window.addEventListener('blur', this.blurHandler);
    this.input.reset();
    if (this.snapshot) this.syncPickup(this.snapshot);
  }

  tick(dt: number): void {
    if (this.settled) return;
    if (this.input.consumePressed('Escape') && !this.leaveConfirming) {
      void this.confirmLeave();
    }
    if (this.leaveConfirming) {
      this.renderFrame(dt);
      return;
    }
    if (!this.pickupKey) this.handleWeaponInput();
    const dir = this.input.currentDir();
    const firing = !this.pickupKey && this.input.isFiring();
    this.updatePredictedFireFeedback(dt, firing);
    this.sendInputState(dir, firing, !this.pickupKey, dt);
    this.renderFrame(dt);
  }

  private renderFrame(dt: number): void {
    const nowMs = performance.now();
    const rendered = this.snapshots.sample(nowMs, this.client.playerId) ?? this.snapshot;
    this.renderer.draw(rendered, this.client.playerId, dt);
    this.hud.update(
      this.snapshot,
      this.client.playerId,
      this.selectedWeapon,
      this.client.networkStats(nowMs),
    );
  }

  private async confirmLeave(): Promise<void> {
    if (this.leaveConfirming || this.settled) return;
    this.leaveConfirming = true;
    const restorePickup = this.pickupKey !== null;
    this.sendInputState(null, false, false, 0, true);
    this.input.reset();
    const choice = await this.overlay.showExitConfirm('online');
    if (this.settled) return;
    this.overlay.hide();
    this.input.reset();
    if (choice === 'menu') {
      this.client.send({ type: 'leave_room' });
      this.finish({ type: 'leave' });
      return;
    }
    this.leaveConfirming = false;
    if (restorePickup && this.snapshot) {
      this.pickupKey = null;
      this.syncPickup(this.snapshot);
    }
  }

  dispose(): void {
    this.unsubscribe();
    window.removeEventListener('resize', this.resizeHandler);
    window.removeEventListener('blur', this.blurHandler);
    this.hud.clear();
    this.renderer.dispose();
    this.overlay.hide();
    this.input.reset();
  }

  private handleWeaponInput(): void {
    const weapons = this.availableWeapons();
    for (let index = 0; index < 9; index++) {
      if (this.input.consumePressed(`Digit${index + 1}`) && weapons[index]) {
        this.selectedWeapon = weapons[index];
      }
    }
    if (this.input.consumePressed('KeyQ')) this.cycleWeapon(-1);
    if (this.input.consumePressed('KeyE')) this.cycleWeapon(1);
    const wheel = this.input.consumeWheelSteps();
    if (wheel !== 0) this.cycleWeapon(Math.sign(wheel));
  }

  private cycleWeapon(delta: number): void {
    const weapons = this.availableWeapons();
    const currentIndex = weapons.indexOf(this.selectedWeapon);
    const index = currentIndex < 0 ? 0 : currentIndex;
    this.selectedWeapon = weapons[(index + delta + weapons.length) % weapons.length];
  }

  private availableWeapons(): BulletKind[] {
    const local = this.snapshot?.players.find((player) => player.id === this.client.playerId);
    return local?.unlockedWeapons.length ? local.unlockedWeapons : ['normal'];
  }

  private onMessage(message: ServerMessage): void {
    if (message.type === 'snapshot') {
      this.playSnapshotFeedback(this.snapshot, message.snapshot);
      if (message.snapshot.world || !this.snapshot?.world) {
        this.snapshot = {
          ...message.snapshot,
          world: message.snapshot.world ?? this.snapshot?.world,
        };
      } else {
        this.snapshot = { ...message.snapshot, world: this.snapshot.world };
      }
      const weapons = this.availableWeapons();
      if (!weapons.includes(this.selectedWeapon)) this.selectedWeapon = weapons[0];
      this.snapshotReceivedAtMs = performance.now();
      this.snapshots.push(this.snapshot, this.snapshotReceivedAtMs);
      if (!this.leaveConfirming) this.syncPickup(this.snapshot);
    } else if (message.type === 'game_over') {
      this.finish({ type: 'game_over', message });
    } else if (message.type === 'error') {
      this.hud.showError(message.message);
    }
  }

  private syncPickup(snapshot: OnlineSnapshot): void {
    const choices = snapshot.pickupChoices;
    const selectorId = snapshot.pickupSelectorId;
    if (!choices?.length || !selectorId) {
      if (this.pickupKey) {
        this.pickupKey = null;
        this.overlay.hide();
        this.input.reset();
      }
      return;
    }

    const key = `${snapshot.stage}:${selectorId}:${choices.join(',')}`;
    if (this.pickupKey === key) {
      if (snapshot.pickupRemainingMs !== undefined) {
        this.overlay.updatePickupCountdown(snapshot.pickupRemainingMs);
      }
      return;
    }
    this.pickupKey = key;
    this.input.reset();
    this.sendInputState(null, false, false, 0, true);
    const selector = snapshot.players.find((player) => player.id === selectorId);
    if (selectorId !== this.client.playerId) {
      this.overlay.showPickupWaiting(
        snapshot.stage,
        selector?.name ?? '房主',
        snapshot.pickupRemainingMs,
      );
      return;
    }

    const local = snapshot.players.find((player) => player.id === this.client.playerId);
    void this.overlay.showPickup(
      snapshot.stage,
      choices,
      (kind) => local?.unlockedWeapons.includes(kind) ? local.bulletLevels[kind] ?? 1 : 0,
      snapshot.pickupRemainingMs,
    ).then((weapon) => {
      if (this.pickupKey !== key || this.settled) return;
      this.client.send({ type: 'choose_pickup', weapon });
    });
  }

  private playSnapshotFeedback(
    previous: OnlineSnapshot | null,
    current: OnlineSnapshot,
  ): void {
    if (!previous) return;
    const authoritativeEffects = Array.isArray(current.effects);
    if (authoritativeEffects) {
      const batch = unseenCombatEffects(current.effects, this.lastCombatEffectId);
      this.lastCombatEffectId = batch.lastSeenId;
      for (const effect of batch.effects) {
        if (effect.type === 'muzzle') {
          if (
            effect.ownerId === this.client.playerId
            && this.consumePredictedMuzzleFeedback()
          ) {
            continue;
          }
          const spec = BULLET_SPECS[effect.bullet];
          this.renderer.addMuzzle(
            effect.x,
            effect.y,
            spec.color,
            effect.bullet,
            effect.angle,
          );
          if (effect.ownerId === this.client.playerId) this.sound.fire(effect.bullet);
        } else if (effect.type === 'impact') {
          this.renderer.addWeaponImpact(
            effect.x,
            effect.y,
            effect.radius,
            effect.bullet,
          );
          if (
            this.renderer.isVisible(effect.x, effect.y)
            && !hasNearbyDestruction(batch.effects, effect.x, effect.y)
          ) {
            this.sound.play(effect.radius >= 40 ? 'explosion' : 'hit');
          }
        } else if (effect.type === 'beam') {
          this.renderer.addBeam(
            { x: effect.fromX, y: effect.fromY },
            { x: effect.toX, y: effect.toY },
            effect.bullet,
            effect.width,
          );
          if (
            this.renderer.isVisible(effect.fromX, effect.fromY)
            || this.renderer.isVisible(effect.toX, effect.toY)
          ) {
            if (!hasNearbyDestruction(batch.effects, effect.toX, effect.toY)) {
              this.sound.play('hit');
            }
          }
        } else {
          this.renderer.addDestroyed(
            effect.x,
            effect.y,
            effect.radius,
            effect.color,
          );
          if (this.renderer.isVisible(effect.x, effect.y)) this.sound.play('explosion');
        }
      }
    } else {
      this.playLegacySnapshotFeedback(previous, current);
    }

    if (current.baseHp < previous.baseHp) this.sound.play('baseHit');
    const oldLocal = previous.players.find((player) => player.id === this.client.playerId);
    const newLocal = current.players.find((player) => player.id === this.client.playerId);
    if (oldLocal && newLocal) {
      if (!authoritativeEffects && newLocal.hp < oldLocal.hp) this.sound.play('hit');
      const gainedWeapon = newLocal.unlockedWeapons.some(
        (weapon) => !oldLocal.unlockedWeapons.includes(weapon),
      );
      const upgradedWeapon = newLocal.unlockedWeapons.some(
        (weapon) => (newLocal.bulletLevels[weapon] ?? 1) > (oldLocal.bulletLevels[weapon] ?? 1),
      );
      if (gainedWeapon || upgradedWeapon || newLocal.lives > oldLocal.lives) this.sound.play('pickup');
    }
  }

  private updatePredictedFireFeedback(dt: number, firing: boolean): void {
    this.predictedFireCooldownMs = Math.max(0, this.predictedFireCooldownMs - dt * 1000);
    if (!firing || this.predictedFireCooldownMs > 0) return;
    const local = this.snapshot?.players.find((player) => player.id === this.client.playerId);
    if (!local?.alive || local.freezeMs > 0) return;
    if (!local.unlockedWeapons.includes(this.selectedWeapon)) return;
    const spec = applyBulletLevel(
      BULLET_SPECS[this.selectedWeapon],
      local.bulletLevels[this.selectedWeapon] ?? 1,
    );
    if (local.energy + 1e-6 < spec.energyCost) return;

    const center = { x: local.x + local.w / 2, y: local.y + local.h / 2 };
    const offset = Math.max(local.w, local.h) / 2 + 2;
    const muzzle = { ...center };
    if (local.dir === 'up') muzzle.y -= offset;
    else if (local.dir === 'down') muzzle.y += offset;
    else if (local.dir === 'left') muzzle.x -= offset;
    else muzzle.x += offset;

    this.renderer.addMuzzle(
      muzzle.x,
      muzzle.y,
      spec.color,
      this.selectedWeapon,
      dirAngle(local.dir),
    );
    this.sound.fire(this.selectedWeapon);
    this.predictedMuzzleFeedbackAt.push(performance.now());
    this.predictedFireCooldownMs = spec.cooldown;
  }

  private consumePredictedMuzzleFeedback(): boolean {
    const cutoff = performance.now() - 1500;
    this.predictedMuzzleFeedbackAt = this.predictedMuzzleFeedbackAt.filter(
      (timestamp) => timestamp >= cutoff,
    );
    if (this.predictedMuzzleFeedbackAt.length === 0) return false;
    this.predictedMuzzleFeedbackAt.shift();
    return true;
  }

  private playLegacySnapshotFeedback(
    previous: OnlineSnapshot,
    current: OnlineSnapshot,
  ): void {
    const previousBullets = new Set(previous.bullets.map((bullet) => bullet.id));
    for (const bullet of current.bullets) {
      if (previousBullets.has(bullet.id) || bullet.ownerId !== this.client.playerId) continue;
      if (this.consumePredictedMuzzleFeedback()) continue;
      this.sound.fire(bullet.kind);
      this.renderer.addMuzzle(
        bullet.x,
        bullet.y,
        BULLET_SPECS[bullet.kind].color,
        bullet.kind,
        Math.atan2(bullet.vy, bullet.vx),
      );
    }

    const liveEnemyIds = new Set(current.enemies.map((enemy) => enemy.id));
    for (const enemy of previous.enemies) {
      if (liveEnemyIds.has(enemy.id)) continue;
      this.sound.play('explosion');
      this.renderer.addExplosion(
        enemy.x + enemy.w / 2,
        enemy.y + enemy.h / 2,
        enemy.w * 0.55,
        '#fb7185',
      );
    }
  }

  private sendInputState(
    dir: ReturnType<Input['currentDir']>,
    firing: boolean,
    allowHeartbeat: boolean,
    dt: number,
    force = false,
  ): void {
    const payload = { dir, firing, weapon: this.selectedWeapon };
    if (!this.inputSync.shouldSend(payload, dt, allowHeartbeat, force)) return;
    this.client.send({
      type: 'input',
      input: { ...payload, seq: ++this.seq },
    });
  }

  private finish(result: OnlineSessionResult): void {
    if (this.settled) return;
    this.settled = true;
    this.resolveDone(result);
  }
}
