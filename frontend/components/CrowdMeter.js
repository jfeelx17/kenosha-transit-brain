import { crowdLevel } from '../lib/format';

/**
 * Crowd Meter: passenger load from the bus's automatic passenger counter
 * (APCPercentage, 0-100). Renders a coloured bar plus a plain-language label.
 */
export default function CrowdMeter({ percentage, onBoard, capacity }) {
  const level = crowdLevel(percentage);
  const known = level.key !== 'unknown';
  const pct = known ? Math.max(0, Math.min(100, Math.round(percentage))) : 0;
  const detail = known && onBoard != null && capacity ? ` (${onBoard}/${capacity})` : '';

  return (
    <div
      className={`crowd crowd--${level.key}`}
      title={known ? `${pct}% of capacity in use${detail}` : 'No passenger-load data for this bus'}
    >
      <div
        className="crowd__bar"
        role="meter"
        aria-label="Crowd meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={known ? pct : undefined}
        aria-valuetext={known ? `${pct}% full, ${level.label}` : level.label}
      >
        <div className="crowd__fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="crowd__label">
        {level.label}
        {known ? ` · ${pct}%` : ''}
        {detail}
      </span>
    </div>
  );
}
