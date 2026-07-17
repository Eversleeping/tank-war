import type { BulletKind } from './BulletKind.ts';
import type { AudioEngine } from './Audio.ts';
import { BULLET_SPECS } from './BulletTypes.ts';
import { MAX_BULLET_LEVEL } from './BulletLevels.ts';
import {
  leaderboard,
  savePlayerName,
  type ScoreEntry,
} from '../storage/leaderboard.ts';
import {
  LEADERBOARD_CATEGORIES,
  LEADERBOARD_LABELS,
  type LeaderboardCategory,
} from '../storage/leaderboardTypes.ts';
import { paginate } from './pagination.ts';
import type { OnlineMode } from '../multiplayer/protocol.ts';

export interface MenuResult {
  action: 'start' | 'leaderboard' | 'continue';
  name: string;
}

/** 弹窗层：负责主菜单、通关、拾取三选一、Game Over、排行榜等 UI。 */
export class Overlay {
  private root: HTMLDivElement;
  private audio: AudioEngine | null;
  private pickupCleanup: (() => void) | null = null;

  constructor(root: HTMLDivElement, audio: AudioEngine | null = null) {
    this.root = root;
    this.audio = audio;
  }

  hide(): void {
    this.clearPickupInteraction();
    this.root.classList.add('hidden');
    this.root.classList.remove('overlay-menu');
    this.root.innerHTML = '';
  }

  private show(html: string, mode = ''): void {
    this.clearPickupInteraction();
    this.root.classList.remove('hidden', 'overlay-menu');
    if (mode) this.root.classList.add(mode);
    this.root.innerHTML = html;
  }

  /**
   * 主菜单。要求玩家先输入代号才能开始，代号会同步落地到 localStorage。
   * 返回 { action, name }，action 为 'start' 或 'leaderboard'。
   */
  showMenu(bestScore: number | null, initialName: string, hasSaved = false): Promise<MenuResult> {
    return new Promise((resolve) => {
      const safeName = escapeAttr(initialName);
      this.show(`
        <div class="menu-hero">
          <div class="menu-bg" aria-hidden="true">
            <div class="menu-grid-lines"></div>
            <div class="menu-glow menu-glow-a"></div>
            <div class="menu-glow menu-glow-b"></div>
            <div class="menu-scan"></div>
          </div>
          <div class="menu-wrap">
            <div class="menu-topbar">
              <span class="menu-tag"><i class="menu-dot"></i> SYSTEM ONLINE</span>
              <button class="menu-mute" data-act="mute" type="button">${muteLabel(this.audio?.isMuted ?? false)}</button>
            </div>
            <div class="menu-layout">
              <section class="menu-lead">
                <div class="menu-kicker">ENDLESS TANK WARFARE</div>
                <h1 class="menu-title"><span class="menu-title-main">坦克大战</span><span class="menu-title-sub">无 尽 版</span></h1>
                <p class="menu-tagline">保护基地，穿越永不停歇的战场。<br/>每 <b>5</b> 关一次难度跃迁，你能守到第几关？</p>
                <div class="menu-controls">
                  <div class="menu-ctrl"><span><kbd>← ↑ → ↓</kbd> <kbd>WASD</kbd></span><label>移动</label></div>
                  <div class="menu-ctrl"><span><kbd>Space</kbd> <kbd>鼠标左键</kbd></span><label>开火</label></div>
                  <div class="menu-ctrl"><span><kbd>Q</kbd> <kbd>E</kbd> <kbd>滚轮</kbd></span><label>切换弹种</label></div>
                  <div class="menu-ctrl"><span><kbd>1</kbd> – <kbd>9</kbd></span><label>直接选弹种</label></div>
                  <div class="menu-ctrl"><span><kbd>Esc</kbd></span><label>暂停</label></div>
                </div>
              </section>
              <aside class="menu-card">
                <div class="menu-card-title">作战面板</div>
                ${
                  bestScore != null
                    ? `<div class="menu-best"><label>历史最高分</label><span>${bestScore}</span></div>`
                    : ''
                }
                <div class="menu-field">
                  <label class="menu-field-label" for="player-name">你的代号</label>
                  <input id="player-name" class="input-name" name="name" maxlength="16"
                    placeholder="留下你的代号"
                    value="${safeName}"
                    autocomplete="off" spellcheck="false" />
                  <div class="menu-field-hint">战绩会自动以这个名字提交到排行榜</div>
                </div>
                <div class="menu-actions">
                  ${hasSaved ? '<button class="btn btn-primary btn-block" data-act="continue">继续单人存档</button>' : ''}
                  <button class="btn btn-block ${hasSaved ? '' : 'btn-primary'}" data-act="start" disabled>开始新战斗</button>
                  <button class="btn btn-ghost btn-block" data-act="leaderboard">🏆 排行榜</button>
                </div>
              </aside>
            </div>
          </div>
        </div>
      `, 'overlay-menu');
      const start = this.root.querySelector<HTMLButtonElement>('[data-act="start"]')!;
      const lb = this.root.querySelector<HTMLButtonElement>('[data-act="leaderboard"]')!;
      const input = this.root.querySelector<HTMLInputElement>('#player-name')!;

      const readName = (): string => input.value.trim();
      const syncEnable = (): void => {
        start.disabled = readName().length === 0;
      };
      syncEnable();
      // 默认聚焦：有旧名字则聚焦"开始"，方便直接回车；没有则聚焦输入框
      if (readName().length > 0) start.focus();
      else input.focus();

      input.addEventListener('input', syncEnable);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && readName().length > 0) {
          e.preventDefault();
          finish('start');
        }
      });

      const finish = (action: MenuResult['action']): void => {
        // 续玩沿用存档代号即可，输入为空也放行；开始新局才要求非空名字
        const typed = readName();
        const cleaned = action === 'continue' && typed.length === 0 ? initialName : savePlayerName(typed);
        resolve({ action, name: cleaned });
      };
      start.onclick = () => {
        if (readName().length === 0) return;
        finish('start');
      };
      lb.onclick = () => finish('leaderboard');

      // 续玩按钮：存档已含代号，无需再校验输入
      const cont = this.root.querySelector<HTMLButtonElement>('[data-act="continue"]');
      if (cont) {
        cont.focus();
        cont.onclick = () => finish('continue');
      }

      // 静音按钮：就地切换，不 resolve 菜单
      const mute = this.root.querySelector<HTMLButtonElement>('[data-act="mute"]');
      if (mute) {
        mute.onclick = () => {
          const muted = this.audio ? this.audio.toggleMute() : false;
          mute.textContent = muteLabel(muted);
        };
      }
    });
  }

  showModeSelect(hasSaved = false): Promise<'single' | OnlineMode | 'back'> {
    return new Promise((resolve) => {
      this.show(`
        <div class="panel panel-modes">
          <div class="ribbon">作战模式</div>
          <h2>选择战场协议</h2>
          <div class="mode-grid">
            <button class="mode-card is-single" data-mode="single">
              <span class="mode-count">1P</span>
              <strong>单人无尽模式</strong>
              <p>独自守卫基地，挑战无限关卡、Boss 与动态难度。</p>
              <em>${hasSaved ? '新建单人战局' : '本地游玩'}</em>
            </button>
            <button class="mode-card is-duo" data-mode="duo">
              <span class="mode-count">2P</span>
              <strong>双人无尽模式</strong>
              <p>两名玩家共享基地和装甲储备，合作清理无限敌潮。</p>
              <em>快速匹配 / 房间组队</em>
            </button>
            <button class="mode-card is-brawl" data-mode="brawl">
              <span class="mode-count">10P</span>
              <strong>10 人生存模式</strong>
              <p>随机战场与资源、动态缩圈，每人 5 条命，最后生存者获胜。</p>
              <em>快速匹配 / 房间组队</em>
            </button>
          </div>
          <button class="btn btn-ghost" data-act="back">返回主菜单</button>
        </div>
      `);
      this.root.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((button) => {
        button.onclick = () => resolve(button.dataset.mode as 'single' | OnlineMode);
      });
      this.root.querySelector<HTMLButtonElement>('[data-act="back"]')!.onclick = () => resolve('back');
    });
  }

  /**
   * 拾取三选一。新武器永久解锁，重复拾取升级并恢复满能量。
   */
  showPickup(
    stage: number,
    choices: BulletKind[],
    ownedLevel?: (kind: BulletKind) => number,
    remainingMs?: number,
  ): Promise<BulletKind> {
    return new Promise((resolve) => {
      const cards = choices
        .map((k, i) => {
          const s = BULLET_SPECS[k];
          const lv = ownedLevel ? ownedLevel(k) : 0;
          // lv > 0 表示已拥有，本次拾取会升级到 lv+1；否则是新增弹种。
          const badge =
            lv > 0
              ? lv >= MAX_BULLET_LEVEL
                ? `<div class="card-upgrade is-max">Lv${lv} · 满级</div>`
                : `<div class="card-upgrade">升级 Lv${lv} → Lv${lv + 1}</div>`
              : `<div class="card-upgrade is-new">新弹种</div>`;
          return `
            <button class="card" data-i="${i}" style="--c:${s.color}">
              <div class="card-rarity">${'★'.repeat(s.rarity)}</div>
              <div class="card-name">${s.name}</div>
              ${badge}
              <div class="card-count">永久解锁 · 消耗 ${s.energyCost} 能量</div>
              <div class="card-stat"><label>伤害</label><span>${s.damage}</span></div>
              <div class="card-stat"><label>射速</label><span>${(1000 / s.cooldown).toFixed(1)} 发/秒</span></div>
              <div class="card-desc">${s.desc}</div>
              <div class="card-hotkey">${i + 1}</div>
            </button>
          `;
        })
        .join('');
      this.show(`
        <div class="panel panel-pickup">
          <div class="ribbon">第 ${stage} 关 · 战利品</div>
          <h2>选择一项武器协议</h2>
          ${pickupCountdownMarkup('自动选择', remainingMs)}
          <div class="cards">${cards}</div>
          <p class="tip">按 <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> 或点击选择</p>
        </div>
      `);
      const buttons = Array.from(this.root.querySelectorAll<HTMLButtonElement>('.card'));
      buttons[0]?.focus();
      let active = true;
      const cleanup = (): void => {
        if (!active) return;
        active = false;
        window.removeEventListener('keydown', onKey);
        buttons.forEach((button) => {
          button.onclick = null;
        });
        if (this.pickupCleanup === cleanup) this.pickupCleanup = null;
      };
      const pick = (i: number): void => {
        if (!active) return;
        cleanup();
        resolve(choices[i]);
      };
      buttons.forEach((btn, i) => (btn.onclick = () => pick(i)));
      const onKey = (e: KeyboardEvent): void => {
        if (e.code === 'Digit1' || e.code === 'Numpad1') pick(0);
        if (e.code === 'Digit2' || e.code === 'Numpad2') pick(1);
        if (e.code === 'Digit3' || e.code === 'Numpad3') pick(2);
      };
      window.addEventListener('keydown', onKey);
      this.pickupCleanup = cleanup;
    });
  }

  showPickupWaiting(stage: number, selectorName: string, remainingMs?: number): void {
    this.show(`
      <div class="panel panel-pickup">
        <div class="ribbon">第 ${stage} 关 · 战利品</div>
        <h2>等待房主选择共享武器</h2>
        ${pickupCountdownMarkup('房主选择', remainingMs)}
        <p class="tip">${escapeHtml(selectorName)} 正在进行三选一，选择结果将同时应用给两名玩家。</p>
      </div>
    `);
  }

  updatePickupCountdown(remainingMs: number): void {
    const el = this.root.querySelector<HTMLElement>('[data-el="pickup-countdown"]');
    if (!el) return;
    const seconds = pickupSeconds(remainingMs).toString();
    if (el.textContent !== seconds) el.textContent = seconds;
  }

  private clearPickupInteraction(): void {
    this.pickupCleanup?.();
    this.pickupCleanup = null;
  }

  /** 通关小结。用户点击"继续"后 resolve。 */
  showStageClear(info: {
    stage: number;
    stageScore: number;
    totalScore: number;
    kills: number;
    tierUp: boolean;
  }): Promise<void> {
    return new Promise((resolve) => {
      this.show(`
        <div class="panel panel-clear">
          <h2>第 ${info.stage} 关 · 完成</h2>
          <div class="clear-stats">
            <div><label>本关得分</label><span>+${info.stageScore}</span></div>
            <div><label>累计得分</label><span>${info.totalScore}</span></div>
            <div><label>累计击杀</label><span>${info.kills}</span></div>
          </div>
          ${info.tierUp ? '<div class="tier-up">难度升级！敌人更聪明，地图更大。</div>' : ''}
          <button class="btn btn-primary" data-act="next">继续下一关</button>
        </div>
      `);
      const btn = this.root.querySelector<HTMLButtonElement>('[data-act="next"]')!;
      btn.focus();
      btn.onclick = () => resolve();
      const onKey = (e: KeyboardEvent): void => {
        if (e.code === 'Enter' || e.code === 'Space') {
          window.removeEventListener('keydown', onKey);
          resolve();
        }
      };
      window.addEventListener('keydown', onKey);
    });
  }

  /**
   * Game Over 面板。用主菜单登记的名字自动提交，用户不需要再输入名字。
   * 面板初次显示时立即写入战绩（如果分数 > 0），按钮上直接展示状态。
   */
  async showGameOver(info: {
    stage: number;
    score: number;
    kills: number;
    name: string;
  }): Promise<'restart' | 'menu'> {
    const canRank = info.score > 0;
    const safeName = escapeHtml(info.name);

    // 立即提交战绩，避免玩家点关闭按钮时错过
    let submitState: 'pending' | 'done' | 'failed' | 'skipped' = canRank ? 'pending' : 'skipped';
    const submitPromise = canRank
      ? leaderboard
          .submit({
            mode: 'single',
            name: info.name,
            score: info.score,
            stage: info.stage,
            kills: info.kills,
          })
          .then(
            () => {
              submitState = 'done';
            },
            () => {
              submitState = 'failed';
            },
          )
      : Promise.resolve();

    const renderStatus = (): string => {
      if (submitState === 'skipped') return '';
      if (submitState === 'pending') return '<div class="submit-hint">正在记入排行榜…</div>';
      if (submitState === 'failed') return '<div class="submit-hint submit-failed">服务器暂时不可用，本次成绩未能提交</div>';
      return `<div class="submit-hint submit-done">已以 <b>${safeName}</b> 记入排行榜</div>`;
    };

    const paint = (): void => {
      this.show(`
        <div class="panel panel-over">
          <h2>基地陷落</h2>
          <p class="over-line">指挥官 <b>${safeName}</b>，你守到了 <b>第 ${info.stage} 关</b>。</p>
          <div class="clear-stats">
            <div><label>最终得分</label><span>${info.score}</span></div>
            <div><label>击杀数</label><span>${info.kills}</span></div>
          </div>
          ${renderStatus()}
          <div class="btn-row">
            <button class="btn btn-primary" data-act="restart">再战一场</button>
            <button class="btn" data-act="menu">返回主菜单</button>
            <button class="btn" data-act="board">查看排行榜</button>
          </div>
        </div>
      `);
      const restart = this.root.querySelector<HTMLButtonElement>('[data-act="restart"]')!;
      restart.focus();
    };

    // 允许玩家在提交完成前就选择下一步；等待提交后再实际跳走
    while (true) {
      paint();
      // 提交完成后刷新面板显示"已记入"（首次显示是 pending 时）
      void submitPromise.then(() => {
        if ((submitState === 'done' || submitState === 'failed') && this.root.querySelector('.panel-over')) paint();
      });
      const act = await this.waitForAction<'restart' | 'menu' | 'board'>(['restart', 'menu', 'board']);
      await submitPromise;
      if (act === 'board') {
        await this.showLeaderboard();
        // 重画 Game Over 面板，继续循环
        continue;
      }
      return act;
    }
  }

  /** 等待 panel 内出现 data-act 属性等于其中之一的按钮被点击。 */
  private waitForAction<T extends string>(acts: readonly T[]): Promise<T> {
    return new Promise((resolve) => {
      const onClick = (e: MouseEvent): void => {
        const target = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-act]');
        if (!target) return;
        const act = target.getAttribute('data-act') as T | null;
        if (!act || !acts.includes(act)) return;
        this.root.removeEventListener('click', onClick);
        resolve(act);
      };
      this.root.addEventListener('click', onClick);
    });
  }

  /**
   * 排行榜面板。服务器统一提供单人、双人和十人三类榜单。
   */
  async showLeaderboard(): Promise<void> {
    const PAGE_SIZE = 20;
    let tab: LeaderboardCategory = 'single';
    let page = 0;
    const cache: Record<LeaderboardCategory, ScoreEntry[] | null> = {
      single: null,
      duo: null,
      brawl: null,
    };
    const errors: Record<LeaderboardCategory, boolean> = {
      single: false,
      duo: false,
      brawl: false,
    };

    const fetchEntries = async (mode: LeaderboardCategory): Promise<ScoreEntry[]> => {
      if (cache[mode]) return cache[mode]!;
      try {
        const list = await leaderboard.top(mode, 1000);
        cache[mode] = list;
        errors[mode] = false;
        return list;
      } catch {
        cache[mode] = null;
        errors[mode] = true;
        return [];
      }
    };

    return new Promise((resolve) => {
      let loading = false;

      const render = async (): Promise<void> => {
        loading = true;
        this.paintBoard({ tab, entries: [], page, pageSize: PAGE_SIZE, loading: true, error: false });
        const entries = await fetchEntries(tab);
        loading = false;
        this.paintBoard({ tab, entries, page, pageSize: PAGE_SIZE, loading: false, error: errors[tab] });
        bind(entries);
      };

      const bind = (entries: ScoreEntry[]): void => {
        const close = this.root.querySelector<HTMLButtonElement>('[data-act="close"]');
        if (close) {
          close.focus();
          close.onclick = () => finish();
        }
        // 页签切换
        this.root.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((btn) => {
          btn.onclick = () => {
            const next = btn.getAttribute('data-tab') as LeaderboardCategory;
            if (next === tab || loading) return;
            tab = next;
            page = 0;
            void render();
          };
        });
        // 翻页
        const info = paginate(entries.length, page, PAGE_SIZE);
        const prev = this.root.querySelector<HTMLButtonElement>('[data-act="prev"]');
        const next = this.root.querySelector<HTMLButtonElement>('[data-act="next"]');
        if (prev) prev.onclick = () => {
          if (info.hasPrev) { page = info.page - 1; void render(); }
        };
        if (next) next.onclick = () => {
          if (info.hasNext) { page = info.page + 1; void render(); }
        };
      };

      const finish = (): void => {
        window.removeEventListener('keydown', onKey);
        resolve();
      };
      const onKey = (e: KeyboardEvent): void => {
        if (e.code === 'Escape') finish();
        else if (e.code === 'ArrowLeft') {
          const info = paginate(cache[tab]?.length ?? 0, page, PAGE_SIZE);
          if (info.hasPrev) { page = info.page - 1; void render(); }
        } else if (e.code === 'ArrowRight') {
          const info = paginate(cache[tab]?.length ?? 0, page, PAGE_SIZE);
          if (info.hasNext) { page = info.page + 1; void render(); }
        }
      };
      window.addEventListener('keydown', onKey);
      void render();
    });
  }

  /** 绘制排行榜面板的一帧（页签 + 分页表格）。 */
  private paintBoard(s: {
    tab: LeaderboardCategory;
    entries: ScoreEntry[];
    page: number;
    pageSize: number;
    loading: boolean;
    error: boolean;
  }): void {
    const info = paginate(s.entries.length, s.page, s.pageSize);
    const columnCount = s.tab === 'brawl' ? 5 : 6;
    const tabs = `<div class="board-tabs" role="tablist" aria-label="排行榜模式">
      ${LEADERBOARD_CATEGORIES.map((mode) => `<button class="board-tab ${s.tab === mode ? 'is-active' : ''}" data-tab="${mode}" role="tab" aria-selected="${s.tab === mode}">${LEADERBOARD_LABELS[mode]}</button>`).join('')}
    </div>`;

    let body: string;
    if (s.loading) {
      body = `<tr><td colspan="${columnCount}" class="empty">加载中…</td></tr>`;
    } else if (s.error) {
      body = `<tr><td colspan="${columnCount}" class="empty board-error">服务器暂时不可用，请稍后再试。</td></tr>`;
    } else if (s.entries.length === 0) {
      body = `<tr><td colspan="${columnCount}" class="empty">还没有战绩，快去打第一名。</td></tr>`;
    } else {
      body = s.entries
        .slice(info.start, info.end)
        .map((e, i) => {
          const rank = info.start + i;
          return `<tr class="${rank < 3 ? 'top' : ''}">
            <td class="rk">#${rank + 1}</td>
            <td class="nm">${escapeHtml(e.name)}</td>
            <td class="sc">${e.score}</td>
            ${s.tab === 'brawl' ? '' : `<td class="st">第 ${e.stage} 关</td>`}
            <td class="kl">${e.kills} 杀</td>
            <td class="dt">${formatDate(e.createdAt)}</td>
          </tr>`;
        })
        .join('');
    }

    const pager =
      s.entries.length > s.pageSize
        ? `<div class="board-pager">
            <button class="btn btn-small" data-act="prev" ${info.hasPrev ? '' : 'disabled'}>‹ 上一页</button>
            <span class="board-page">第 ${info.page + 1} / ${info.pageCount} 页</span>
            <button class="btn btn-small" data-act="next" ${info.hasNext ? '' : 'disabled'}>下一页 ›</button>
          </div>`
        : '';

    this.show(`
      <div class="panel panel-board">
        <h2>排行榜</h2>
        ${tabs}
        <div class="board-scroll">
          <table class="board-table ${s.tab === 'brawl' ? 'board-table-brawl' : ''}">
            <thead>
              <tr><th>#</th><th>代号</th><th>分数</th>${s.tab === 'brawl' ? '' : '<th>关卡</th>'}<th>击杀</th><th class="dt">时间</th></tr>
            </thead>
            <tbody>${body}</tbody>
          </table>
        </div>
        ${pager}
        <div class="btn-row">
          <button class="btn btn-primary" data-act="close">关闭</button>
        </div>
      </div>
    `);
  }

  /** 暂停面板。 */
  showExitConfirm(mode: 'single' | 'online'): Promise<'resume' | 'menu'> {
    return new Promise((resolve) => {
      this.show(`
        <div class="panel panel-pause">
          <h2>退出当前对局？</h2>
          <p class="over-line">${mode === 'online'
            ? '联机战斗不会暂停，确认后将离开当前房间。'
            : '确认后将返回主菜单。'}</p>
          <div class="btn-row">
            <button class="btn btn-primary" data-act="resume">继续游戏</button>
            <button class="btn" data-act="menu">确认退出</button>
          </div>
        </div>
      `);
      const resume = this.root.querySelector<HTMLButtonElement>('[data-act="resume"]')!;
      const menu = this.root.querySelector<HTMLButtonElement>('[data-act="menu"]')!;
      let settled = false;
      const finish = (choice: 'resume' | 'menu'): void => {
        if (settled) return;
        settled = true;
        window.removeEventListener('keydown', onKey);
        resolve(choice);
      };
      const onKey = (e: KeyboardEvent): void => {
        if (e.code === 'Escape') finish('resume');
      };
      resume.focus();
      resume.onclick = () => finish('resume');
      menu.onclick = () => finish('menu');
      window.addEventListener('keydown', onKey);
    });
  }
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}

function muteLabel(muted: boolean): string {
  return muted ? '🔇 音效已关' : '🔊 音效已开';
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}

function pickupCountdownMarkup(label: string, remainingMs?: number): string {
  if (remainingMs === undefined) return '';
  return `<div class="pickup-countdown"><span>${label}</span><strong data-el="pickup-countdown">${pickupSeconds(remainingMs)}</strong><span>秒</span></div>`;
}

function pickupSeconds(remainingMs: number): number {
  return Math.max(0, Math.ceil(remainingMs / 1000));
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  const p = (n: number): string => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
