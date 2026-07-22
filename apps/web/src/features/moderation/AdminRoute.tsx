import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Skeleton } from '@bliver/ui';
import {
  AlertTriangle,
  Ban,
  Check,
  CheckCircle2,
  FileWarning,
  History,
  RefreshCw,
  ShieldCheck,
  ShieldX,
  UserCog,
  Users,
} from 'lucide-react';
import { useRef, useState, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { AppStatusScene } from '../../app/AppStatusScene.js';
import {
  gsap,
  motionTokens,
  useGSAP,
  withMotionPreferences,
} from '../../platform/motion/gsap.js';
import { adminCommand, fetchAdminList, fetchAdminRole } from './api.js';
import { adminTranslations } from './translations.js';
import './admin.css';

type AdminTranslationKey = keyof typeof adminTranslations.en.admin;
type AdminCopy = (
  key: AdminTranslationKey,
  values?: Record<string, string | number>,
) => string;

type Command =
  | {
      labelKey: AdminTranslationKey;
      path: string;
      required?: 'moderator' | 'admin';
      body: Record<string, unknown>;
    }
  | null;

function value(record: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    if (record[key] != null) return String(record[key]);
  }
  return '-';
}

function compact(valueToFormat: string): string {
  if (valueToFormat.length <= 22) return valueToFormat;
  return `${valueToFormat.slice(0, 8)}...${valueToFormat.slice(-6)}`;
}

function formatAdminTime(valueToFormat: string, locale?: string): string {
  const date = new Date(valueToFormat);
  if (Number.isNaN(date.getTime())) return valueToFormat;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function useAdminCopy(): {
  copy: AdminCopy;
  language: string | undefined;
} {
  const { i18n, t } = useTranslation();
  return {
    copy: (key, values = {}) =>
      t(`admin.${key}`, {
        defaultValue: adminTranslations.en.admin[key],
        ...values,
      }),
    language: i18n.resolvedLanguage,
  };
}

function roleLabel(role: string, copy: AdminCopy): string {
  if (role === 'admin') return copy('roleAdmin');
  if (role === 'moderator') return copy('roleModerator');
  if (role === 'user') return copy('roleUser');
  return role;
}

function statusLabel(status: string, copy: AdminCopy): string {
  return status === 'open' ? copy('statusOpen') : status;
}

function Confirmation({
  command,
  onClose,
  onConfirm,
  busy,
  error,
}: {
  command: NonNullable<Command>;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  busy: boolean;
  error: boolean;
}) {
  const { copy } = useAdminCopy();
  const [reason, setReason] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);

  useGSAP(() => {
    const surface = dialog.current;
    if (!surface) return;
    if (!surface.open) surface.showModal();

    return withMotionPreferences(surface, ({ reducedMotion }) => {
      if (reducedMotion) {
        gsap.set(surface, { clearProps: 'transform,opacity,visibility' });
        return;
      }
      const entrance = gsap.fromTo(surface, {
        autoAlpha: 0.7,
        y: 10,
        scale: 0.985,
      }, {
        autoAlpha: 1,
        y: 0,
        scale: 1,
        duration: 0.18,
        ease: motionTokens.ease.route,
        clearProps: 'transform,opacity,visibility',
      });
      return () => entrance.kill();
    });
  }, { scope: dialog });

  return (
    <dialog
      ref={dialog}
      className="admin-confirmation"
      aria-labelledby="admin-confirmation-title"
      aria-describedby="admin-confirmation-description"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={onClose}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (reason.trim()) onConfirm(reason.trim());
        }}
      >
        <header>
          <span aria-hidden="true">
            <AlertTriangle />
          </span>
          <div>
            <h2 id="admin-confirmation-title">
              {copy('confirmTitle', { action: copy(command.labelKey) })}
            </h2>
            <p id="admin-confirmation-description">
              {copy('confirmBody')}
            </p>
          </div>
        </header>
        <label>
          <span>{copy('reason')}</span>
          <textarea
            autoFocus
            required
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={copy('reasonPlaceholder')}
          />
        </label>
        {error ? (
          <p className="admin-confirmation__error" role="alert">
            {copy('actionError')}
          </p>
        ) : null}
        <footer>
          <Button type="button" variant="secondary" onClick={onClose}>
            {copy('cancel')}
          </Button>
          <Button type="submit" loading={busy} disabled={!reason.trim()}>
            <Check aria-hidden="true" />
            {copy('confirm')}
          </Button>
        </footer>
      </form>
    </dialog>
  );
}

function AdminLoading({ messageKey }: { messageKey: AdminTranslationKey }) {
  const { copy } = useAdminCopy();
  const message = copy(messageKey);
  return (
    <section className="admin-route" aria-busy="true">
      <header className="admin-route__header">
        <div>
          <p className="admin-route__context">{copy('context')}</p>
          <h1>{copy('title')}</h1>
          <p role="status">{message}</p>
        </div>
      </header>
      <div className="admin-route__loading">
        <Skeleton label={message} lines={12} />
      </div>
    </section>
  );
}

export function AdminRoute() {
  const { copy, language } = useAdminCopy();
  const client = useQueryClient();
  const role = useQuery({
    queryKey: ['admin-role'],
    queryFn: fetchAdminRole,
    staleTime: 0,
    refetchOnMount: 'always',
  });
  const reports = useQuery({
    queryKey: ['admin', 'reports'],
    queryFn: () => fetchAdminList('reports'),
    enabled: Boolean(role.data?.role),
  });
  const users = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => fetchAdminList('users'),
    enabled: Boolean(role.data?.role),
  });
  const audit = useQuery({
    queryKey: ['admin', 'audit'],
    queryFn: () => fetchAdminList('audit'),
    enabled: Boolean(role.data?.role),
  });
  const [pending, setPending] = useState<Command>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);
  const mutation = useMutation({
    mutationFn: ({
      command,
      reason,
    }: {
      command: NonNullable<Command>;
      reason: string;
    }) =>
      adminCommand(
        command.path,
        { ...command.body, reason },
        command.required,
      ),
    onSuccess: async () => {
      setPending(null);
      await client.invalidateQueries({ queryKey: ['admin'] });
      restoreFocus.current?.focus();
    },
  });

  const open = (
    event: MouseEvent<HTMLButtonElement>,
    command: NonNullable<Command>,
  ): void => {
    mutation.reset();
    restoreFocus.current = event.currentTarget;
    setPending(command);
  };

  const closeConfirmation = (): void => {
    mutation.reset();
    setPending(null);
    requestAnimationFrame(() => restoreFocus.current?.focus());
  };

  if (role.isLoading) return <AdminLoading messageKey="checkingRole" />;

  if (role.isError || !role.data?.role) {
    return (
      <section className="admin-route admin-route--state">
        <AppStatusScene
          Icon={ShieldX}
          code="GOV / 403"
          title={copy('title')}
          body={copy('noAccess')}
        />
      </section>
    );
  }

  if (reports.isLoading || users.isLoading || audit.isLoading) {
    return <AdminLoading messageKey="loadingWorkspace" />;
  }

  if (reports.isError || users.isError || audit.isError) {
    return (
      <section className="admin-route admin-route--state">
        <AppStatusScene
          Icon={AlertTriangle}
          code="GOV / 503"
          title={copy('unavailableTitle')}
          body={copy('unavailableBody')}
          action={
            <Button
              onClick={() =>
                void Promise.all([
                  reports.refetch(),
                  users.refetch(),
                  audit.refetch(),
                ])
              }
            >
              {copy('retry')}
            </Button>
          }
        />
      </section>
    );
  }

  const reportItems = reports.data?.items ?? [];
  const userItems = users.data?.items ?? [];
  const auditItems = audit.data?.items ?? [];

  return (
    <section className="admin-route">
      <header className="admin-route__header">
        <div>
          <p className="admin-route__context">{copy('context')}</p>
          <h1>{copy('title')}</h1>
          <p>{copy('overviewBody')}</p>
        </div>
        <div className="admin-route__role-actions">
          <span className="admin-route__role">
            <ShieldCheck aria-hidden="true" />
            <span>
              {copy('databaseRole', {
                role: roleLabel(role.data.role, copy),
              })}
            </span>
          </span>
          <Button
            variant="secondary"
            loading={role.isFetching}
            onClick={() => void role.refetch()}
          >
            <RefreshCw aria-hidden="true" />
            {copy('refreshRole')}
          </Button>
        </div>
      </header>

      <nav
        className="admin-route__index"
        aria-label={copy('governanceSections')}
      >
        <a href="#report-queue">
          <FileWarning aria-hidden="true" />
          <span>{copy('reportsTitle')}</span>
          <strong>{reportItems.length}</strong>
        </a>
        <a href="#user-directory">
          <Users aria-hidden="true" />
          <span>{copy('usersTitle')}</span>
          <strong>{userItems.length}</strong>
        </a>
        <a href="#audit-log">
          <History aria-hidden="true" />
          <span>{copy('auditTitle')}</span>
          <strong>{auditItems.length}</strong>
        </a>
      </nav>

      <section className="admin-route__section" id="report-queue">
        <header>
          <div>
            <h2>{copy('reportsTitle')}</h2>
            <p>{copy('reportsBody')}</p>
          </div>
          <span>{copy('reportsCount', { count: reportItems.length })}</span>
        </header>
        <div
          className="admin-table-wrap"
          role="region"
          aria-label={copy('reportsTitle')}
          tabIndex={0}
        >
          <table>
            <caption className="admin-route__sr-only">
              {copy('reportCaption')}
            </caption>
            <thead>
              <tr>
                <th scope="col">{copy('headerReport')}</th>
                <th scope="col">{copy('headerFootprint')}</th>
                <th scope="col">{copy('headerStatus')}</th>
                <th scope="col">{copy('headerAction')}</th>
              </tr>
            </thead>
            <tbody>
              {reportItems.length ? (
                reportItems.map((item) => {
                  const reportId = value(item, 'id');
                  const footprintId = value(
                    item,
                    'footprint_id',
                    'footprintId',
                  );
                  const status = value(item, 'status');
                  return (
                    <tr key={reportId}>
                      <td data-label={copy('headerReport')}>
                        <code title={reportId}>{compact(reportId)}</code>
                      </td>
                      <td data-label={copy('headerFootprint')}>
                        <code title={footprintId}>{compact(footprintId)}</code>
                      </td>
                      <td data-label={copy('headerStatus')}>
                        <span className="admin-status admin-status--attention">
                          {statusLabel(status, copy)}
                        </span>
                      </td>
                      <td data-label={copy('headerAction')}>
                        <Button
                          variant="secondary"
                          onClick={(event) =>
                            open(event, {
                              labelKey: 'commandResolveReport',
                              path: '/admin/cases/{caseId}/resolve',
                              body: {
                                reportId,
                                targetType: 'footprint',
                                targetId: footprintId,
                              },
                            })
                          }
                        >
                          <CheckCircle2 aria-hidden="true" />
                          {copy('resolve')}
                        </Button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td className="admin-table-empty" colSpan={4}>
                    <span className="admin-table-empty__content">
                      <CheckCircle2 aria-hidden="true" />
                      {copy('noReports')}
                    </span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="admin-route__section" id="user-directory">
        <header>
          <div>
            <h2>{copy('usersTitle')}</h2>
            <p>{copy('usersBody')}</p>
          </div>
          <span>{copy('usersCount', { count: userItems.length })}</span>
        </header>
        <div
          className="admin-table-wrap"
          role="region"
          aria-label={copy('usersTitle')}
          tabIndex={0}
        >
          <table className="admin-user-table">
            <caption className="admin-route__sr-only">
              {copy('userCaption')}
            </caption>
            <thead>
              <tr>
                <th scope="col">{copy('headerUser')}</th>
                <th scope="col">{copy('headerRole')}</th>
                <th scope="col">{copy('headerState')}</th>
                <th scope="col">{copy('headerActions')}</th>
              </tr>
            </thead>
            <tbody>
              {userItems.length ? (
                userItems.map((item) => {
                  const userId = value(item, 'id');
                  const suspended = Boolean(item.suspended_at);
                  return (
                    <tr key={userId}>
                      <td data-label={copy('headerUser')}>
                        <strong>
                          {value(item, 'display_name', 'username', 'id')}
                        </strong>
                        <code title={userId}>{compact(userId)}</code>
                      </td>
                      <td data-label={copy('headerRole')}>
                        {roleLabel(value(item, 'role'), copy)}
                      </td>
                      <td data-label={copy('headerState')}>
                        <span
                          className={
                            suspended
                              ? 'admin-status admin-status--blocked'
                              : 'admin-status admin-status--active'
                          }
                        >
                          {suspended ? copy('suspended') : copy('active')}
                        </span>
                      </td>
                      <td
                        className="admin-actions"
                        data-label={copy('headerActions')}
                      >
                        <Button
                          variant="danger"
                          onClick={(event) =>
                            open(event, {
                              labelKey: 'commandSuspendUser',
                              path: `/admin/users/${userId}/suspend`,
                              body: {
                                targetType: 'user',
                                targetId: userId,
                              },
                            })
                          }
                        >
                          <Ban aria-hidden="true" />
                          {copy('suspend')}
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={(event) =>
                            open(event, {
                              labelKey: 'commandChangeRole',
                              path: `/admin/users/${userId}/role`,
                              required: 'admin',
                              body: {
                                targetType: 'user',
                                targetId: userId,
                                role: 'moderator',
                              },
                            })
                          }
                        >
                          <UserCog aria-hidden="true" />
                          {copy('makeModerator')}
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={(event) =>
                            open(event, {
                              labelKey: 'commandRevokeSessions',
                              path: `/admin/users/${userId}/revoke-sessions`,
                              body: {
                                targetType: 'user',
                                targetId: userId,
                              },
                            })
                          }
                        >
                          <ShieldX aria-hidden="true" />
                          {copy('revokeSessions')}
                        </Button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td className="admin-table-empty" colSpan={4}>
                    <span className="admin-table-empty__content">
                      <Users aria-hidden="true" />
                      {copy('noUsers')}
                    </span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="admin-route__section" id="audit-log">
        <header>
          <div>
            <h2>{copy('auditTitle')}</h2>
            <p>{copy('auditBody')}</p>
          </div>
          <span>{copy('auditCount', { count: auditItems.length })}</span>
        </header>
        <div
          className="admin-table-wrap"
          role="region"
          aria-label={copy('auditTitle')}
          tabIndex={0}
        >
          <table>
            <caption className="admin-route__sr-only">
              {copy('auditCaption')}
            </caption>
            <thead>
              <tr>
                <th scope="col">{copy('headerTime')}</th>
                <th scope="col">{copy('headerActor')}</th>
                <th scope="col">{copy('headerAction')}</th>
                <th scope="col">{copy('headerTarget')}</th>
                <th scope="col">{copy('headerReason')}</th>
              </tr>
            </thead>
            <tbody>
              {auditItems.length ? (
                auditItems.map((item) => {
                  const id = value(item, 'id');
                  const timestamp = value(item, 'createdAt', 'created_at');
                  const actorId = value(item, 'actorId', 'actor_id');
                  const targetId = value(item, 'targetId', 'target_id');
                  return (
                    <tr key={id}>
                      <td data-label={copy('headerTime')}>
                        <time dateTime={timestamp}>
                          {formatAdminTime(timestamp, language)}
                        </time>
                      </td>
                      <td data-label={copy('headerActor')}>
                        <code title={actorId}>{compact(actorId)}</code>
                      </td>
                      <td data-label={copy('headerAction')}>
                        <strong>{value(item, 'action')}</strong>
                      </td>
                      <td data-label={copy('headerTarget')}>
                        <code title={targetId}>{compact(targetId)}</code>
                      </td>
                      <td
                        className="admin-reason"
                        data-label={copy('headerReason')}
                      >
                        {value(item, 'reason')}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td className="admin-table-empty" colSpan={5}>
                    <span className="admin-table-empty__content">
                      <History aria-hidden="true" />
                      {copy('noAudit')}
                    </span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {pending ? (
        <Confirmation
          command={pending}
          busy={mutation.isPending}
          error={mutation.isError}
          onClose={closeConfirmation}
          onConfirm={(reason) => mutation.mutate({ command: pending, reason })}
        />
      ) : null}
    </section>
  );
}
