import { useState } from 'react';
import { Flag, MoreHorizontal, Trash2 } from 'lucide-react';

const reasons = [
  ['spam', '垃圾信息'],
  ['harassment', '骚扰'],
  ['privacy', '隐私问题'],
  ['illegal', '违法内容'],
  ['other', '其他'],
];

export default function ModerationMenu({
  targetType,
  footprintId,
  targetId,
  canDelete = false,
  canReport = false,
  onDelete,
  onReport,
}) {
  const [open, setOpen] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState('spam');
  const [details, setDetails] = useState('');
  const [error, setError] = useState('');
  const label = targetType === 'comment' ? '评论' : '足迹';

  const submitReport = async () => {
    setError('');
    try {
      await onReport?.({ footprintId, targetType, targetId, reason, details });
      setReporting(false);
      setOpen(false);
    } catch {
      setError('举报失败，请重试');
    }
  };

  return (
    <div className="bliver-moderation-menu">
      <button type="button" className="bliver-icon-button" aria-label="更多" onClick={() => setOpen((value) => !value)}>
        <MoreHorizontal aria-hidden="true" />
      </button>
      {open && (
        <div className="bliver-moderation-popover" role="menu">
          {canReport && !reporting && (
            <button type="button" role="menuitem" onClick={() => setReporting(true)}>
              <Flag aria-hidden="true" /> 举报{label}
            </button>
          )}
          {canDelete && !reporting && (
            <button type="button" role="menuitem" onClick={onDelete}>
              <Trash2 aria-hidden="true" /> 删除{label}
            </button>
          )}
          {reporting && (
            <div className="bliver-moderation-form">
              <label>
                举报原因
                <select value={reason} onChange={(event) => setReason(event.target.value)}>
                  {reasons.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
                </select>
              </label>
              <label>
                补充说明
                <textarea value={details} onChange={(event) => setDetails(event.target.value)} rows={2} />
              </label>
              {error && <p role="alert">{error}</p>}
              <button type="button" onClick={submitReport}>提交举报</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
