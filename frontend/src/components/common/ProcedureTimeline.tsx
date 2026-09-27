import { useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Button from '@mui/material/Button';
import Collapse from '@mui/material/Collapse';
import Divider from '@mui/material/Divider';
import Paper from '@mui/material/Paper';
import Tooltip from '@mui/material/Tooltip';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import Alert from '@mui/material/Alert';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import ReplayIcon from '@mui/icons-material/Replay';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import type { PrepProcedure, ProcedureEvent } from '../../types/procedure';

export interface ProcedureTimelineProps {
  items: PrepProcedure[];
  onFinish?: (id: string) => void;
  onRework?: (id: string, reason: string, operator: string) => void;
  onOpenPhoto?: (procedureId: string) => void;
}

function fmtTime(ts?: number): string {
  if (!ts) return '—';
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 节点返修登记弹窗：原因与责任人必填，展示将被一并重开的后续节点 */
function ReworkDialog({
  node,
  cascaded,
  onClose,
  onSubmit,
}: {
  node: PrepProcedure;
  cascaded: PrepProcedure[];
  onClose: () => void;
  onSubmit: (reason: string, operator: string) => void;
}) {
  const [reason, setReason] = useState('');
  const [operator, setOperator] = useState(node.operator);
  const [error, setError] = useState('');

  const submit = () => {
    if (!reason.trim()) {
      setError('返修原因必填');
      return;
    }
    if (!operator.trim()) {
      setError('返修责任人必填');
      return;
    }
    onSubmit(reason.trim(), operator.trim());
  };

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" data-testid="rework-dialog">
      <DialogTitle>返修登记 · #{node.seq} {node.stepType} · {node.nodeName}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={1.5} sx={{ mt: 0.5 }}>
          <Alert severity="warning">
            返修重开后，本节点及其后已完成节点均回到待办，需按序号逐个重做；历次完成时间、返修原因与返修次数会留在时间线。
          </Alert>
          {cascaded.length > 0 ? (
            <Typography variant="body2" color="warning.dark" data-testid="rework-cascade">
              一并回到待办的后续节点：
              {cascaded.map((n) => `#${n.seq} ${n.nodeName}`).join('、')}
            </Typography>
          ) : (
            <Typography variant="body2" color="text.secondary">
              本节点之后暂无已完成节点，仅本节点回到待办。
            </Typography>
          )}
          {node.reworkCount > 0 ? (
            <Typography variant="body2" color="text.secondary">
              本节点此前已返修 {node.reworkCount} 次，本次为第 {node.reworkCount + 1} 次。
            </Typography>
          ) : null}
          <TextField
            multiline
            minRows={3}
            size="small"
            label="返修原因"
            required
            autoFocus
            placeholder="如：加固胶液渗透不足，裂隙处出现空鼓，需重新清修并渗透加固"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            inputProps={{ 'data-testid': 'rework-reason' }}
          />
          <TextField
            size="small"
            label="返修责任人"
            required
            value={operator}
            onChange={(e) => setOperator(e.target.value)}
            inputProps={{ 'data-testid': 'rework-operator' }}
          />
          {error ? <Alert severity="error" data-testid="rework-error">{error}</Alert> : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>取消</Button>
        <Button variant="contained" color="warning" startIcon={<ReplayIcon />} onClick={submit}>
          确认返修重开
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** 单条留痕（完成 / 返修） */
function EventRow({ ev }: { ev: ProcedureEvent }) {
  const isRework = ev.type === 'rework';
  return (
    <Stack direction="row" spacing={1} alignItems="flex-start" data-testid="procedure-event">
      {isRework ? (
        <AutorenewIcon color="warning" fontSize="small" sx={{ mt: 0.25 }} />
      ) : (
        <CheckCircleIcon color="success" fontSize="small" sx={{ mt: 0.25 }} />
      )}
      <Box>
        <Typography variant="caption" display="block" fontWeight={700} color={isRework ? 'warning.dark' : 'success.dark'}>
          {isRework ? `第 ${ev.reworkNo} 次返修重开` : '完成'}
          {' · '}
          {fmtTime(ev.at)}
        </Typography>
        <Typography variant="caption" color="text.secondary" display="block">
          责任人：{ev.operator || '—'}
          {isRework ? ` · 返修原因：${ev.reason}` : ''}
        </Typography>
      </Box>
    </Stack>
  );
}

/**
 * 纵向工序节点流：步骤图标、状态、耗时、返修留痕时间线。
 * 完成按钮只对当前待办（第一个未完成）节点开放，保证按序号逐个重做。
 * 被标本详情页、工序录入页消费。
 */
export function ProcedureTimeline({ items, onFinish, onRework, onOpenPhoto }: ProcedureTimelineProps) {
  const [expanded, setExpanded] = useState<string | null>(items[0]?.id ?? null);
  const [reworkId, setReworkId] = useState<string | null>(null);

  // 第一个未完成节点即当前待办；它之后的节点（含返修重开者）不允许抢先完成
  const currentId = useMemo(
    () => items.find((it) => it.state !== 'done')?.id,
    [items],
  );
  const reworkNode = items.find((it) => it.id === reworkId);
  const cascadedNodes = reworkNode
    ? items.filter((it) => it.seq > reworkNode.seq && it.state === 'done')
    : [];

  if (items.length === 0) {
    return (
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="body2" color="text.secondary">
          该标本暂无工序节点，请到「新建工序节点」登记。
        </Typography>
      </Paper>
    );
  }

  return (
    <Stack spacing={1} data-testid="procedure-timeline">
      {items.map((node, index) => {
        const isDone = node.state === 'done';
        const isCurrent = node.id === currentId;
        const hasComplete = node.events.some((ev) => ev.type === 'complete');
        // 返修重开者：自身有返修事件；被上游返修连带重开者：留有完成记录但无自身返修事件
        const selfReworked = !isDone && node.events.some((ev) => ev.type === 'rework');
        const reopenedByCascade = !isDone && !selfReworked && hasComplete;
        const open = expanded === node.id;
        const events = [...node.events].sort((a, b) => a.at - b.at);
        return (
          <Box key={node.id} sx={{ display: 'flex', gap: 1.5 }}>
            <Stack alignItems="center" sx={{ pt: 0.5 }}>
              {isDone ? (
                <CheckCircleIcon color="success" fontSize="small" />
              ) : (
                <RadioButtonUncheckedIcon color={selfReworked || reopenedByCascade ? 'warning' : 'disabled'} fontSize="small" />
              )}
              {index < items.length - 1 ? (
                <Box sx={{ flex: 1, width: '2px', minHeight: 32, bgcolor: 'divider', my: 0.5 }} />
              ) : null}
            </Stack>
            <Paper variant="outlined" sx={{ p: 1.5, flex: 1, mb: 0.5 }}>
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                <Chip size="small" label={`#${node.seq}`} color="primary" variant="outlined" />
                <Typography variant="subtitle2" fontWeight={700}>
                  {node.stepType} · {node.nodeName}
                </Typography>
                <Chip
                  size="small"
                  label={isDone ? '已完成' : selfReworked || reopenedByCascade ? '返修待办' : '待办'}
                  color={isDone ? 'success' : selfReworked || reopenedByCascade ? 'warning' : 'default'}
                />
                {node.reworkCount > 0 ? (
                  <Chip size="small" color="warning" variant="outlined" label={`返修 ${node.reworkCount} 次`} />
                ) : null}
                <Typography variant="caption" color="text.secondary">
                  耗时 {node.durationMin} min · 责任人 {node.operator}
                </Typography>
                <Box sx={{ flex: 1 }} />
                {!isDone && onFinish ? (
                  isCurrent ? (
                    <Button size="small" variant="contained" onClick={() => onFinish(node.id)}>
                      完成节点
                    </Button>
                  ) : (
                    <Tooltip title="需按序号逐个完成，请先完成前面的待办节点">
                      <span>
                        <Button size="small" variant="contained" disabled>
                          完成节点
                        </Button>
                      </span>
                    </Tooltip>
                  )
                ) : null}
                {isDone && onRework ? (
                  <Button
                    size="small"
                    color="warning"
                    startIcon={<ReplayIcon />}
                    onClick={() => setReworkId(node.id)}
                  >
                    发起返修
                  </Button>
                ) : null}
                <Tooltip title={open ? '收起环境参数' : '展开环境参数'}>
                  <IconButton size="small" onClick={() => setExpanded(open ? null : node.id)}>
                    <ExpandMoreIcon
                      fontSize="small"
                      sx={{ transform: open ? 'rotate(180deg)' : 'none', transition: '0.2s' }}
                    />
                  </IconButton>
                </Tooltip>
              </Stack>
              <Collapse in={open} unmountOnExit>
                <Divider sx={{ my: 1 }} />
                <Stack direction="row" spacing={2} flexWrap="wrap" rowGap={0.5}>
                  <Typography variant="body2">工具：{node.tools.length ? node.tools.join('、') : '—'}</Typography>
                  <Typography variant="body2">磨料：{node.abrasive || '—'}</Typography>
                  <Typography variant="body2">
                    胶种：{node.adhesive || '—'}
                    {node.adhesiveConc > 0 ? `（浓度 ${node.adhesiveConc} %）` : ''}
                  </Typography>
                  <Typography variant="body2">
                    环境：{node.tempC} ℃ / RH {node.rh} %
                  </Typography>
                  <Typography variant="body2">开始：{fmtTime(node.startedAt)}</Typography>
                  <Typography variant="body2">最近完成：{fmtTime(node.finishedAt)}</Typography>
                  <Typography variant="body2">
                    影像：前 {node.photoBeforeIds.length} 张 / 后 {node.photoAfterIds.length} 张
                  </Typography>
                  {onOpenPhoto ? (
                    <Button size="small" onClick={() => onOpenPhoto(node.id)}>
                      查看对照
                    </Button>
                  ) : null}
                </Stack>
                {reopenedByCascade ? (
                  <Alert severity="warning" sx={{ mt: 1, py: 0 }}>
                    本节点因上游返修被一并回到待办，历史完成记录保留如下，重做时只能按序号逐个完成。
                  </Alert>
                ) : null}
                {events.length > 0 ? (
                  <Box sx={{ mt: 1, pl: 1, borderLeft: '2px solid', borderColor: 'divider' }}>
                    <Typography variant="caption" fontWeight={700} color="text.secondary" display="block" sx={{ mb: 0.5 }}>
                      留痕时间线
                    </Typography>
                    <Stack spacing={0.75}>
                      {events.map((ev) => (
                        <EventRow key={ev.id} ev={ev} />
                      ))}
                    </Stack>
                  </Box>
                ) : null}
              </Collapse>
            </Paper>
          </Box>
        );
      })}

      {reworkNode ? (
        <ReworkDialog
          node={reworkNode}
          cascaded={cascadedNodes}
          onClose={() => setReworkId(null)}
          onSubmit={(reason, operator) => {
            onRework?.(reworkNode.id, reason, operator);
            setReworkId(null);
          }}
        />
      ) : null}
    </Stack>
  );
}

export default ProcedureTimeline;
