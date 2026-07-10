export default function AppShell({ children }) {
  return (
    <div className="bliver-shell" data-design-system="natural-city">
      <main className="bliver-shell__content">{children}</main>
    </div>
  );
}
