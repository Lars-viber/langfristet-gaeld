export function HistoricalBanner({ onReturn }: { onReturn(): void }) {
  return (
    <aside className="historical-banner" aria-label="Historisk visning">
      <div><strong>Du ser et tidligere trin</strong><p>Trinnet er skrivebeskyttet. Din faglige fremgang er uændret.</p></div>
      <button className="button button-secondary" type="button" onClick={onReturn}>Tilbage til aktuelt trin</button>
    </aside>
  );
}
