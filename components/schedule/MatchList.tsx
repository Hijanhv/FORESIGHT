"use client";

import { FIXTURES, isLive, isFinished, type Fixture } from "@/lib/schedule";

function groupByDate(fixtures: Fixture[]): [string, Fixture[]][] {
  const map = new Map<string, Fixture[]>();
  for (const f of fixtures) {
    const arr = map.get(f.date) ?? [];
    arr.push(f);
    map.set(f.date, arr);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + "T12:00:00Z").toLocaleDateString("en", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function FixtureRow({
  fixture,
  onSelect,
}: {
  fixture: Fixture;
  onSelect: (id: string) => void;
}) {
  const live = isLive(fixture);
  const finished = isFinished(fixture);

  return (
    <button
      onClick={() => onSelect(fixture.fixtureId)}
      className="w-full flex items-center gap-3 px-4 py-3 bg-white rounded-xl border border-neutral-100 hover:border-sky-300 hover:shadow-sm transition-all text-left group"
    >
      <span className="text-xs font-mono text-neutral-400 w-11 shrink-0 tabular-nums">
        {fixture.time}
        <span className="text-[10px] block leading-none text-neutral-300">UTC</span>
      </span>

      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium text-neutral-800">
          {fixture.home}
        </span>
        <span className="text-xs text-neutral-400 mx-1.5">vs</span>
        <span className="text-sm font-medium text-neutral-800">
          {fixture.away}
        </span>
      </div>

      {live && (
        <span className="flex items-center gap-1 text-xs font-mono text-red-500 shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          LIVE
        </span>
      )}
      {!live && finished && (
        <span className="text-xs font-mono text-neutral-300 shrink-0">FT</span>
      )}
      {!live && !finished && (
        <span className="text-xs font-mono text-sky-400 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          watch →
        </span>
      )}
    </button>
  );
}

export function MatchList({ onSelect }: { onSelect: (fixtureId: string) => void }) {
  const today = new Date().toISOString().slice(0, 10);

  const live = FIXTURES.filter(isLive);
  const upcoming = FIXTURES.filter(
    (f) => !isLive(f) && !isFinished(f) && f.date >= today,
  );
  const past = FIXTURES.filter((f) => isFinished(f) && f.date >= today);

  const displayFixtures = [...live, ...upcoming, ...past];
  const grouped = groupByDate(displayFixtures);

  if (grouped.length === 0) return null;

  return (
    <section className="w-full max-w-lg mx-auto mt-10 px-4 pb-16">
      <h2 className="text-xs font-mono uppercase tracking-widest text-neutral-400 mb-5">
        World Cup 2026 · Schedule
      </h2>

      <div className="flex flex-col gap-8">
        {grouped.map(([date, fixtures]) => (
          <div key={date}>
            <div className="flex items-center gap-3 mb-3">
              <span className="text-xs font-mono text-neutral-500">
                {date === today ? "Today" : formatDate(date)}
              </span>
              <div className="flex-1 h-px bg-neutral-100" />
              <span className="text-xs font-mono text-neutral-300">
                {fixtures[0].round}
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {fixtures.map((f) => (
                <FixtureRow key={f.fixtureId} fixture={f} onSelect={onSelect} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
