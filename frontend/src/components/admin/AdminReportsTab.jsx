import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Check, RefreshCw, Trash2 } from 'lucide-react';
import { apiClient } from '../../api';

const reasonLabels = {
  spam: '垃圾信息',
  harassment: '骚扰',
  privacy: '隐私问题',
  illegal: '违法内容',
  other: '其他',
};

export default function AdminReportsTab() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(null);
  const [workingId, setWorkingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await apiClient.admin.reports();
      setReports(response.data.reports || []);
    } catch {
      setError('举报加载失败，请重试');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const resolve = async (report, resolution) => {
    setWorkingId(report._id);
    setError('');
    try {
      await apiClient.admin.resolveReport(report._id, resolution);
      setReports((current) => current.filter((item) => item._id !== report._id));
      setConfirming(null);
    } catch {
      setError('处理失败，请重试');
    } finally {
      setWorkingId(null);
    }
  };

  if (loading) return <div className="bliver-admin-reports-state">正在加载举报...</div>;
  if (error && reports.length === 0) return <div className="bliver-admin-reports-state" role="alert">{error}<button type="button" onClick={load}><RefreshCw aria-hidden="true" /> 重试</button></div>;

  return (
    <section className="bliver-admin-reports" aria-labelledby="admin-reports-title">
      <div className="bliver-admin-reports__heading">
        <div><h3 id="admin-reports-title">待处理举报</h3><p>管理员明确选择保留或删除内容。</p></div>
        <button type="button" className="bliver-icon-button" aria-label="刷新举报" onClick={load}><RefreshCw aria-hidden="true" /></button>
      </div>
      {error && <p className="bliver-admin-reports__error" role="alert">{error}</p>}
      {reports.length === 0 ? (
        <div className="bliver-admin-reports-state"><Check aria-hidden="true" /> 当前没有待处理举报</div>
      ) : (
        <div className="bliver-admin-reports__list">
          {reports.map((report) => (
            <article key={report._id} className="bliver-admin-report-row">
              <div className="bliver-admin-report-row__meta"><AlertTriangle aria-hidden="true" /><strong>{reasonLabels[report.reason] || report.reason}</strong><span>{report.targetType === 'comment' ? '评论' : '足迹'}</span></div>
              <p>举报人：{report.reporterId?.name || '未知用户'}</p>
              <small>{new Date(report.createdAt).toLocaleString('zh-CN')}</small>
              <div className="bliver-admin-report-row__actions">
                <button type="button" disabled={workingId === report._id} onClick={() => resolve(report, 'dismiss')}>保留内容并驳回</button>
                <button type="button" disabled={workingId === report._id} onClick={() => setConfirming(report)}>删除内容并处理</button>
              </div>
            </article>
          ))}
        </div>
      )}
      {confirming && (
        <div className="bliver-admin-report-dialog-layer">
          <div className="bliver-admin-report-dialog" role="dialog" aria-modal="true" aria-label="确认删除举报内容">
            <Trash2 aria-hidden="true" /><h3>确认删除举报内容</h3><p>此操作会立即移除被举报的足迹或评论。</p>
            <div><button type="button" onClick={() => setConfirming(null)}>取消</button><button type="button" onClick={() => resolve(confirming, 'delete')}>确认删除</button></div>
          </div>
        </div>
      )}
    </section>
  );
}
