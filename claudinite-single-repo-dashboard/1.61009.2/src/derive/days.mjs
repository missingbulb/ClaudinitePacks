// UTC days, the unit every window on the page is counted in. Pure: no clock of its
// own, no I/O, no DOM.

export const DAY_MS = 86400e3;

// A UTC day. The queue's anchors and GitHub's timestamps are all UTC, so a local-time
// bucketing would put a midnight run on the wrong day depending on who is looking.
export const dayKey = (t) => new Date(t).toISOString().slice(0, 10);

// The window's days, oldest first, including today. Built from keys rather than from
// arithmetic on a rendered date so a DST-free UTC ladder is the only thing anyone has
// to trust.
export function dayLadder(now, days) {
  const start = Math.floor(now / DAY_MS) * DAY_MS - (days - 1) * DAY_MS;
  return Array.from({ length: days }, (_, i) => dayKey(start + i * DAY_MS));
}
