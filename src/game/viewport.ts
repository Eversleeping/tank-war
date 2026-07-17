export const COMBAT_SIDEBAR_WIDTH = 300;
export const COMBAT_VIEW_MAX_WIDTH = 1280;
export const COMBAT_VIEW_MAX_HEIGHT = 900;
export const COMBAT_SIDEBAR_BREAKPOINT = 900;

export interface CombatViewport {
  viewW: number;
  viewH: number;
  offsetX: number;
  offsetY: number;
  sidebar: boolean;
}

export function combatViewport(
  width: number,
  height: number,
  enableSidebar: boolean,
): CombatViewport {
  const windowW = Math.max(320, Math.floor(width));
  const windowH = Math.max(240, Math.floor(height));
  const sidebar = enableSidebar && windowW >= COMBAT_SIDEBAR_BREAKPOINT;
  const availableW = sidebar ? windowW - COMBAT_SIDEBAR_WIDTH : windowW;
  const viewW = sidebar ? Math.min(COMBAT_VIEW_MAX_WIDTH, availableW) : availableW;
  const viewH = sidebar ? Math.min(COMBAT_VIEW_MAX_HEIGHT, windowH) : windowH;
  return {
    viewW,
    viewH,
    offsetX: sidebar ? Math.floor((availableW - viewW) / 2) : 0,
    offsetY: sidebar ? Math.floor((windowH - viewH) / 2) : 0,
    sidebar,
  };
}

export function positionCombatCanvas(
  canvas: HTMLCanvasElement,
  viewport: Pick<CombatViewport, 'offsetX' | 'offsetY'>,
): void {
  canvas.style.left = `${viewport.offsetX}px`;
  canvas.style.top = `${viewport.offsetY}px`;
  canvas.style.right = 'auto';
  canvas.style.bottom = 'auto';
}
