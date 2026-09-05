/**
 * Horizontal row of route toggles. Tapping a chip hides/shows that route's
 * stops and buses. School trippers are grouped behind one "School" chip.
 */
/** Perceived luminance of a #rrggbb colour, 0-255; used to keep chip text readable. */
function luminance(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return 128;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

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
            className={`chip ${off ? '' : 'chip--on'} ${luminance(r.color) < 90 ? 'chip--dark' : ''}`}
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
          className={`chip ${schoolOn ? 'chip--on' : ''} ${luminance(school[0].color) < 90 ? 'chip--dark' : ''}`}
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
