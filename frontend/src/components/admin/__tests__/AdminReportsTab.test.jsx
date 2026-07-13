import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AdminReportsTab from '../AdminReportsTab';

const mocks = vi.hoisted(() => ({
  reports: vi.fn(),
  resolveReport: vi.fn(),
}));

vi.mock('../../../api', () => ({ apiClient: { admin: mocks } }));

describe('AdminReportsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.reports.mockResolvedValue({ data: { reports: [{
      _id: 'report-1', reason: 'harassment', targetType: 'comment',
      createdAt: '2026-07-11T08:00:00.000Z', reporterId: { name: 'viewer' },
    }] } });
    mocks.resolveReport.mockResolvedValue({ data: { report: { _id: 'report-1', status: 'dismissed' } } });
  });

  it('loads pending reports and dismisses one', async () => {
    const user = userEvent.setup();
    render(<AdminReportsTab />);
    expect(await screen.findByText('待处理举报')).toBeInTheDocument();
    expect(screen.getByText('骚扰')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '保留内容并驳回' }));
    expect(mocks.resolveReport).toHaveBeenCalledWith('report-1', 'dismiss');
  });

  it('requires confirmation before deleting reported content', async () => {
    const user = userEvent.setup();
    render(<AdminReportsTab />);
    await screen.findByText('待处理举报');
    await user.click(screen.getByRole('button', { name: '删除内容并处理' }));
    expect(screen.getByRole('dialog', { name: '确认删除举报内容' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '确认删除' }));
    expect(mocks.resolveReport).toHaveBeenCalledWith('report-1', 'delete');
  });
});
