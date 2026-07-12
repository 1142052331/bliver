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

export function ActivityEmpty({ scope = 'smart', onBroaden }) {
  const copy = {
    smart: ['还没有新动态', '公开足迹会按时间出现在这里。', false],
    region: ['本省还没有新动态', '换到智能范围，看看附近和好友的足迹。', true],
    country: ['本国还没有新动态', '换到智能范围，看看附近和好友的足迹。', true],
    global: ['全球还没有新动态', '公开足迹会按时间出现在这里。', false],
  }[scope] || ['还没有新动态', '公开足迹会按时间出现在这里。', false];
  return (
    <section className="bliver-activity-state">
      <h2>{copy[0]}</h2>
      <p>{copy[1]}</p>
      {copy[2] && <button type="button" onClick={onBroaden}>返回智能范围</button>}
    </section>
  );
}
