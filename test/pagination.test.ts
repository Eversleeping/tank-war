import { describe, it, expect } from 'vitest';
import { paginate, pageSlice } from '../src/game/pagination.ts';

describe('paginate', () => {
  it('基础分页：总 45 条、每页 20 → 3 页', () => {
    const info = paginate(45, 0, 20);
    expect(info.pageCount).toBe(3);
    expect(info.start).toBe(0);
    expect(info.end).toBe(20);
    expect(info.hasPrev).toBe(false);
    expect(info.hasNext).toBe(true);
  });

  it('末页 end 钳到 total，hasNext=false', () => {
    const info = paginate(45, 2, 20);
    expect(info.page).toBe(2);
    expect(info.start).toBe(40);
    expect(info.end).toBe(45);
    expect(info.hasPrev).toBe(true);
    expect(info.hasNext).toBe(false);
  });

  it('page 越界（过大）钳到末页', () => {
    const info = paginate(45, 99, 20);
    expect(info.page).toBe(2);
  });

  it('page 越界（负数）钳到首页', () => {
    const info = paginate(45, -5, 20);
    expect(info.page).toBe(0);
  });

  it('空列表也算 1 页', () => {
    const info = paginate(0, 0, 20);
    expect(info.pageCount).toBe(1);
    expect(info.start).toBe(0);
    expect(info.end).toBe(0);
    expect(info.hasPrev).toBe(false);
    expect(info.hasNext).toBe(false);
  });

  it('整除边界：40 条每页 20 → 恰 2 页，无空尾页', () => {
    const info = paginate(40, 0, 20);
    expect(info.pageCount).toBe(2);
  });

  it('pageSize 非法（0 / 负）回退为 1', () => {
    expect(paginate(3, 0, 0).pageCount).toBe(3);
    expect(paginate(3, 0, -10).pageCount).toBe(3);
  });

  it('前 1000 名每页 20 → 50 页', () => {
    const info = paginate(1000, 49, 20);
    expect(info.pageCount).toBe(50);
    expect(info.page).toBe(49);
    expect(info.start).toBe(980);
    expect(info.end).toBe(1000);
    expect(info.hasNext).toBe(false);
  });
});

describe('pageSlice', () => {
  const items = Array.from({ length: 45 }, (_, i) => i);

  it('取首页切片', () => {
    expect(pageSlice(items, 0, 20)).toEqual(items.slice(0, 20));
  });

  it('取末页切片（不足一页）', () => {
    expect(pageSlice(items, 2, 20)).toEqual(items.slice(40, 45));
  });

  it('越界页安全返回末页切片', () => {
    expect(pageSlice(items, 99, 20)).toEqual(items.slice(40, 45));
  });

  it('空数组返回空', () => {
    expect(pageSlice([], 0, 20)).toEqual([]);
  });
});
