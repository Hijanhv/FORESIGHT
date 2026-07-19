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
      className="group flex w-full items-center gap-3 rounded-xl border border-black/[0.08] bg-black/[0.015] px-4 py-3 text-left transition-all hover:border-cool/50 hover:bg-cool/[0.04]"
    >
      <span className="w-11 shrink-0 font-mono text-xs tabular-nums text-muted">
        {fixture.time}
        <span className="block text-[10px] leading-none text-muted/60">UTC</span>
      </span>

      <div className="min-w-0 flex-1">
        <span className="text-sm font-medium text-ink">{fixture.home}</span>
        <span className="mx-1.5 text-xs text-muted">vs</span>
        <span className="text-sm font-medium text-ink">{fixture.away}</span>
      </div>

      {live && (
        <span className="flex shrink-0 items-center gap-1 font-mono text-xs text-hot">
          <span className="h-1.5 w-1.5 rounded-full bg-hot ping-dot" />
          LIVE
        </span>
      )}
      {!live && finished && (
        <span className="shrink-0 font-mono text-xs text-muted/50">FT</span>
      )}
      {!live && !finished && (
        <span className="shrink-0 font-mono text-xs text-cool opacity-0 transition-opacity group-hover:opacity-100">
          watch →
        </span>
      )}
    </button>
  );
}

export function MatchList({ onSelect }: { onSelect: (fixtureId: string) => void }) {
  const today = new Date().toISOString().slice(0, 10);

  const live = FIXTURES.filter(isLive);
  const upcoming = FIXTURES.filter((f) => !isLive(f) && !isFinished(f));
  // Always show recent results so the schedule is never empty between rounds.
  const recentFinished = FIXTURES.filter(isFinished).slice(-12);

  const displayFixtures = [...live, ...upcoming, ...recentFinished];
  const grouped = groupByDate(displayFixtures);

  if (grouped.length === 0) return null;

  return (
    <section data-shot="schedule" className="mx-auto mt-10 w-full max-w-lg px-4 pb-16">
      <h2 className="mb-5 font-mono text-xs uppercase tracking-[0.22em] text-muted">
        World Cup 2026 · Schedule
      </h2>

      <div className="flex flex-col gap-8">
        {grouped.map(([date, fixtures]) => (
          <div key={date}>
            <div className="mb-3 flex items-center gap-3">
              <span className="font-mono text-xs text-muted">
                {date === today ? "Today" : formatDate(date)}
              </span>
              <div className="h-px flex-1 bg-black/10" />
              <span className="font-mono text-xs text-muted/60">
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
