"use client";

import { useState } from "react";
import { GaugeWidget } from "./GaugeWidget";
import { MatchList } from "@/components/schedule/MatchList";
import { FIXTURES } from "@/lib/schedule";

export function MatchView() {
  const [input, setInput] = useState("");
  const [fixtureId, setFixtureId] = useState<string | undefined>(undefined);

  const fixture = fixtureId ? FIXTURES.find((f) => f.fixtureId === fixtureId) : undefined;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const id = input.trim();
    setFixtureId(id || undefined);
  };

  const handleClear = () => {
    setInput("");
    setFixtureId(undefined);
  };

  const handleSelect = (id: string) => {
    setInput(id);
    setFixtureId(id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="flex w-full flex-col items-center">
      {/* Fixture selector */}
      <div className="flex w-full max-w-md flex-col items-center gap-6">
        <form onSubmit={handleSubmit} className="flex w-full items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Fixture ID — or leave blank for demo"
            className="flex-1 rounded-full border border-line bg-surface px-4 py-2 font-mono text-[11px] text-ink placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-cool/40"
          />
          {fixtureId ? (
            <button
              type="button"
              onClick={handleClear}
              className="rounded-full border border-line px-4 py-2 font-mono text-[11px] text-muted transition-colors hover:border-hot/30 hover:text-hot"
            >
              clear
            </button>
          ) : (
            <button
              type="submit"
              className="rounded-full border border-cool/30 bg-cool/5 px-4 py-2 font-mono text-[11px] text-cool transition-colors hover:bg-cool/10"
            >
              watch
            </button>
          )}
        </form>

        <GaugeWidget
          fixtureId={fixtureId}
          homeTeam={fixture?.home}
          awayTeam={fixture?.away}
        />
      </div>

      {/* Schedule — click any fixture to watch it */}
      <MatchList onSelect={handleSelect} />
    </div>
  );
}
