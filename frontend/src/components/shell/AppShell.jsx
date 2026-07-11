export default function AppShell({
  children,
  topBar,
  bottomNavigation,
  primaryAction,
}) {
  return (
    <div className="bliver-shell" data-design-system="natural-city">
      <main className="bliver-shell__content">{children}</main>
      {topBar}
      {primaryAction}
      {bottomNavigation}
    </div>
  );
}
