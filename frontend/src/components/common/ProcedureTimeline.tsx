import { useState } from 'react';
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
import BuildIcon from '@mui/icons-material/Build';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { procedureStateLabel, type PrepProcedure, type ReworkRecord } from '../../types/procedure';

export interface ProcedureTimelineProps {
  items: PrepProcedure[];
  onFinish?: (id: string) => void | Promise<void>;
  onRework?: (id: string, reason: string, owner: string) => void | Promise<void>;
  onOpenPhoto?: (procedureId: string) => void;
}

function fmtTime(ts?: number): string {
  if (!ts) return '—';
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 完成次数文案：首次完成 / 返修后第 n 次完成 */
function completionRoundLabel(round: number): string {
  return round === 1 ? '首次完成' : `返修后第 ${round - 1} 次重做完成`;
}

/** 返修留痕单条 */
function ReworkLine({ record }: { record: ReworkRecord }) {
  return (
    <Typography variant="body2" component="div" data-testid={`rework-line-${record.round}`}>
      <Chip
        size="small"
        color={record.primary ? 'warning' : 'default'}
        variant={record.primary ? 'filled' : 'outlined'}
        label={record.primary ? `返修发起 · 第 ${record.round} 次重开` : `连带重置 · 第 ${record.round} 次重开`}
        sx={{ mr: 1, mb: 0.25 }}
      />
      {fmtTime(record.at)} · 责任人 {record.owner}
      {record.primary ? '' : `（由 #${record.triggeredBySeq ?? ''} 返修连带）`}
      <Typography variant="body2" color="text.secondary" sx={{ pl: 0.5 }}>
        返修原因：{record.reason}
      </Typography>
    </Typography>
  );
}

/**
 * 纵向工序节点流：步骤图标、状态、耗时、环境参数折叠区，以及完成/返修留痕。
 * 重做只能按序号逐个完成：仅序号最靠前的未完成节点可点「完成节点」。
 * 被标本详情页、工序录入页消费。
 */
export function ProcedureTimeline({ items, onFinish, onRework, onOpenPhoto }: ProcedureTimelineProps) {
  const [expanded, setExpanded] = useState<string | null>(items[0]?.id ?? null);
  const [reworkTarget, setReworkTarget] = useState<PrepProcedure | null>(null);
  const [reason, setReason] = useState('');
  const [owner, setOwner] = useState('');
  const [dialogError, setDialogError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (items.length === 0) {
    return (
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="body2" color="text.secondary">
          该标本暂无工序节点，请到「新建工序节点」登记。
        </Typography>
      </Paper>
    );
  }

  // 当前唯一可完成的节点：序号最靠前的未完成节点
  const firstPending = items.filter((n) => n.state !== 'done').sort((a, b) => a.seq - b.seq)[0];

  const openRework = (node: PrepProcedure) => {
    setReworkTarget(node);
    setReason('');
    setOwner(node.operator ?? '');
    setDialogError('');
  };

  const closeRework = () => {
    if (submitting) return;
    setReworkTarget(null);
    setDialogError('');
  };

  const submitRework = async () => {
    if (!reworkTarget || !onRework) return;
    if (!reason.trim()) {
      setDialogError('请填写返修原因');
      return;
    }
    if (!owner.trim()) {
      setDialogError('请填写返修责任人');
      return;
    }
    setSubmitting(true);
    try {
      await onRework(reworkTarget.id, reason.trim(), owner.trim());
      setReworkTarget(null);
      setDialogError('');
    } catch (err) {
      setDialogError(err instanceof Error ? err.message : '返修提交失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Stack spacing={1} data-testid="procedure-timeline">
      {items.map((node, index) => {
        const isDone = node.state === 'done';
        const inRework = !isDone && node.reworkCount > 0;
        const open = expanded === node.id;
        const canFinish = !isDone && !!onFinish && firstPending?.id === node.id;
        const finishBlocked = !isDone && !canFinish && !!onFinish;
        return (
          <Box key={node.id} sx={{ display: 'flex', gap: 1.5 }}>
            <Stack alignItems="center" sx={{ pt: 0.5 }}>
              {isDone ? (
                <CheckCircleIcon color="success" fontSize="small" />
              ) : (
                <RadioButtonUncheckedIcon color={inRework ? 'warning' : 'disabled'} fontSize="small" />
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
                  label={procedureStateLabel(node)}
                  color={isDone ? 'success' : inRework ? 'warning' : 'default'}
                />
                {node.reworkCount > 0 ? (
                  <Tooltip title={node.reworks.map((r) => `第 ${r.round} 次：${r.reason}`).join('；')}>
                    <Chip
                      size="small"
                      color="warning"
                      variant="outlined"
                      icon={<BuildIcon />}
                      label={`返修 ${node.reworkCount} 次`}
                    />
                  </Tooltip>
                ) : null}
                <Typography variant="caption" color="text.secondary">
                  耗时 {node.durationMin} min · 责任人 {node.operator}
                </Typography>
                <Box sx={{ flex: 1 }} />
                {canFinish ? (
                  <Button size="small" variant="contained" onClick={() => onFinish?.(node.id)}>
                    {node.reworkCount > 0 ? '重做完成' : '完成节点'}
                  </Button>
                ) : null}
                {finishBlocked ? (
                  <Tooltip title={`需先完成前面的待办节点 #${firstPending?.seq ?? ''}`}>
                    <span>
                      <Button size="small" variant="outlined" disabled>
                        完成节点
                      </Button>
                    </span>
                  </Tooltip>
                ) : null}
                {isDone && onRework ? (
                  <Button
                    size="small"
                    color="warning"
                    startIcon={<BuildIcon />}
                    onClick={() => openRework(node)}
                  >
                    返修
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

                {node.completions.length > 0 ? (
                  <Box sx={{ mt: 1 }}>
                    <Typography variant="caption" color="text.secondary" fontWeight={700}>
                      完成留痕（{node.completions.length}）
                    </Typography>
                    <Stack spacing={0.25}>
                      {node.completions.map((c) => (
                        <Typography key={`${c.round}-${c.at}`} variant="body2">
                          <Chip size="small" variant="outlined" label={completionRoundLabel(c.round)} sx={{ mr: 1 }} />
                          {fmtTime(c.at)} · 操作人 {c.operator || '—'}
                        </Typography>
                      ))}
                    </Stack>
                  </Box>
                ) : null}

                {node.reworks.length > 0 ? (
                  <Box sx={{ mt: 1 }}>
                    <Typography variant="caption" color="warning.main" fontWeight={700}>
                      返修留痕（{node.reworks.length}）
                    </Typography>
                    <Stack spacing={0.5} sx={{ mt: 0.25 }}>
                      {node.reworks.map((r) => (
                        <ReworkLine key={`${r.batchId}-${r.round}`} record={r} />
                      ))}
                    </Stack>
                  </Box>
                ) : null}
              </Collapse>
            </Paper>
          </Box>
        );
      })}

      <Dialog open={!!reworkTarget} onClose={closeRework} maxWidth="xs" fullWidth>
        <DialogTitle variant="subtitle1" fontWeight={700}>
          返修登记
          {reworkTarget ? ` · #${reworkTarget.seq} ${reworkTarget.stepType} · ${reworkTarget.nodeName}` : ''}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ mt: 0.5 }}>
            <Alert severity="warning">
              提交后该节点回到待办，其后所有已完成节点将一并回到待办；重做时需按序号逐个完成。
              {reworkTarget && reworkTarget.reworkCount > 0
                ? ` 该节点此前已返修 ${reworkTarget.reworkCount} 次，本次为第 ${reworkTarget.reworkCount + 1} 次。`
                : ''}
            </Alert>
            <TextField
              label="返修原因"
              required
              fullWidth
              multiline
              minRows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              inputProps={{ 'data-testid': 'rework-reason' }}
            />
            <TextField
              label="返修责任人"
              required
              fullWidth
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
              inputProps={{ 'data-testid': 'rework-owner' }}
            />
            {dialogError ? <Alert severity="error">{dialogError}</Alert> : null}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeRework} disabled={submitting}>
            取消
          </Button>
          <Button
            variant="contained"
            color="warning"
            onClick={submitRework}
            disabled={submitting}
            data-testid="rework-submit"
          >
            {submitting ? '提交中…' : '确认返修'}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

export default ProcedureTimeline;
