// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { Overlay } from '../src/game/Overlay.ts';
import { AudioEngine } from '../src/game/Audio.ts';

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '<div id="overlay"></div>';
});

function mountMenu(hasSaved = false): { overlay: Overlay; audio: AudioEngine; root: HTMLDivElement } {
  const root = document.getElementById('overlay') as HTMLDivElement;
  const audio = new AudioEngine();
  const overlay = new Overlay(root, audio);
  // 不 await：只需要 DOM 被渲染出来即可检查按钮
  void overlay.showMenu(null, '测试指挥官', hasSaved);
  return { overlay, audio, root };
}

describe('主菜单静音按钮', () => {
  it('初始标签反映引擎静音状态', () => {
    const { root, audio } = mountMenu();
    const btn = root.querySelector<HTMLButtonElement>('[data-act="mute"]')!;
    expect(btn).toBeTruthy();
    // 默认非静音
    expect(audio.isMuted).toBe(false);
    expect(btn.textContent).toContain('开');
  });

  it('点击切换静音并更新标签与持久化', () => {
    const { root, audio } = mountMenu();
    const btn = root.querySelector<HTMLButtonElement>('[data-act="mute"]')!;
    btn.click();
    expect(audio.isMuted).toBe(true);
    expect(localStorage.getItem('tankwar/muted/v1')).toBe('1');
    expect(btn.textContent).toContain('关');
    btn.click();
    expect(audio.isMuted).toBe(false);
    expect(localStorage.getItem('tankwar/muted/v1')).toBe('0');
  });

  it('点击静音按钮不会关闭菜单', () => {
    const { root } = mountMenu();
    const btn = root.querySelector<HTMLButtonElement>('[data-act="mute"]')!;
    btn.click();
    // 当前全屏菜单根节点仍在
    expect(root.querySelector('.menu-hero')).toBeTruthy();
  });
});

describe('主菜单单人存档入口', () => {
  it('有存档时明确标注为单人存档', () => {
    const { root } = mountMenu(true);
    expect(root.querySelector<HTMLButtonElement>('[data-act="continue"]')?.textContent)
      .toBe('继续单人存档');
  });

  it('调用方禁用存档入口时不显示继续按钮', () => {
    const { root } = mountMenu(false);
    expect(root.querySelector('[data-act="continue"]')).toBeNull();
  });
});

describe('退出对局确认框', () => {
  it('单人模式必须点击确认退出才返回菜单', async () => {
    const root = document.getElementById('overlay') as HTMLDivElement;
    const overlay = new Overlay(root);
    const result = overlay.showExitConfirm('single');

    expect(root.querySelector('h2')?.textContent).toBe('退出当前对局？');
    root.querySelector<HTMLButtonElement>('[data-act="menu"]')!.click();
    await expect(result).resolves.toBe('menu');
  });

  it('联机模式可取消退出并继续游戏', async () => {
    const root = document.getElementById('overlay') as HTMLDivElement;
    const overlay = new Overlay(root);
    const result = overlay.showExitConfirm('online');

    expect(root.textContent).toContain('离开当前房间');
    root.querySelector<HTMLButtonElement>('[data-act="resume"]')!.click();
    await expect(result).resolves.toBe('resume');
  });
});

describe('联机战利品倒计时', () => {
  it('在房主选择和队友等待面板中同步更新剩余秒数', async () => {
    const root = document.getElementById('overlay') as HTMLDivElement;
    const overlay = new Overlay(root);
    const choice = overlay.showPickup(1, ['rapid', 'heavy', 'pierce'], () => 0, 30_000);

    expect(root.querySelector('[data-el="pickup-countdown"]')?.textContent).toBe('30');
    overlay.updatePickupCountdown(28_999);
    expect(root.querySelector('[data-el="pickup-countdown"]')?.textContent).toBe('29');

    root.querySelector<HTMLButtonElement>('.card')!.click();
    await expect(choice).resolves.toBe('rapid');

    overlay.showPickupWaiting(1, '房主', 30_000);
    expect(root.textContent).toContain('房主选择');
    overlay.updatePickupCountdown(19_001);
    expect(root.querySelector('[data-el="pickup-countdown"]')?.textContent).toBe('20');
  });

  it('面板被服务器结果关闭后不再响应旧的数字键', async () => {
    const root = document.getElementById('overlay') as HTMLDivElement;
    const overlay = new Overlay(root);
    let resolved = false;
    void overlay.showPickup(1, ['rapid', 'heavy', 'pierce'], () => 0, 30_000)
      .then(() => {
        resolved = true;
      });

    overlay.hide();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit1' }));
    await Promise.resolve();

    expect(resolved).toBe(false);
  });
});

describe('服务器排行榜面板', () => {
  it('只显示单人、双人和十人三个模式页签', async () => {
    const root = document.getElementById('overlay') as HTMLDivElement;
    const overlay = new Overlay(root);
    const result = overlay.showLeaderboard();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const tabs = [...root.querySelectorAll<HTMLButtonElement>('[data-tab]')];
    expect(tabs.map((tab) => tab.textContent)).toEqual(['单人榜', '双人榜', '十人榜']);
    expect(root.textContent).not.toContain('本地榜');
    expect(root.textContent).not.toContain('全球榜');

    root.querySelector<HTMLButtonElement>('[data-act="close"]')!.click();
    await result;
  });
});
