"use client";

import { useEffect, useState } from "react";
import { GaugeWidget } from "./GaugeWidget";
import { ReplayView } from "@/components/replay/ReplayView";
import { MatchList } from "@/components/schedule/MatchList";
import { FIXTURES } from "@/lib/schedule";
import type { Replay } from "@/lib/replay/build";

interface ReplayIndexEntry {
  fixtureId: string; home: string; away: string; round: string;
  finalHome: number; finalAway: number; durationMin: number;
  goals: number; calledGoals: number; peakAnticipation: number;
}

export function MatchView() {
  const [input, setInput] = useState("");
  const [fixtureId, setFixtureId] = useState<string | undefined>(undefined);
  const [forceDemo, setForceDemo] = useState(false);
  const [replayIndex, setReplayIndex] = useState<ReplayIndexEntry[]>([]);
  const [indexLoaded, setIndexLoaded] = useState(false);
  const [replay, setReplay] = useState<Replay | null>(null);
  const [loadingReplay, setLoadingReplay] = useState(false);

  // URL params on mount: `?demo=1` forces the scripted match; `?replay=<id>`
  // (or `?fixture=<id>`) deep-links straight into a fixture / past-match replay.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time URL read on mount
    if (q.has("demo")) setForceDemo(true);
    const deep = q.get("replay") ?? q.get("fixture");
    if (deep) {
      setInput(deep);
      setFixtureId(deep);
    }
  }, []);

  // Which finished fixtures have a pre-rendered real-data replay.
  useEffect(() => {
    fetch("/replays/index.json")
      .then((r) => (r.ok ? r.json() : []))
      .then((idx: ReplayIndexEntry[]) => setReplayIndex(Array.isArray(idx) ? idx : []))
      .catch(() => setReplayIndex([]))
      .finally(() => setIndexLoaded(true));
  }, []);

  const replayIds = new Set(replayIndex.map((e) => e.fixtureId));

  // Load the replay JSON whenever a fixture with a replay is selected.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clears stale replay when selection changes
    if (!fixtureId || !replayIds.has(fixtureId)) { setReplay(null); return; }
    let cancelled = false;
    setLoadingReplay(true);
    setReplay(null);
    fetch(`/replays/${fixtureId}.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: Replay | null) => { if (!cancelled) setReplay(data); })
      .catch(() => { if (!cancelled) setReplay(null); })
      .finally(() => { if (!cancelled) setLoadingReplay(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fixtureId, replayIndex]);

  const fixture = fixtureId ? FIXTURES.find((f) => f.fixtureId === fixtureId) : undefined;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const id = input.trim();
    setFixtureId(id || undefined);
  };
  const handleClear = () => { setInput(""); setFixtureId(undefined); };
  const handleSelect = (id: string) => {
    setInput(id);
    setFixtureId(id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const showReplay = !!fixtureId && replayIds.has(fixtureId);

  return (
    <div className="flex w-full flex-col items-center">
      <div className="flex w-full max-w-md flex-col items-center gap-6">
        <form onSubmit={handleSubmit} className="flex w-full items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Fixture ID, or leave blank for the demo"
            className="flex-1 rounded-full border border-line bg-canvas px-4 py-2 font-mono text-[11px] text-ink placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-cool/50"
          />
          {fixtureId ? (
            <button type="button" onClick={handleClear} className="rounded-full border border-line px-4 py-2 font-mono text-[11px] text-muted transition-colors hover:border-hot/50 hover:text-hot">
              clear
            </button>
          ) : (
            <button type="submit" className="rounded-full border border-cool/50 bg-cool/10 px-4 py-2 font-mono text-[11px] text-cool transition-colors hover:bg-cool/20">
              watch
            </button>
          )}
        </form>

        {/* Featured real-data replays — one tap to watch how Foresight read a past match */}
        {!fixtureId && replayIndex.length > 0 && (
          <div className="w-full">
            <div className="mb-2 text-center font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
              ⟲ Replay a past match · real TxLINE data
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {replayIndex.map((e) => (
                <button
                  key={e.fixtureId}
                  onClick={() => handleSelect(e.fixtureId)}
                  className="group rounded-full border border-line bg-black/[0.015] px-3 py-1.5 font-mono text-[10px] text-ink transition-colors hover:border-goal/50 hover:bg-goal/[0.05]"
                  title={`Flagged ${e.calledGoals} of ${e.goals} goals before the market`}
                >
                  {e.home} {e.finalHome}–{e.finalAway} {e.away}
                  {e.calledGoals > 0 && (
                    <span className="ml-1.5 text-goal">✓{e.calledGoals}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {showReplay ? (
          loadingReplay || !replay ? (
            <div className="flex h-64 w-full items-center justify-center font-mono text-[11px] text-muted">
              loading replay…
            </div>
          ) : (
            <ReplayView replay={replay} />
          )
        ) : (
          <GaugeWidget
            fixtureId={fixtureId}
            homeTeam={fixture?.home}
            awayTeam={fixture?.away}
            forceDemo={forceDemo}
            // Hold the stream until the replay index resolves. `?replay=<id>`
            // is read in a mount effect, so connecting sooner would open
            // /api/live with no fixtureId, immediately reopen it with one, then
            // throw both away when this swaps to <ReplayView> — two dead
            // connections and a visible flash of the gauge. The index fetch
            // settles after that mount effect, so it gates both.
            ready={indexLoaded}
          />
        )}
      </div>

      <MatchList onSelect={handleSelect} replayIds={replayIds} />
    </div>
  );
}
