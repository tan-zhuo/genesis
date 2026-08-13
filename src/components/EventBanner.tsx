// Historic-moment banner: importance ≥ 8 events slide in over the map.
// Clicking focuses the location; optionally auto-pauses the simulation.
import { useEffect, useRef, useState } from 'react';
import { Universe, useSimulatorStore } from '../state/simulatorStore';
import { WorldEvent } from '../simulation/types';
import { useLang } from '../i18n';

const ICONS: Record<string, string> = {
  war: '⚔️', peace: '🕊', extinction: '💀', split: '💥', empire: '👑',
  disaster: '🌋', divine: '⚡', birth: '🌱', technology: '💡', 'city-captured': '🏴',
};

export function EventBanner({ universe }: { universe: Universe }): JSX.Element | null {
  const [current, setCurrent] = useState<WorldEvent | null>(null);
  const queueRef = useRef<WorldEvent[]>([]);
  const seenRef = useRef<Set<string>>(new Set());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusOn = useSimulatorStore((s) => s.focusOn);
  const selectCiv = useSimulatorStore((s) => s.selectCiv);
  const pauseOnHistoric = useSimulatorStore((s) => s.pauseOnHistoric);
  const pause = useSimulatorStore((s) => s.pause);
  const lang = useLang();

  // Collect new historic events (not while fast-forwarding to a target year —
  // a replay would flood the banner with the whole of history).
  useEffect(() => {
    const events = universe.events;
    if (universe.runToTarget !== null) {
      for (let i = Math.max(0, events.length - 40); i < events.length; i++) seenRef.current.add(events[i].id);
      return;
    }
    let paused = false;
    for (let i = Math.max(0, events.length - 40); i < events.length; i++) {
      const e = events[i];
      if (e.importance < 8 || seenRef.current.has(e.id)) continue;
      seenRef.current.add(e.id);
      queueRef.current.push(e);
      if (pauseOnHistoric && universe.running && !paused) {
        pause();
        paused = true;
      }
    }
    if (queueRef.current.length > 6) queueRef.current.splice(0, queueRef.current.length - 6);
    if (seenRef.current.size > 3000) seenRef.current.clear();
  }, [universe.events, universe.runToTarget, pauseOnHistoric, universe.running, pause]);

  // Advance the banner queue.
  useEffect(() => {
    const tick = (): void => {
      if (queueRef.current.length > 0) {
        setCurrent(queueRef.current.shift()!);
        timerRef.current = setTimeout(() => {
          setCurrent(null);
          timerRef.current = setTimeout(tick, 250);
        }, 4500);
      } else {
        timerRef.current = setTimeout(tick, 400);
      }
    };
    timerRef.current = setTimeout(tick, 400);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // Reset on universe switch / replay.
  useEffect(() => {
    seenRef.current.clear();
    queueRef.current = [];
    setCurrent(null);
    // Pre-mark existing history so old events don't replay as banners.
    for (const e of universe.events) seenRef.current.add(e.id);
  }, [universe.id]);

  if (!current) return null;
  const title = lang === 'zh' && current.titleZh ? current.titleZh : current.title;
  return (
    <button
      className="event-banner"
      onClick={() => {
        if (current.x !== undefined && current.y !== undefined) focusOn(current.x, current.y);
        if (current.civilizationIds.length > 0) selectCiv(current.civilizationIds[0]);
        setCurrent(null);
      }}
    >
      <span className="event-banner-icon">{ICONS[current.type] ?? '📜'}</span>
      <span className="event-banner-year">{lang === 'zh' ? `${current.year} 年` : `Year ${current.year}`}</span>
      <span className="event-banner-title">{title}</span>
    </button>
  );
}
