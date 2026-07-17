/**
 * 分页纯逻辑。与 UI 解耦，便于单测。排行榜面板前 1000 名按页加载。
 */

export interface PageInfo {
  /** 规整后的当前页（0 基，钳制到 [0, pageCount-1]）。 */
  page: number;
  /** 总页数（至少 1，空列表也算 1 页）。 */
  pageCount: number;
  /** 本页起始下标（0 基，含）。 */
  start: number;
  /** 本页结束下标（0 基，不含）。 */
  end: number;
  /** 是否有上一页。 */
  hasPrev: boolean;
  /** 是否有下一页。 */
  hasNext: boolean;
}

/**
 * 计算分页信息。pageSize 至少 1；page 越界自动钳制。
 */
export function paginate(total: number, page: number, pageSize: number): PageInfo {
  const size = Math.max(1, Math.floor(pageSize));
  const count = Math.max(1, Math.ceil(Math.max(0, total) / size));
  const p = Math.max(0, Math.min(count - 1, Math.floor(page)));
  const start = p * size;
  const end = Math.min(Math.max(0, total), start + size);
  return {
    page: p,
    pageCount: count,
    start,
    end,
    hasPrev: p > 0,
    hasNext: p < count - 1,
  };
}

/** 取某页的切片（内部走 paginate 钳制，越界安全）。 */
export function pageSlice<T>(items: readonly T[], page: number, pageSize: number): T[] {
  const info = paginate(items.length, page, pageSize);
  return items.slice(info.start, info.end);
}
