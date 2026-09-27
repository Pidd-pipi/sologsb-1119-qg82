import { create } from 'zustand';
import { db } from '../utils/db';
import { newId } from '../utils/id';
import type { PrepProcedure, PrepProcedureDraft, ProcedureEvent } from '../types/procedure';

/** 返修入参：原因与责任人必填 */
export interface ReworkInput {
  reason: string;
  operator: string;
}

/** 返修结果：被一并重开的后续已完成节点数 */
export interface ReworkResult {
  cascaded: number;
}

interface ProcedureState {
  items: PrepProcedure[];
  loaded: boolean;
  load: () => Promise<void>;
  add: (draft: PrepProcedureDraft) => Promise<PrepProcedure>;
  finish: (id: string) => Promise<void>;
  rework: (id: string, input: ReworkInput) => Promise<ReworkResult>;
  remove: (id: string) => Promise<void>;
  bySpecimen: (specimenId: string) => PrepProcedure[];
}

export const useProcedureStore = create<ProcedureState>((set, get) => ({
  items: [],
  loaded: false,
  async load() {
    const items = await db.procedures.toArray();
    items.sort((a, b) => a.seq - b.seq || a.startedAt - b.startedAt);
    set({ items, loaded: true });
  },
  async add(draft) {
    const record: PrepProcedure = { ...draft, id: newId('prc'), reworkCount: 0, events: [] };
    await db.procedures.put(record);
    set({ items: [...get().items, record] });
    return record;
  },
  async finish(id) {
    const items = get().items;
    const target = items.find((it) => it.id === id);
    if (!target) throw new Error('未找到该工序节点');
    if (target.state === 'done') throw new Error(`节点 #${target.seq} 已完成，如需返修请走返修登记`);
    // 只能按序号逐个完成：目标必须是该标本第一个未完成节点
    const current = items
      .filter((it) => it.specimenId === target.specimenId)
      .sort((a, b) => a.seq - b.seq)
      .find((it) => it.state !== 'done');
    if (!current || current.id !== id) {
      throw new Error(`需按序号逐个完成，请先完成 #${current?.seq ?? '-'} ${current?.nodeName ?? ''}`);
    }
    const now = Date.now();
    const event: ProcedureEvent = { id: newId('evt'), type: 'complete', at: now, operator: target.operator };
    const events = [...target.events, event];
    await db.procedures.update(id, { state: 'done', finishedAt: now, events });
    set({
      items: items.map((it) => (it.id === id ? { ...it, state: 'done', finishedAt: now, events } : it)),
    });
  },
  async rework(id, input) {
    const reason = input.reason.trim();
    const operator = input.operator.trim();
    if (!reason) throw new Error('返修原因必填');
    if (!operator) throw new Error('返修责任人必填');
    const items = get().items;
    const target = items.find((it) => it.id === id);
    if (!target) throw new Error('未找到该工序节点');
    if (target.state !== 'done') throw new Error('仅已完成节点可发起返修');

    const now = Date.now();
    const reworkNo = target.reworkCount + 1;
    const event: ProcedureEvent = { id: newId('evt'), type: 'rework', at: now, operator, reason, reworkNo };
    // 目标节点之后的已完成节点一并回到待办；未参与的节点（序号更小或本就待办）不动
    const cascadedIds = items
      .filter((it) => it.specimenId === target.specimenId && it.seq > target.seq && it.state === 'done')
      .map((it) => it.id);

    await db.transaction('rw', db.procedures, async () => {
      await db.procedures.update(id, {
        state: 'pending',
        finishedAt: undefined,
        reworkCount: reworkNo,
        events: [...target.events, event],
      });
      for (const cid of cascadedIds) {
        await db.procedures.update(cid, { state: 'pending', finishedAt: undefined });
      }
    });

    set({
      items: items.map((it) => {
        if (it.id === id) {
          return {
            ...it,
            state: 'pending',
            finishedAt: undefined,
            reworkCount: reworkNo,
            events: [...it.events, event],
          };
        }
        if (cascadedIds.includes(it.id)) {
          return { ...it, state: 'pending', finishedAt: undefined };
        }
        return it;
      }),
    });
    return { cascaded: cascadedIds.length };
  },
  async remove(id) {
    await db.procedures.delete(id);
    set({ items: get().items.filter((it) => it.id !== id) });
  },
  bySpecimen(specimenId) {
    return get()
      .items.filter((it) => it.specimenId === specimenId)
      .sort((a, b) => a.seq - b.seq);
  },
}));
