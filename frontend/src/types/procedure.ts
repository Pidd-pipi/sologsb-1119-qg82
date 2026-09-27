/** 工序类型 */
export type StepType = '清修' | '加固' | '粘接' | '补配' | '翻模';

export const STEP_TYPES: StepType[] = ['清修', '加固', '粘接', '补配', '翻模'];

/** 各工序类型适用的工具、磨料、胶种候选（表单动态字段用） */
export const STEP_FIELD_MAP: Record<
  StepType,
  { tools: string[]; abrasives: string[]; adhesives: string[]; needConc: boolean }
> = {
  清修: {
    tools: ['气动笔', '剔针', '超声波清洗机', '软毛刷'],
    abrasives: ['400 目', '800 目', '1200 目'],
    adhesives: [],
    needConc: false,
  },
  加固: {
    tools: ['渗透滴管', '真空浸渗罐', '加热台'],
    abrasives: [],
    adhesives: ['Paraloid B-72', '氰基丙烯酸酯', '环氧树脂 E44'],
    needConc: true,
  },
  粘接: {
    tools: ['点胶针', '夹持架', '热风枪'],
    abrasives: [],
    adhesives: ['Paraloid B-72', '氰基丙烯酸酯', '动物胶'],
    needConc: true,
  },
  补配: {
    tools: ['刮刀', '雕刻刀', '石膏模'],
    abrasives: ['600 目', '1000 目'],
    adhesives: ['环氧树脂 E44', 'Paraloid B-72'],
    needConc: true,
  },
  翻模: {
    tools: ['硅胶模具', '真空脱泡机', '石膏桶'],
    abrasives: [],
    adhesives: ['硅橡胶', '石膏浆料'],
    needConc: false,
  },
};

/**
 * 工序节点状态。
 * pending 包含两类：从未完成的待办，与返修后重开的节点（靠 reworks/completions 留痕区分）。
 */
export type ProcedureState = 'pending' | 'done';

/** 一次完成留痕：首次完成与每次返修重做后的完成各一条，按 round 递增 */
export interface ProcedureCompletion {
  /** 完成时刻 */
  at: number;
  /** 完成操作人 */
  operator: string;
  /** 第几次完成（1 = 首次完成，返修后再完成依次递增） */
  round: number;
}

/** 一次返修留痕：发起节点与被连带重置的后续节点共享 batchId */
export interface ReworkRecord {
  /** 同一次返修批次共享，串联被重开的目标节点与被连带重置的后续节点 */
  batchId: string;
  /** 返修发起时刻 */
  at: number;
  /** 返修原因 */
  reason: string;
  /** 返修责任人 */
  owner: string;
  /** 该节点第几次被重开（从 1 起） */
  round: number;
  /** 是否为本次返修的发起节点；false 表示因前序节点返修被连带重置回待办 */
  primary: boolean;
  /** 连带重置时，返修发起节点的序号 */
  triggeredBySeq?: number;
}

/** 修复工序 */
export interface PrepProcedure {
  id: string;
  specimenId: string;
  stepType: StepType;
  /** 节点名称 */
  nodeName: string;
  /** 序号，不得跳号 */
  seq: number;
  /** 工具 */
  tools: string[];
  /** 磨料目数 */
  abrasive: string;
  /** 胶种 */
  adhesive: string;
  /** 胶液浓度 % */
  adhesiveConc: number;
  /** 耗时 min */
  durationMin: number;
  /** 环境温度 ℃ */
  tempC: number;
  /** 相对湿度 % */
  rh: number;
  photoBeforeIds: string[];
  photoAfterIds: string[];
  operator: string;
  startedAt: number;
  state: ProcedureState;
  /** 最近一次完成时刻（pending 时为空，历史完成时间见 completions） */
  finishedAt?: number;
  /** 完成留痕：首次完成 + 每次返修后重做完成，按时间排列 */
  completions: ProcedureCompletion[];
  /** 返修留痕：本节点被重开的每一次（含被前序返修连带重置），按时间排列 */
  reworks: ReworkRecord[];
  /** 返修次数（本节点被重开次数） */
  reworkCount: number;
}

export type PrepProcedureDraft = Omit<PrepProcedure, 'id'>;

/** 节点在时间线/对照页上的状态文案（返修重开的待办显示为「返修中」） */
export function procedureStateLabel(node: Pick<PrepProcedure, 'state' | 'reworkCount'>): string {
  if (node.state === 'done') return '已完成';
  return (node.reworkCount ?? 0) > 0 ? '返修中' : '待办';
}
