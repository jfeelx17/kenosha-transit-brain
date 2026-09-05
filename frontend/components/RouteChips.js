/** Horizontal row of route toggles. Tapping a chip hides/shows that route's stops and buses. */
export default function RouteChips({ routes, hidden, onToggle, onShowAll }) {
  if (!routes.length) return null;
  return (
    <nav className="chips" aria-label="Routes">
      <button
        type="button"
        className={`chip chip--all ${hidden.size === 0 ? 'chip--on' : ''}`}
        onClick={onShowAll}
        title="Show every route"
      >
        All
      </button>
      {routes.map((r) => {
        const off = hidden.has(String(r.id));
        return (
          <button
            key={r.id}
            type="button"
            className={`chip ${off ? '' : 'chip--on'}`}
            style={{ '--chip': r.color }}
            onClick={() => onToggle(String(r.id))}
            aria-pressed={!off}
            title={r.name}
          >
            {r.shortName}
          </button>
        );
      })}
    </nav>
  );
}
