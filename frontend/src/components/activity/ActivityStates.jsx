export function ActivitySkeletons() {
  return (
    <div className="bliver-activity-skeletons" aria-label="正在加载动态" aria-busy="true">
      {[1, 2, 3].map((item) => (
        <div className="bliver-activity-skeleton" key={item}>
          <span className="bliver-activity-skeleton__avatar" />
          <span className="bliver-activity-skeleton__line" />
          <span className="bliver-activity-skeleton__line bliver-activity-skeleton__line--wide" />
        </div>
      ))}
    </div>
  );
}

export function ActivityError({ cached, onRetry }) {
  if (cached) {
    return (
      <div className="bliver-activity-notice" role="status">
        <p>动态暂时无法更新，正在显示已缓存内容。</p>
        <button type="button" onClick={onRetry}>重新加载动态</button>
      </div>
    );
  }
  return (
    <section className="bliver-activity-state">
      <h2>动态加载失败</h2>
      <p>暂时无法获取动态，请稍后再试。</p>
      <button type="button" onClick={onRetry}>重新加载动态</button>
    </section>
  );
}

export function ActivityEmpty({ fixed, onBroaden }) {
  return (
    <section className="bliver-activity-state">
      <h2>{fixed ? '本省还没有新动态' : '还没有新动态'}</h2>
      <p>{fixed ? '换到智能范围，看看附近和好友的足迹。' : '公开足迹会按时间出现在这里。'}</p>
      {fixed && <button type="button" onClick={onBroaden}>返回智能范围</button>}
    </section>
  );
}
