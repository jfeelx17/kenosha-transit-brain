import { alertWindow } from '../lib/format';

/**
 * Service notices, ranked so the one that changes your day is the one you see.
 *
 * The agency leaves standing notices up for a year at a time (fare rules, a stop that moved last
 * autumn). Showing all of them would train you to ignore the strip on the morning it matters, so
 * only short-window alerts get the loud treatment and the rest sit behind a quiet count.
 */
export default function AlertBanner({ alerts, onOpen }) {
  if (!alerts?.length) return null;
  const urgent = alerts.filter((a) => a.urgent);
  const top = urgent[0];

  if (!top) {
    return (
      <button type="button" className="alertbar alertbar--quiet" onClick={onOpen}>
        <span className="alertbar__icon" aria-hidden="true">ⓘ</span>
        <span className="alertbar__text">
          {alerts.length} service {alerts.length === 1 ? 'notice' : 'notices'}
        </span>
        <span className="alertbar__more">View</span>
      </button>
    );
  }

  return (
    <button type="button" className="alertbar alertbar--urgent" onClick={onOpen} aria-label={`Service alert: ${top.title}`}>
      <span className="alertbar__icon" aria-hidden="true">⚠</span>
      <span className="alertbar__text">
        <strong>{top.title}</strong>
        <small>{alertWindow(top)}</small>
      </span>
      {alerts.length > 1 && <span className="alertbar__more">+{alerts.length - 1}</span>}
    </button>
  );
}
