/**
 * Horizontal row of route toggles. Tapping a chip hides/shows that route's
 * stops and buses. School trippers are grouped behind one "School" chip.
 */
export default function RouteChips({ routes, hidden, onToggle, onToggleMany, onShowAll }) {
  if (!routes.length) return null;
  const regular = routes.filter((r) => !r.isSchool);
  const school = routes.filter((r) => r.isSchool);
  const schoolIds = school.map((r) => String(r.id));
  const schoolOn = schoolIds.some((id) => !hidden.has(id));

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
      {regular.map((r) => {
        const off = hidden.has(String(r.id));
        return (
          <button
            key={r.id}
            type="button"
            className={`chip ${off ? '' : 'chip--on'}`}
            style={{ '--chip': r.color }}
            onClick={() => onToggle(String(r.id))}
            aria-pressed={!off}
            title={r.description ? `${r.name}: ${r.description}` : r.name}
          >
            {r.shortLabel || r.shortName}
          </button>
        );
      })}
      {school.length > 0 && (
        <button
          type="button"
          className={`chip ${schoolOn ? 'chip--on' : ''}`}
          style={{ '--chip': school[0].color }}
          onClick={() => onToggleMany(schoolIds, schoolOn)}
          aria-pressed={schoolOn}
          title={school.map((r) => r.name).join(', ')}
        >
          School ({school.length})
        </button>
      )}
    </nav>
  );
}
