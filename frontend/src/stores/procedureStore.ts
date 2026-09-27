import { create } from 'zustand';
import { db } from '../utils/db';
import { newId } from '../utils/id';
import type { PrepProcedure, PrepProcedureDraft } from '../types/procedure';

interface ProcedureState {
  items: PrepProcedure[];
  loaded: boolean;
  load: () => Promise<void>;
  add: (draft: PrepProcedureDraft) => Promise<PrepProcedure>;
  /** 完成节点：只允许完成该标本序号最靠前的未完成节点，保证重做按序号逐个进行 */
  finish: (id: string) => Promise<void>;
  /**
   * 返修：对已完成节点填写原因与责任人后重开，
   * 其后所有已完成节点一并回到待办；整条返修记录（含连带重置）追加进时间线。
   */
  rework: (id: string, reason: string, owner: string) => Promise<void>;
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
    const record: PrepProcedure = { ...draft, id: newId('prc') };
    await db.procedures.put(record);
    set({ items: [...get().items, record] });
    return record;
  },
  async finish(id) {
    const target = get().items.find((it) => it.id === id);
    if (!target) throw new Error('未找到该工序节点');
    if (target.state === 'done') throw new Error('该节点已是完成状态，无需重复完成');

    // 重做时只能按序号逐个完成：前面还有未完成节点时不允许跳过
    const firstPending = get()
      .items.filter((it) => it.specimenId === target.specimenId && it.state !== 'done')
      .sort((a, b) => a.seq - b.seq)[0];
    if (!firstPending || firstPending.id !== id) {
      throw new Error(`请先完成序号最靠前的待办节点 #${firstPending?.seq ?? ''}`);
    }

    const now = Date.now();
    const completions = [
      ...(target.completions ?? []),
      { at: now, operator: target.operator, round: (target.completions?.length ?? 0) + 1 },
    ];
    const updated: PrepProcedure = { ...target, state: 'done', finishedAt: now, completions };
    await db.procedures.put(updated);
    set({ items: get().items.map((it) => (it.id === id ? updated : it)) });
  },
  async rework(id, reason, owner) {
    const trimmedReason = reason.trim();
    const trimmedOwner = owner.trim();
    if (!trimmedReason) throw new Error('请填写返修原因');
    if (!trimmedOwner) throw new Error('请填写返修责任人');

    const target = get().items.find((it) => it.id === id);
    if (!target) throw new Error('未找到该工序节点');
    if (target.state !== 'done') throw new Error('只有已完成节点可以发起返修');

    const batchId = newId('rwk');
    const at = Date.now();
    // 发起节点及其后所有已完成节点一并回到待办；前序节点与本就待办的节点不动
    const affected = get()
      .items.filter(
        (it) => it.specimenId === target.specimenId && it.seq >= target.seq && it.state === 'done',
      )
      .sort((a, b) => a.seq - b.seq);

    const updatedList = affected.map((node) => {
      const round = (node.reworkCount ?? 0) + 1;
      const reworks = [
        ...(node.reworks ?? []),
        {
          batchId,
          at,
          reason: trimmedReason,
          owner: trimmedOwner,
          round,
          primary: node.id === target.id,
          ...(node.id === target.id ? {} : { triggeredBySeq: target.seq }),
        },
      ];
      return {
        ...node,
        state: 'pending' as const,
        finishedAt: undefined,
        reworks,
        reworkCount: round,
      };
    });

    await db.transaction('rw', db.procedures, async () => {
      await db.procedures.bulkPut(updatedList);
    });
    const byId = new Map(updatedList.map((it) => [it.id, it]));
    set({ items: get().items.map((it) => byId.get(it.id) ?? it) });
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
