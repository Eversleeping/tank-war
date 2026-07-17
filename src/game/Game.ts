import type { BulletKind } from './BulletKind.ts';
import type { BulletSpec } from './BulletTypes.ts';
import type { Dir, Vec2 } from './types.ts';
import { BULLET_SPECS, rollPickupChoices } from './BulletTypes.ts';
import { Bullet } from './entities/Bullet.ts';
import { Camera } from './Camera.ts';
import { combatViewport, positionCombatCanvas } from './viewport.ts';
import { BASE_REPAIR_SHIELD_MS, resolveBaseBreach } from './baseRules.ts';
import { Enemy, rollEnemyKind } from './entities/Enemy.ts';
import {
  bossBarrageInterval,
  bossDiagonalAngles,
  bossHp,
  BOSS_TURRET_DIRS,
  isBossStage,
  remainingEnemyCount,
} from './boss.ts';
import { EnemyAI } from './EnemyAI.ts';
import { HUD, DEFAULT_HINT } from './HUD.ts';
import { Input } from './Input.ts';
import { Overlay } from './Overlay.ts';
import { Player } from './entities/Player.ts';
import { PowerUp } from './entities/PowerUp.ts';
import { Renderer } from './Renderer.ts';
import { World } from './World.ts';
import { AudioEngine } from './Audio.ts';
import { SoundDirector } from './SoundDirector.ts';
import { leaderboard, loadPlayerName } from '../storage/leaderboard.ts';
import { clearRun, hasSavedRun, loadRun, saveRun } from '../storage/saveGame.ts';
import {
  KILL_SCORE,
  PLAYER_LIVES,
  RESPAWN_DELAY,
  TANK_SIZE,
  TILE,
  aiTier,
  enemyFireCd,
  enemyHp,
  enemyMaxOnScreen,
  enemyRank,
  enemySpawnInterval,
  enemySpeed,
  enemyTotal,
  stageBonus,
} from './constants.ts';
import { rectCenter } from './types.ts';
import { dirAngle } from './types.ts';
import { advanceFlags, effectiveDt } from './loopPolicy.ts';
import {
  addBuff,
  cooldownMultiplier,
  emptyBuffs,
  powerUpToBuff,
  regenIntervalMs,
  speedMultiplier,
  type BuffState,
} from './buffs.ts';
import {
  driftStep,
  fogRadiusPx,
  rollStageEvent,
  stageEventInfo,
  type StageEventKind,
} from './events.ts';
import {
  cadenceMultiplier,
  ddaLabel,
  initialDda,
  intensityMultiplier,
  registerDeath,
  registerStageClear,
  type DdaState,
} from './dda.ts';
import { OnlineClient } from '../multiplayer/client/OnlineClient.ts';
import { OnlineOverlay } from '../multiplayer/client/OnlineOverlay.ts';
import { OnlineSession } from '../multiplayer/client/OnlineSession.ts';
import type { OnlineMode } from '../multiplayer/protocol.ts';
import {
  laserChargeRatio,
  laserDamage,
  laserRayEnd,
  targetsInLaserPath,
} from './LaserWeapon.ts';

type Status =
  | 'menu'
  | 'playing'
  | 'stage-clear'
  | 'pickup'
  | 'paused'
  | 'game-over'
  | 'transition';

/**
 * 游戏主控。负责主循环、关卡推进、生成、拾取三选一、
 * 通关面板、Game Over、排行榜衔接。
 */
export class Game {
  private canvas: HTMLCanvasElement;
  private hudRoot: HTMLDivElement;
  private renderer: Renderer;
  private hud: HUD;
  private overlay: Overlay;
  private onlineOverlay: OnlineOverlay;
  private input: Input;
  private online: OnlineSession | null = null;
  private audio: AudioEngine;
  private sound: SoundDirector;

  private world!: World;
  private camera!: Camera;
  private player: Player | null = null;
  private enemies: Enemy[] = [];
  private bullets: Bullet[] = [];
  private powerUps: PowerUp[] = [];
  private ai = new EnemyAI();

  private stage = 1;
  private enemySpawnQueue = 0;
  private spawnTimerMs = 0;
  private respawnTimerS = 0;
  private inventoryOrder: BulletKind[] = []; // 除 normal 外，拾取到的弹种顺序（用于 Q/E 切换）
  private bossSpawned = false;
  // 持续增益：拾取后累加，跨关保留，直到本局结束
  private buffs: BuffState = emptyBuffs();
  private regenTimerMs = 0;
  // 本关负面事件（进入下一关重新掷）
  private stageEvent: StageEventKind = 'none';
  private slipDriftMs = 0;
  private slipLastDir: import('./types.ts').Dir | null = null;
  private laserChargeMs = 0;
  private laserCharging = false;
  private fireWasDown = false;

  // 动态难度微调：整局持续，按无伤连胜 / 连续丢命加压减压
  private dda: DdaState = initialDda();
  // 本关玩家是否受创（丢命 / 基地被击），用于通关时喂给 DDA
  private stageTookDamage = false;
  // 上一帧玩家剩余生命，用于检测本帧是否丢命
  private prevLives = 0;

  private status: Status = 'menu';
  private lastTs = 0;
  private rafId = 0;

  private rng: () => number = Math.random;

  private viewW = 1280;
  private viewH = 720;

  /** 当前玩家代号。主菜单登记后一直沿用到 Game Over 自动提交。 */
  private playerName = '';

  constructor(canvas: HTMLCanvasElement, hudRoot: HTMLDivElement, overlayRoot: HTMLDivElement) {
    this.canvas = canvas;
    this.hudRoot = hudRoot;
    this.renderer = new Renderer(canvas);
    this.hud = new HUD(hudRoot);
    this.audio = new AudioEngine();
    this.sound = new SoundDirector(this.audio);
    this.overlay = new Overlay(overlayRoot, this.audio);
    this.onlineOverlay = new OnlineOverlay(overlayRoot);
    this.input = new Input(window, canvas);
    window.addEventListener('resize', () => this.handleResize());
    window.addEventListener('blur', () => this.resetWeaponInput());
    this.handleResize();

    // 浏览器自动播放策略：AudioContext 需在首次用户手势后才能出声。
    const resumeAudio = (): void => this.audio.resume();
    window.addEventListener('pointerdown', resumeAudio, { once: true });
    window.addEventListener('keydown', resumeAudio, { once: true });
  }

  /** 启动，先展示主菜单。 */
  async start(): Promise<void> {
    // 主循环常开：即使在菜单也做渲染（会渲染空世界防止黑屏）
    this.beginLoop();
    await this.showMenu();
  }

  private async showMenu(showContinue = true): Promise<void> {
    this.status = 'menu';
    const best = await this.readBestScore();
    const initialName = this.playerName || loadPlayerName();
    const result = await this.overlay.showMenu(best, initialName, showContinue && hasSavedRun());
    this.playerName = result.name;
    if (result.action === 'leaderboard') {
      await this.overlay.showLeaderboard();
      await this.showMenu(showContinue);
      return;
    }
    if (result.action === 'continue' && this.resumeRun()) {
      this.overlay.hide();
      this.input.reset();
      return;
    }
    const mode = await this.overlay.showModeSelect(hasSavedRun());
    if (mode === 'back') {
      await this.showMenu(showContinue);
      return;
    }
    if (mode === 'single') {
      this.overlay.hide();
      this.input.reset();
      this.startNewRun();
      return;
    }
    await this.startOnlineMode(mode);
  }

  private async startOnlineMode(mode: OnlineMode): Promise<void> {
    this.status = 'transition';
    let client: OnlineClient;
    try {
      client = await OnlineClient.connect(this.playerName);
    } catch (error) {
      await this.onlineOverlay.showError(error instanceof Error ? error.message : '无法连接联机服务器');
      await this.showMenu();
      return;
    }

    while (true) {
      const entry = await this.onlineOverlay.showEntry(mode);
      if (entry.action === 'back') {
        client.close();
        await this.showMenu();
        return;
      }
      try {
        const roomPromise = client.waitForRoom();
        if (entry.action === 'matchmake') client.send({ type: 'matchmake', mode });
        else if (entry.action === 'create') client.send({ type: 'create_room', mode });
        else client.send({ type: 'join_room', code: entry.code ?? '' });
        const room = await roomPromise;
        const roomResult = await this.onlineOverlay.showRoom(client, room);
        if (roomResult === 'leave') continue;

        this.overlay.hide();
        this.online = new OnlineSession(
          client,
          this.input,
          this.canvas,
          this.hudRoot,
          this.sound,
          this.overlay,
        );
        const sessionResult = await this.online.done;
        this.online.dispose();
        this.online = null;
        this.hud = new HUD(this.hudRoot);
        if (sessionResult.type === 'game_over') {
          await this.onlineOverlay.showResult(sessionResult.message, client.playerId);
        }
        client.close();
        await this.showMenu(false);
        return;
      } catch (error) {
        await this.onlineOverlay.showError(error instanceof Error ? error.message : '房间操作失败');
      }
    }
  }

  private async readBestScore(): Promise<number | null> {
    try {
      const top = await leaderboard.top('single', 1);
      return top[0]?.score ?? null;
    } catch {
      return null;
    }
  }

  private startNewRun(): void {
    this.stage = 1;
    this.buffs = emptyBuffs();
    this.inventoryOrder = [];
    this.bullets = [];
    this.powerUps = [];
    this.enemies = [];
    this.dda = initialDda();
    this.resetWeaponInput();
    this.enterStage(this.stage);
    this.player = new Player(this.world.playerSpawn.x, this.world.playerSpawn.y, PLAYER_LIVES);
    this.player.score = 0;
    this.player.kills = 0;
    this.player.invulnMs = 2000;
    this.prevLives = this.player.lives;
    this.status = 'playing';
    this.saveCheckpoint();
  }

  /** 把当前关卡开头的进度写入存档（刷新后可续玩本关）。 */
  private saveCheckpoint(): void {
    if (!this.player) return;
    saveRun({
      stage: this.stage,
      score: this.player.score,
      kills: this.player.kills,
      lives: this.player.lives,
      inventoryOrder: [...this.inventoryOrder],
      weaponEnergy: this.player.weaponEnergy,
      bulletLevels: { ...this.player.bulletLevels },
      currentBullet: this.player.currentBullet,
      buffs: { ...this.buffs },
      dda: { ...this.dda },
      name: this.playerName,
    });
  }

  /**
   * 从存档恢复一局，从存档记录的关卡开头重开。
   * 成功返回 true；无有效存档返回 false（调用方回退到新开一局）。
   */
  private resumeRun(): boolean {
    const snap = loadRun();
    if (!snap) return false;
    this.inventoryOrder = snap.inventoryOrder.slice();
    this.bullets = [];
    this.powerUps = [];
    this.enemies = [];
    this.buffs = { ...snap.buffs };
    this.dda = { ...snap.dda };
    this.resetWeaponInput();
    if (snap.name) this.playerName = snap.name;
    // 先建关卡（此时 player 尚为 null，enterStage 会把相机对准出生点）
    this.player = null;
    this.enterStage(snap.stage);
    // 重建玩家并灌回武器解锁 / 等级 / 能量 / 分数
    this.player = new Player(this.world.playerSpawn.x, this.world.playerSpawn.y, snap.lives);
    this.player.score = snap.score;
    this.player.kills = snap.kills;
    this.player.weaponEnergy = snap.weaponEnergy;
    this.player.bulletLevels = { ...snap.bulletLevels };
    this.player.selectBullet(
      snap.currentBullet === 'normal' || this.inventoryOrder.includes(snap.currentBullet)
        ? snap.currentBullet
        : 'normal',
    );
    this.applyBuffsToPlayer();
    this.regenTimerMs = regenIntervalMs(this.buffs);
    this.player.invulnMs = 2000;
    this.prevLives = this.player.lives;
    this.camera.snap(this.player.center);
    this.status = 'playing';
    // 续玩起点即本关开头，重写一次存档保持一致
    this.saveCheckpoint();
    return true;
  }

  private enterStage(stage: number): void {
    this.stage = stage;
    this.rng = mulberry32(stage * 9301 + 49297);
    this.world = new World(stage, this.rng, {
      onBaseHit: () => this.onBaseHit(),
    });
    // 世界大小 → 视口大小取 min(视口上限, 世界像素)
    this.updateViewport();
    // 相机初始化
    this.camera = new Camera(this.viewW, this.viewH, this.world.widthPx, this.world.heightPx);

    // 复位敌人 / 子弹 / 道具
    this.enemies = [];
    this.bullets = [];
    this.powerUps = [];
    this.enemySpawnQueue = enemyTotal(stage);
    this.spawnTimerMs = 400;
    this.bossSpawned = false;

    // 持续增益跨关保留；再生计时在新关从完整间隔重新开始
    this.regenTimerMs = regenIntervalMs(this.buffs);
    this.applyBuffsToPlayer();

    // 负面事件：本关掷一次，仅本关有效
    this.stageEvent = rollStageEvent(stage, this.rng);
    this.slipDriftMs = 0;
    this.slipLastDir = null;

    // 本关受创标记复位（进入新关重新开始统计，用于 DDA）
    this.stageTookDamage = false;
    if (this.player) this.prevLives = this.player.lives;
    // 事件提示：有事件时用 HUD 提示条告知玩家，无事件恢复默认操作提示
    const evt = stageEventInfo(this.stageEvent);
    if (this.stageEvent !== 'none') {
      this.hud.setHint(`⚠ 本关事件 · ${evt.name}：${evt.desc}`);
    } else {
      this.hud.setHint(DEFAULT_HINT);
    }

    // 保留玩家已解锁武器、等级与当前能量
    if (this.player) {
      this.player.rect.x = this.world.playerSpawn.x;
      this.player.rect.y = this.world.playerSpawn.y;
      this.player.dir = 'up';
      this.player.hp = this.player.maxHp;
      this.player.invulnMs = 2000;
      this.player.freezeMs = 0;
      this.player.cooldownMs = 0;
      if (!this.player.alive) {
        this.player.alive = true;
      }
      this.camera.snap(this.player.center);
    } else {
      // 初次进入时相机对准玩家生成点
      this.camera.snap({
        x: this.world.playerSpawn.x + TANK_SIZE / 2,
        y: this.world.playerSpawn.y + TANK_SIZE / 2,
      });
    }
  }

  private updateViewport(): void {
    const viewport = combatViewport(window.innerWidth, window.innerHeight, true);
    this.viewW = viewport.viewW;
    this.viewH = viewport.viewH;
    positionCombatCanvas(this.canvas, viewport);
    this.renderer.resize(this.viewW, this.viewH);
    if (this.camera) {
      this.camera.resize(this.viewW, this.viewH, this.world.widthPx, this.world.heightPx);
    }
  }

  private handleResize(): void {
    this.updateViewport();
  }

  private beginLoop(): void {
    const loop = (ts: number): void => {
      this.rafId = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (ts - this.lastTs) / 1000 || 0);
      this.lastTs = ts;
      this.tick(dt);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  private tick(dt: number): void {
    if (this.online) {
      this.online.tick(dt);
      this.input.endFrame();
      return;
    }
    const flags = advanceFlags(this.status);
    // 世界物理：仅 playing 推进，且 dt 走冻结保护
    if (flags.world) {
      this.handleGlobalKeys();
      this.updatePlaying(effectiveDt(dt, this.status));
    } else if (this.status === 'paused') {
      // 暂停态仍需响应 Esc 恢复（暂停面板由 Overlay 处理，这里不重复）
    }
    // 特效更新：暂停 / 弹窗态一并冻结，避免爆炸与闪光继续动
    if (flags.effects) {
      this.renderer.update(dt);
    }
    // 渲染始终进行（静止画面），防止黑屏
    this.render();
    this.input.endFrame();
  }

  private handleGlobalKeys(): void {
    if (this.input.consumePressed('Escape')) {
      void this.togglePause();
    }
    // 数字键直接切换到该栏位对应的弹种
    const digitCodes = [
      'Digit1',
      'Digit2',
      'Digit3',
      'Digit4',
      'Digit5',
      'Digit6',
      'Digit7',
      'Digit8',
      'Digit9',
    ];
    for (let i = 0; i < digitCodes.length; i++) {
      if (this.input.consumePressed(digitCodes[i])) {
        this.selectSlot(i);
      }
    }
    if (this.input.consumePressed('KeyQ')) this.cycleSlot(-1);
    if (this.input.consumePressed('KeyE')) this.cycleSlot(1);
    // 滚轮切换弹种：往下 = 下一个，往上 = 上一个
    const wheel = this.input.consumeWheelSteps();
    if (wheel !== 0) this.cycleSlot(Math.sign(wheel));
  }

  private currentSlots(): BulletKind[] {
    return ['normal', ...this.inventoryOrder];
  }

  private selectSlot(index: number): void {
    if (!this.player) return;
    const slots = this.currentSlots();
    if (index < 0 || index >= slots.length) return;
    const before = this.player.currentBullet;
    this.player.selectBullet(slots[index]);
    if (this.player.currentBullet !== before) {
      this.cancelLaserCharge();
      this.sound.play('select');
    }
  }

  private cycleSlot(delta: number): void {
    if (!this.player) return;
    const slots = this.currentSlots();
    if (slots.length === 0) return;
    const before = this.player.currentBullet;
    const idx = slots.indexOf(this.player.currentBullet);
    if (idx === -1) {
      this.player.selectBullet(slots[0]);
      if (this.player.currentBullet !== before) {
        this.cancelLaserCharge();
        this.sound.play('select');
      }
      return;
    }
    const next = (idx + delta + slots.length) % slots.length;
    this.player.selectBullet(slots[next]);
    if (this.player.currentBullet !== before) {
      this.cancelLaserCharge();
      this.sound.play('select');
    }
  }

  private updatePlaying(dt: number): void {
    this.world.update(dt);
    // 持续增益：把当前 buff 状态换算成玩家倍率，并处理护盾再生
    this.applyBuffsToPlayer();
    this.tickRegen(dt);
    // 玩家输入
    if (this.player && this.player.alive) {
      const inputDir = this.input.currentDir();
      if (this.stageEvent === 'slippery') {
        // 打滑：松开方向键后仍沿上一次方向滑行一小段
        const step = driftStep(inputDir, this.slipLastDir, this.slipDriftMs, dt * 1000);
        this.slipDriftMs = step.driftMs;
        if (inputDir) this.slipLastDir = inputDir;
        if (step.dir) {
          this.player.tryMove(dt, step.dir, this.world, this.allTanks());
        }
      } else if (inputDir) {
        this.player.tryMove(dt, inputDir, this.world, this.allTanks());
      }
      this.updatePlayerWeapon(dt, this.input.isFiring());
    } else {
      this.cancelLaserCharge();
      this.fireWasDown = this.input.isFiring();
    }

    // 敌人 AI
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      const newBullets = this.ai.update(dt, enemy, {
        tier: aiTier(this.stage),
        world: this.world,
        player: this.player!,
        tanks: this.tankArray(),
        bullets: this.bullets,
        rng: this.rng,
        baseCenter: () => rectCenter(this.world.baseRect()),
      });
      if (newBullets.length > 0) {
        this.bullets.push(...newBullets);
        const first = newBullets[0];
        this.renderer.addMuzzle(
          first.center.x,
          first.center.y,
          first.spec.color,
          first.spec.id,
          dirAngle(enemy.dir),
        );
        // 敌人开火音效（节流，避免多敌同帧叠音）
        this.sound.fire(newBullets[0].spec.id);
      }
    }

    // Boss 齐射：独立于普通开火，按间隔向多方向同时倾泻弹幕
    this.updateBossBarrage(dt);

    // 更新所有坦克状态（冷却/无敌/冻结衰减）
    if (this.player) this.player.update(dt);
    for (const e of this.enemies) e.update(dt);

    // 子弹推进
    const ctx = {
      world: this.world,
      tanks: () => this.allTanks(),
      bullets: () => this.bullets,
      playExplosion: (pos: Vec2, radius: number, color: string, kind: BulletKind = 'normal') => {
        this.renderer.addExplosion(pos.x, pos.y, Math.max(20, radius), color, kind);
        // 大半径视为爆炸，小半径视为命中
        this.sound.play(radius >= 40 ? 'explosion' : 'hit');
      },
      playBeam: (from: Vec2, to: Vec2, color: string, width: number) => {
        this.renderer.addBeam(from, to, color, width, 'chain');
        this.sound.play('hit');
      },
    };
    for (const b of this.bullets) b.update(dt, ctx);

    // 道具
    for (const p of this.powerUps) p.update(dt);
    this.checkPowerUpPickup();

    // 击杀清算
    this.reapDead();

    // DDA：检测本帧是否丢命 / 受创
    this.trackDamageForDda();

    if (this.handleBaseBreach()) {
      void this.handleGameOver();
      return;
    }

    // 敌人生成
    this.spawnEnemies(dt);

    // 玩家复活
    if (this.player && !this.player.alive) {
      this.respawnTimerS -= dt;
      if (this.respawnTimerS <= 0 && this.player.lives > 0) {
        this.player.respawn(this.world.playerSpawn.x, this.world.playerSpawn.y);
      }
    }

    // 死亡条件
    if (this.player && this.player.lives <= 0 && !this.player.alive) {
      void this.handleGameOver();
      return;
    }

    // 相机跟随
    if (this.player && this.player.alive) {
      this.camera.follow(this.player.center);
    }

    // Boss 关：普通敌人清空后生成 Boss，击破 Boss 才通关
    if (
      isBossStage(this.stage) &&
      !this.bossSpawned &&
      this.enemySpawnQueue <= 0 &&
      this.enemies.every((e) => !e.alive)
    ) {
      this.spawnBoss();
    }

    // 通关检查（Boss 关需已生成 Boss 且被击破）
    if (this.enemySpawnQueue <= 0 && this.enemies.every((e) => !e.alive)) {
      if (!isBossStage(this.stage) || this.bossSpawned) {
        void this.handleStageClear();
      }
    }

    // 清理已死亡实体（延迟一帧，方便渲染爆炸）
    this.bullets = this.bullets.filter((b) => b.alive);
    this.powerUps = this.powerUps.filter((p) => p.alive);

    // HUD
    this.hud.update({
      stage: this.stage,
      score: this.player?.score ?? 0,
      kills: this.player?.kills ?? 0,
      remainingEnemies: remainingEnemyCount(
        this.stage,
        this.enemySpawnQueue,
        this.enemies.filter((enemy) => enemy.alive).length,
        this.bossSpawned,
      ),
      baseHp: this.world.baseHp,
      baseMaxHp: this.world.baseMaxHp,
      player: this.player,
      inventoryOrder: this.inventoryOrder,
      buffs: this.buffs,
      ddaLabel: ddaLabel(this.dda),
      weaponCharge: this.laserCharging ? laserChargeRatio(this.laserChargeMs) : 0,
    });
  }

  private updatePlayerWeapon(dt: number, firing: boolean): void {
    const player = this.player;
    if (!player || !player.alive) return;
    if (player.currentBullet !== 'laser') {
      this.cancelLaserCharge();
      if (firing) this.tryPlayerFire();
      this.fireWasDown = firing;
      return;
    }

    if (firing) {
      if (
        !this.laserCharging
        && player.cooldownMs <= 0
        && player.freezeMs <= 0
        && player.canSpendEnergy(player.spec().energyCost)
      ) {
        this.laserCharging = true;
        this.laserChargeMs = 0;
      }
      if (this.laserCharging) this.laserChargeMs += dt * 1000;
    } else if (this.fireWasDown && this.laserCharging) {
      this.releaseFocusedLaser();
    }
    this.fireWasDown = firing;
  }

  private releaseFocusedLaser(): void {
    const player = this.player;
    if (!player || !player.alive || player.freezeMs > 0 || player.currentBullet !== 'laser') {
      this.cancelLaserCharge();
      return;
    }
    const spec = player.spec();
    if (!player.spendEnergy(spec.energyCost)) {
      this.cancelLaserCharge();
      return;
    }

    const ratio = laserChargeRatio(this.laserChargeMs);
    const from = player.muzzle();
    const to = laserRayEnd(from, player.dir, this.world.widthPx, this.world.heightPx);
    const beamHalfWidth = 3 + ratio * 8;
    const targets = targetsInLaserPath(
      from,
      player.dir,
      this.enemies.filter((enemy) => enemy.alive),
      beamHalfWidth,
    );
    const damage = laserDamage(spec.damage, ratio);
    for (const target of targets) {
      target.takeHit(player, damage, spec);
      this.renderer.addExplosion(
        target.center.x,
        target.center.y,
        15 + ratio * 14,
        spec.color,
        'laser',
      );
    }

    player.cooldownMs = spec.cooldown * player.cooldownMul;
    this.renderer.addBeam(from, to, spec.color, 3 + ratio * 5, 'laser', ratio);
    this.renderer.addMuzzle(from.x, from.y, spec.color, 'laser', dirAngle(player.dir), 0.7 + ratio);
    this.sound.fire('laser');
    if (targets.length > 0) this.sound.play('hit');
    this.cancelLaserCharge();
  }

  private cancelLaserCharge(): void {
    this.laserCharging = false;
    this.laserChargeMs = 0;
  }

  private resetWeaponInput(): void {
    this.cancelLaserCharge();
    this.fireWasDown = false;
  }

  private tryPlayerFire(): void {
    if (!this.player || !this.player.alive) return;
    const kind = this.player.currentBullet;
    const spec = this.player.spec();
    if (!this.player.canSpendEnergy(spec.energyCost)) return;
    const bullets = this.player.fire((spec, dir, m) => this.makeBullets(spec, this.player!, dir, m));
    if (!bullets) return;
    this.player.spendEnergy(spec.energyCost);
    this.bullets.push(...bullets);
    const first = bullets[0];
    if (first) {
      this.renderer.addMuzzle(
        first.center.x,
        first.center.y,
        first.spec.color,
        first.spec.id,
        dirAngle(this.player.dir),
      );
    }
    // 开火音效：按弹种选择（重炮/爆破更沉），带节流
    this.sound.fire(kind);
  }

  private makeBullets(spec: BulletSpec, owner: Player | Enemy, dir: Dir, muzzle: Vec2): Bullet[] {
    const arr: Bullet[] = [];
    if (spec.spread > 1) {
      const half = (spec.spread - 1) / 2;
      for (let i = 0; i < spec.spread; i++) {
        const angle = (i - half) * spec.spreadAngle;
        arr.push(rotatedBullet(spec, owner, dir, muzzle, angle));
      }
    } else {
      arr.push(new Bullet(spec, owner, dir, muzzle));
    }
    return arr;
  }

  private spawnEnemies(dt: number): void {
    if (this.enemySpawnQueue <= 0) return;
    const cap = enemyMaxOnScreen(this.stage);
    const alive = this.enemies.filter((e) => e.alive).length;
    if (alive >= cap) return;
    this.spawnTimerMs -= dt * 1000;
    if (this.spawnTimerMs > 0) return;
    // DDA 节奏微调：压力高则生成更密（间隔更短）
    this.spawnTimerMs = enemySpawnInterval(this.stage) * cadenceMultiplier(this.dda);
    // 找一个不被占据的出生点
    const spots = [...this.world.enemySpawns];
    // shuffle
    for (let i = spots.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [spots[i], spots[j]] = [spots[j], spots[i]];
    }
    for (const sp of spots) {
      const rect = { x: sp.x, y: sp.y, w: TANK_SIZE, h: TANK_SIZE };
      let free = this.world.canTankFit(rect);
      for (const t of this.allTanks()) {
        if (!t.alive) continue;
        if (
          t.rect.x < rect.x + rect.w &&
          t.rect.x + t.rect.w > rect.x &&
          t.rect.y < rect.y + rect.h &&
          t.rect.y + t.rect.h > rect.y
        ) {
          free = false;
          break;
        }
      }
      if (!free) continue;
      const kind = rollEnemyKind(aiTier(this.stage), this.rng);
      // DDA 微调：压力高则敌人更快、开火更勤（只动连续量纲，不动血量）
      const intensity = intensityMultiplier(this.dda);
      const cadence = cadenceMultiplier(this.dda);
      const e = new Enemy(
        kind,
        sp.x,
        sp.y,
        enemyHp(this.stage),
        enemySpeed(this.stage) * intensity,
        enemyRank(this.stage),
      );
      e.aiFireCooldownMs = enemyFireCd(this.stage) * cadence * (0.5 + this.rng());
      e.invulnMs = 1200;
      this.enemies.push(e);
      this.enemySpawnQueue--;
      break;
    }
  }

  /** 在 Boss 关生成一个 Boss（选离基地最远的出生点，让玩家有反应空间）。 */
  private spawnBoss(): void {
    this.bossSpawned = true;
    const baseC = rectCenter(this.world.baseRect());
    let best = this.world.enemySpawns[0];
    let bestD = -1;
    for (const sp of this.world.enemySpawns) {
      const d = (sp.x - baseC.x) ** 2 + (sp.y - baseC.y) ** 2;
      if (d > bestD) {
        bestD = d;
        best = sp;
      }
    }
    const boss = new Enemy(
      'boss',
      best.x,
      best.y,
      bossHp(this.stage),
      enemySpeed(this.stage),
      enemyRank(this.stage),
    );
    boss.hp = bossHp(this.stage);
    boss.maxHp = bossHp(this.stage);
    boss.invulnMs = 800;
    boss.barrageCooldownMs = bossBarrageInterval(this.stage);
    this.enemies.push(boss);
  }

  /** Boss 齐射：按间隔向四个正向 + 高档位斜向同时开火。 */
  private updateBossBarrage(dt: number): void {
    for (const boss of this.enemies) {
      if (!boss.alive || !boss.isBoss) continue;
      boss.barrageCooldownMs -= dt * 1000;
      if (boss.barrageCooldownMs > 0) continue;
      boss.barrageCooldownMs = bossBarrageInterval(this.stage);
      const spec = boss.spec();
      const c = boss.center;
      const off = TANK_SIZE / 2 + 2;
      const shots: Bullet[] = [];
      for (const dir of BOSS_TURRET_DIRS) {
        const m = muzzleFor(c, dir, off);
        shots.push(new Bullet(spec, boss, dir, m));
      }
      // 斜向弹（旋转 up 方向的子弹）
      for (const angle of bossDiagonalAngles(this.stage)) {
        const b = new Bullet(spec, boss, 'up', { x: c.x, y: c.y });
        const speed = spec.speed;
        b.vx = Math.cos(angle) * speed;
        b.vy = Math.sin(angle) * speed;
        shots.push(b);
      }
      this.bullets.push(...shots);
      for (const b of shots) {
        this.renderer.addMuzzle(
          b.center.x,
          b.center.y,
          b.spec.color,
          b.spec.id,
          Math.atan2(b.vy, b.vx),
        );
      }
      this.sound.fire(spec.id);
    }
  }

  private reapDead(): void {
    for (const e of this.enemies) {
      if (e.alive || (e as unknown as { _reaped?: boolean })._reaped) continue;
      (e as unknown as { _reaped?: boolean })._reaped = true;
      const c = e.center;
      this.renderer.addExplosion(c.x, c.y, 24, '#fb923c');
      this.sound.play('explosion');
      if (this.player) {
        this.player.score += Math.round(KILL_SCORE * e.scoreMul);
        this.player.kills += 1;
      }
      // 掉落道具
      const chance = 0.1 + e.dropChanceBoost;
      if (this.rng() < chance) {
        this.dropPowerUp(c);
      }
    }
    // 玩家死亡处理
    if (this.player && !this.player.alive && this.respawnTimerS <= 0) {
      const c = this.player.center;
      this.renderer.addExplosion(c.x, c.y, 32, '#22c55e');
      this.respawnTimerS = RESPAWN_DELAY;
    }
    this.enemies = this.enemies.filter((e) => e.alive);
  }

  private dropPowerUp(pos: Vec2): void {
    const pool: PowerUp['kind'][] = [
      'star',
      'shield',
      'life',
      'bomb',
      'freezeAll',
      'speed',
      'rapid',
      'regen',
    ];
    const kind = pool[Math.floor(this.rng() * pool.length)];
    this.powerUps.push(new PowerUp(kind, pos.x, pos.y));
  }

  private checkPowerUpPickup(): void {
    if (!this.player || !this.player.alive) return;
    for (const p of this.powerUps) {
      if (!p.alive) continue;
      if (
        this.player.rect.x < p.rect.x + p.rect.w &&
        this.player.rect.x + this.player.rect.w > p.rect.x &&
        this.player.rect.y < p.rect.y + p.rect.h &&
        this.player.rect.y + this.player.rect.h > p.rect.y
      ) {
        this.applyPowerUp(p.kind);
        this.sound.play(p.kind === 'freezeAll' ? 'freeze' : 'pickup');
        p.destroy();
      }
    }
  }

  private applyPowerUp(kind: PowerUp['kind']): void {
    if (!this.player) return;
    switch (kind) {
      case 'star':
        this.player.score += 300;
        break;
      case 'shield':
        this.player.invulnMs = 6000;
        break;
      case 'life':
        this.player.lives = Math.min(9, this.player.lives + 1);
        break;
      case 'bomb': {
        // 清屏：对全部敌人造成 2 点伤害
        for (const e of this.enemies) {
          if (!e.alive) continue;
          e.takeHit(this.player, 2, BULLET_SPECS.heavy);
          this.renderer.addExplosion(e.center.x, e.center.y, 30, '#fb923c');
        }
        break;
      }
      case 'freezeAll':
        for (const e of this.enemies) {
          if (!e.alive) continue;
          e.freezeMs = Math.max(e.freezeMs, 4000);
        }
        break;
      case 'speed':
      case 'rapid':
      case 'regen': {
        // 持续增益：叠加一层，并保留到本局结束
        const buff = powerUpToBuff(kind);
        if (buff) {
          this.buffs = addBuff(this.buffs, buff);
          this.applyBuffsToPlayer();
          if (buff === 'regen') this.regenTimerMs = regenIntervalMs(this.buffs);
        }
        break;
      }
    }
  }

  /**
   * DDA 受创检测：本帧玩家生命下降视为丢命，喂给 DDA 减压状态机，
   * 并标记本关受创（通关时据此决定是否加压）。
   */
  private trackDamageForDda(): void {
    if (!this.player) return;
    if (this.player.lives < this.prevLives) {
      this.stageTookDamage = true;
      // 每丢一条命登记一次（一帧内理论只丢一条）
      this.dda = registerDeath(this.dda);
    }
    this.prevLives = this.player.lives;
    // 玩家掉血（未死）也算受创
    if (this.player.alive && this.player.hp < this.player.maxHp) {
      this.stageTookDamage = true;
    }
  }

  /** 依据当前 buff 状态刷新玩家的移速/射速倍率。 */
  private applyBuffsToPlayer(): void {
    if (!this.player) return;
    this.player.speedMul = speedMultiplier(this.buffs);
    this.player.cooldownMul = cooldownMultiplier(this.buffs);
  }

  /** 护盾再生：按 buff 间隔恢复玩家 1 点 HP，直至上限。 */
  private tickRegen(dt: number): void {
    if (!this.player || !this.player.alive) return;
    const interval = regenIntervalMs(this.buffs);
    if (!Number.isFinite(interval)) return; // 无 regen buff
    if (this.player.hp >= this.player.maxHp) {
      this.regenTimerMs = interval;
      return;
    }
    this.regenTimerMs -= dt * 1000;
    if (this.regenTimerMs <= 0) {
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + 1);
      this.regenTimerMs = interval;
      this.sound.play('pickup');
    }
  }

  private onBaseHit(): void {
    const bc = rectCenter(this.world.baseRect());
    this.renderer.addExplosion(bc.x, bc.y, 40, '#f43f5e');
    this.sound.play('baseHit');
    // 基地被击也算本关受创，供 DDA 判定
    this.stageTookDamage = true;
  }

  /** 基地失守优先消耗备用生命并紧急维修；没有备用生命才判定整局失败。 */
  private handleBaseBreach(): boolean {
    if (this.world.baseAlive) return false;
    const outcome = resolveBaseBreach(this.player?.lives ?? 0, this.world.baseMaxHp);
    if (outcome.gameOver || !this.player) return true;

    this.player.lives = outcome.lives;
    this.prevLives = outcome.lives;
    this.dda = registerDeath(this.dda);
    this.stageTookDamage = true;
    this.world.repairBase(outcome.repairHp, BASE_REPAIR_SHIELD_MS);
    const bc = rectCenter(this.world.baseRect());
    this.renderer.addExplosion(bc.x, bc.y, 52, '#38bdf8');
    this.sound.play('pickup');
    return false;
  }

  private async handleStageClear(): Promise<void> {
    if (this.status !== 'playing') return;
    this.status = 'stage-clear';
    // DDA：本关无伤则加压连击 +1，受创则打断连击
    this.dda = registerStageClear(this.dda, this.stageTookDamage);
    const bonus = stageBonus(this.stage);
    const totalBefore = this.player?.score ?? 0;
    if (this.player) this.player.score += bonus;
    const tierUp = this.stage % 5 === 0;
    this.sound.play('stageClear');
    await this.overlay.showStageClear({
      stage: this.stage,
      stageScore: bonus,
      totalScore: (this.player?.score ?? totalBefore),
      kills: this.player?.kills ?? 0,
      tierUp,
    });
    this.overlay.hide();
    this.input.reset();
    // 拾取三选一
    await this.handlePickup();
    // 进入下一关
    this.enterStage(this.stage + 1);
    this.status = 'playing';
    // 新关卡开头存档（刷新可从这里续玩）
    this.saveCheckpoint();
  }

  private async handlePickup(): Promise<void> {
    this.status = 'pickup';
    const choices = rollPickupChoices(this.rng, 3, this.stage);
    const chosen = await this.overlay.showPickup(
      this.stage,
      choices,
      // 已拥有该弹种时返回当前等级（>0），未拥有返回 0（视为新弹种）。
      (k) => (this.inventoryOrder.includes(k) && this.player ? this.player.levelOf(k) : 0),
    );
    if (this.player) {
      if (this.inventoryOrder.includes(chosen)) {
        // 已拥有该弹种 → 重复拾取升级
        this.player.upgradeBullet(chosen);
      } else {
        this.inventoryOrder.push(chosen);
      }
      this.player.weaponEnergy = this.player.maxWeaponEnergy;
    }
    this.sound.play('pickup');
    this.overlay.hide();
    this.input.reset();
  }

  private async togglePause(): Promise<void> {
    if (this.status !== 'playing') return;
    this.resetWeaponInput();
    this.status = 'paused';
    const choice = await this.overlay.showExitConfirm('single');
    this.overlay.hide();
    this.input.reset();
    if (choice === 'resume') {
      this.status = 'playing';
    } else {
      // 返回主菜单：直接结束当前局
      this.status = 'menu';
      this.player = null;
      this.enemies = [];
      this.bullets = [];
      this.powerUps = [];
      await this.showMenu();
    }
  }

  private async handleGameOver(): Promise<void> {
    if (this.status === 'game-over') return;
    this.status = 'game-over';
    // 本局结束，清除续玩存档
    clearRun();
    const info = {
      stage: this.stage,
      score: this.player?.score ?? 0,
      kills: this.player?.kills ?? 0,
      name: this.playerName,
    };
    // 触发一次基地大爆炸
    const bc = rectCenter(this.world.baseRect());
    this.renderer.addExplosion(bc.x, bc.y, 80, '#ef4444');
    this.sound.play('gameOver');
    const choice = await this.overlay.showGameOver(info);
    this.overlay.hide();
    this.input.reset();
    if (choice === 'restart') {
      this.startNewRun();
    } else {
      this.player = null;
      this.enemies = [];
      this.bullets = [];
      this.powerUps = [];
      await this.showMenu();
    }
  }

  private allTanks(): Iterable<Player | Enemy> {
    const p = this.player;
    const es = this.enemies;
    return {
      *[Symbol.iterator]() {
        if (p) yield p;
        for (const e of es) yield e;
      },
    };
  }

  private tankArray(): (Player | Enemy)[] {
    return this.player ? [this.player, ...this.enemies] : [...this.enemies];
  }

  private render(): void {
    if (!this.world) {
      // 未开始，画一个空背景
      return;
    }
    this.renderer.draw({
      world: this.world,
      camera: this.camera,
      player: this.player,
      enemies: this.enemies,
      bullets: this.bullets,
      powerUps: this.powerUps,
      viewW: this.viewW,
      viewH: this.viewH,
      // 战争迷雾：仅围绕玩家显示一圈可视范围
      fog:
        this.stageEvent === 'fog' && this.player
          ? { x: this.player.center.x, y: this.player.center.y, radius: fogRadiusPx(TILE) }
          : null,
      weaponCharge:
        this.laserCharging && this.player?.alive
          ? {
              center: this.player.muzzle(),
              dir: this.player.dir,
              ratio: laserChargeRatio(this.laserChargeMs),
              color: this.player.spec().color,
            }
          : null,
    });
  }

  dispose(): void {
    if (this.rafId) cancelAnimationFrame(this.rafId);
  }
}

function rotatedBullet(spec: BulletSpec, owner: Player | Enemy, dir: Dir, muzzle: Vec2, angle: number): Bullet {
  const b = new Bullet(spec, owner, dir, muzzle);
  const speed = Math.hypot(b.vx, b.vy) || spec.speed;
  const base = Math.atan2(b.vy, b.vx);
  const na = base + angle;
  b.vx = Math.cos(na) * speed;
  b.vy = Math.sin(na) * speed;
  return b;
}

/** 依据中心点、方向与偏移算出枪口坐标（Boss 多炮塔齐射用）。 */
function muzzleFor(center: Vec2, dir: Dir, off: number): Vec2 {
  switch (dir) {
    case 'up':
      return { x: center.x, y: center.y - off };
    case 'down':
      return { x: center.x, y: center.y + off };
    case 'left':
      return { x: center.x - off, y: center.y };
    case 'right':
      return { x: center.x + off, y: center.y };
  }
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
