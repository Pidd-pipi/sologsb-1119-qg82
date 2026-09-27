import { useMemo } from 'react';
import { useProcedureStore } from '../stores/procedureStore';
import type { PrepProcedure } from '../types/procedure';
import { findSeqGaps } from '../utils/id';

export interface PrepProgress {
  list: PrepProcedure[];
  total: number;
  done: number;
  /** 处于返修重开（待办且有返修记录）的节点数 */
  reworking: number;
  /** 档案内累计返修次数（所有节点 reworkCount 之和） */
  reworkCount: number;
  percent: number;
  /** 当前待办节点（序号最靠前的未完成节点，重做只能先完成它） */
  current: PrepProcedure | undefined;
  /** 跳号（应为空） */
  gaps: number[];
  /** 交付准备：节点全部完成且无返修中节点时就绪 */
  deliveryReady: boolean;
}

/**
 * 计算某标本的工序完成度与当前待办节点。
 * 被标本详情页与工序录入页消费。
 */
export function usePrepProgress(specimenId: string | undefined): PrepProgress {
  const items = useProcedureStore((s) => s.items);

  return useMemo<PrepProgress>(() => {
    const list = items
      .filter((it) => (specimenId ? it.specimenId === specimenId : true))
      .sort((a, b) => a.seq - b.seq);
    const done = list.filter((it) => it.state === 'done').length;
    const reworking = list.filter((it) => it.state !== 'done' && (it.reworkCount ?? 0) > 0).length;
    const reworkCount = list.reduce((sum, it) => sum + (it.reworkCount ?? 0), 0);
    const percent = list.length === 0 ? 0 : Math.round((done / list.length) * 100);
    const current = list.find((it) => it.state !== 'done');
    const gaps = findSeqGaps(list.map((it) => it.seq));
    return {
      list,
      total: list.length,
      done,
      reworking,
      reworkCount,
      percent,
      current,
      gaps,
      deliveryReady: list.length > 0 && done === list.length,
    };
  }, [items, specimenId]);
}
