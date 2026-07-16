export interface Fixture {
  fixtureId: string;
  date: string; // YYYY-MM-DD UTC
  time: string; // HH:MM UTC
  home: string;
  away: string;
  round: "Group Stage" | "Round of 32" | "Semi-final" | "Final" | "Friendly";
}

export const FIXTURES: Fixture[] = [
  // ── Live now / upcoming (real fixture IDs from TxLINE fixtures snapshot) ────
  { fixtureId: "18257865", date: "2026-07-18", time: "21:00", home: "France",  away: "England",   round: "Semi-final" },
  { fixtureId: "18257739", date: "2026-07-19", time: "19:00", home: "Spain",   away: "Argentina", round: "Final" },
  { fixtureId: "18143850", date: "2026-07-18", time: "12:00", home: "Vietnam", away: "Myanmar",   round: "Friendly" },
  // ── Group Stage ──────────────────────────────────────────────────────────
  { fixtureId: "17588316", date: "2026-06-14", time: "01:00", home: "Haiti",          away: "Scotland",            round: "Group Stage" },
  { fixtureId: "17926689", date: "2026-06-14", time: "04:00", home: "Australia",      away: "Turkey",              round: "Group Stage" },
  { fixtureId: "17588318", date: "2026-06-14", time: "17:00", home: "Germany",        away: "Curacao",             round: "Group Stage" },
  { fixtureId: "17588305", date: "2026-06-14", time: "20:00", home: "Netherlands",    away: "Japan",               round: "Group Stage" },
  { fixtureId: "17588239", date: "2026-06-14", time: "23:00", home: "Ivory Coast",    away: "Ecuador",             round: "Group Stage" },
  { fixtureId: "17926553", date: "2026-06-15", time: "02:00", home: "Sweden",         away: "Tunisia",             round: "Group Stage" },
  { fixtureId: "17588403", date: "2026-06-15", time: "16:00", home: "Spain",          away: "Cape Verde",          round: "Group Stage" },
  { fixtureId: "17588230", date: "2026-06-15", time: "19:00", home: "Belgium",        away: "Egypt",               round: "Group Stage" },
  { fixtureId: "17588311", date: "2026-06-15", time: "22:00", home: "Saudi Arabia",   away: "Uruguay",             round: "Group Stage" },
  { fixtureId: "17588241", date: "2026-06-16", time: "01:00", home: "Iran",           away: "New Zealand",         round: "Group Stage" },
  { fixtureId: "17588306", date: "2026-06-16", time: "19:00", home: "France",         away: "Senegal",             round: "Group Stage" },
  { fixtureId: "17926828", date: "2026-06-16", time: "22:00", home: "Iraq",           away: "Norway",              round: "Group Stage" },
  { fixtureId: "17588322", date: "2026-06-17", time: "01:00", home: "Argentina",      away: "Algeria",             round: "Group Stage" },
  { fixtureId: "17588405", date: "2026-06-17", time: "04:00", home: "Austria",        away: "Jordan",              round: "Group Stage" },
  { fixtureId: "17926703", date: "2026-06-17", time: "17:00", home: "Portugal",       away: "Congo DR",            round: "Group Stage" },
  { fixtureId: "17588228", date: "2026-06-17", time: "20:00", home: "England",        away: "Croatia",             round: "Group Stage" },
  { fixtureId: "17588406", date: "2026-06-17", time: "23:00", home: "Ghana",          away: "Panama",              round: "Group Stage" },
  { fixtureId: "17588399", date: "2026-06-18", time: "02:00", home: "Uzbekistan",     away: "Colombia",            round: "Group Stage" },
  { fixtureId: "17926765", date: "2026-06-18", time: "16:00", home: "Czech Republic", away: "South Africa",        round: "Group Stage" },
  { fixtureId: "17926603", date: "2026-06-18", time: "19:00", home: "Switzerland",    away: "Bosnia & Herzegovina",round: "Group Stage" },
  { fixtureId: "17588238", date: "2026-06-18", time: "22:00", home: "Canada",         away: "Qatar",               round: "Group Stage" },
  { fixtureId: "17588223", date: "2026-06-19", time: "01:00", home: "Mexico",         away: "South Korea",         round: "Group Stage" },
  { fixtureId: "17588388", date: "2026-06-19", time: "19:00", home: "USA",            away: "Australia",           round: "Group Stage" },
  { fixtureId: "17588397", date: "2026-06-19", time: "22:00", home: "Scotland",       away: "Morocco",             round: "Group Stage" },
  { fixtureId: "17588317", date: "2026-06-20", time: "00:30", home: "Brazil",         away: "Haiti",               round: "Group Stage" },
  { fixtureId: "17588229", date: "2026-06-20", time: "03:00", home: "Turkey",         away: "Paraguay",            round: "Group Stage" },
  { fixtureId: "17926687", date: "2026-06-20", time: "17:00", home: "Netherlands",    away: "Sweden",              round: "Group Stage" },
  { fixtureId: "17588240", date: "2026-06-20", time: "20:00", home: "Germany",        away: "Ivory Coast",         round: "Group Stage" },
  { fixtureId: "17588320", date: "2026-06-20", time: "23:00", home: "Ecuador",        away: "Curacao",             round: "Group Stage" },
  { fixtureId: "17588310", date: "2026-06-21", time: "04:00", home: "Tunisia",        away: "Japan",               round: "Group Stage" },
  { fixtureId: "17588232", date: "2026-06-21", time: "16:00", home: "Spain",          away: "Saudi Arabia",        round: "Group Stage" },
  { fixtureId: "17588390", date: "2026-06-21", time: "19:00", home: "Belgium",        away: "Iran",                round: "Group Stage" },
  { fixtureId: "17588235", date: "2026-06-21", time: "22:00", home: "Uruguay",        away: "Cape Verde",          round: "Group Stage" },
  { fixtureId: "17588242", date: "2026-06-22", time: "01:00", home: "New Zealand",    away: "Egypt",               round: "Group Stage" },
  { fixtureId: "17588389", date: "2026-06-22", time: "17:00", home: "Argentina",      away: "Austria",             round: "Group Stage" },
  { fixtureId: "17926647", date: "2026-06-22", time: "21:00", home: "France",         away: "Iraq",                round: "Group Stage" },
  { fixtureId: "17588313", date: "2026-06-23", time: "00:00", home: "Norway",         away: "Senegal",             round: "Group Stage" },
  { fixtureId: "17588244", date: "2026-06-23", time: "03:00", home: "Jordan",         away: "Algeria",             round: "Group Stage" },
  { fixtureId: "17588231", date: "2026-06-23", time: "17:00", home: "Portugal",       away: "Uzbekistan",          round: "Group Stage" },
  { fixtureId: "17588324", date: "2026-06-23", time: "20:00", home: "England",        away: "Ghana",               round: "Group Stage" },
  { fixtureId: "17588401", date: "2026-06-23", time: "23:00", home: "Panama",         away: "Croatia",             round: "Group Stage" },
  { fixtureId: "17926615", date: "2026-06-24", time: "02:00", home: "Colombia",       away: "Congo DR",            round: "Group Stage" },
  { fixtureId: "17588303", date: "2026-06-24", time: "19:00", home: "Switzerland",    away: "Canada",              round: "Group Stage" },
  { fixtureId: "17926766", date: "2026-06-24", time: "19:00", home: "Bosnia & Herzegovina", away: "Qatar",         round: "Group Stage" },
  { fixtureId: "17588319", date: "2026-06-24", time: "22:00", home: "Morocco",        away: "Haiti",               round: "Group Stage" },
  { fixtureId: "17588398", date: "2026-06-24", time: "22:00", home: "Scotland",       away: "Brazil",              round: "Group Stage" },
  { fixtureId: "17588395", date: "2026-06-25", time: "01:00", home: "South Africa",   away: "South Korea",         round: "Group Stage" },
  { fixtureId: "17926764", date: "2026-06-25", time: "01:00", home: "Czech Republic", away: "Mexico",              round: "Group Stage" },
  { fixtureId: "17588302", date: "2026-06-25", time: "20:00", home: "Ecuador",        away: "Germany",             round: "Group Stage" },
  { fixtureId: "17588321", date: "2026-06-25", time: "20:00", home: "Curacao",        away: "Ivory Coast",         round: "Group Stage" },
  { fixtureId: "17588236", date: "2026-06-25", time: "23:00", home: "Tunisia",        away: "Netherlands",         round: "Group Stage" },
  { fixtureId: "17926686", date: "2026-06-25", time: "23:00", home: "Japan",          away: "Sweden",              round: "Group Stage" },
  { fixtureId: "17926593", date: "2026-06-26", time: "02:00", home: "Turkey",         away: "USA",                 round: "Group Stage" },
  { fixtureId: "17588234", date: "2026-06-26", time: "19:00", home: "Norway",         away: "France",              round: "Group Stage" },
  { fixtureId: "17926740", date: "2026-06-26", time: "19:00", home: "Senegal",        away: "Iraq",                round: "Group Stage" },
  { fixtureId: "17588314", date: "2026-06-27", time: "00:00", home: "Cape Verde",     away: "Saudi Arabia",        round: "Group Stage" },
  { fixtureId: "17588404", date: "2026-06-27", time: "00:00", home: "Uruguay",        away: "Spain",               round: "Group Stage" },
  { fixtureId: "17588309", date: "2026-06-27", time: "03:00", home: "Egypt",          away: "Iran",                round: "Group Stage" },
  { fixtureId: "17588323", date: "2026-06-27", time: "03:00", home: "New Zealand",    away: "Belgium",             round: "Group Stage" },
  { fixtureId: "17588245", date: "2026-06-27", time: "21:00", home: "Croatia",        away: "Ghana",               round: "Group Stage" },
  { fixtureId: "17588402", date: "2026-06-27", time: "21:00", home: "Panama",         away: "England",             round: "Group Stage" },
  { fixtureId: "17588391", date: "2026-06-27", time: "23:30", home: "Colombia",       away: "Portugal",            round: "Group Stage" },
  { fixtureId: "17926704", date: "2026-06-27", time: "23:30", home: "Congo DR",       away: "Uzbekistan",          round: "Group Stage" },
  { fixtureId: "17588325", date: "2026-06-28", time: "02:00", home: "Jordan",         away: "Argentina",           round: "Group Stage" },
  { fixtureId: "17588326", date: "2026-06-28", time: "02:00", home: "Algeria",        away: "Austria",             round: "Group Stage" },
  // ── Round of 32 ──────────────────────────────────────────────────────────
  { fixtureId: "18167317", date: "2026-06-28", time: "19:00", home: "South Africa",   away: "Canada",              round: "Round of 32" },
  { fixtureId: "18172469", date: "2026-06-29", time: "17:00", home: "Brazil",         away: "Japan",               round: "Round of 32" },
  { fixtureId: "18175983", date: "2026-06-29", time: "20:30", home: "Germany",        away: "Paraguay",            round: "Round of 32" },
  { fixtureId: "18172260", date: "2026-06-30", time: "01:00", home: "Netherlands",    away: "Morocco",             round: "Round of 32" },
  { fixtureId: "18175397", date: "2026-06-30", time: "17:00", home: "Ivory Coast",    away: "Norway",              round: "Round of 32" },
  { fixtureId: "18175981", date: "2026-06-30", time: "21:00", home: "France",         away: "Sweden",              round: "Round of 32" },
  { fixtureId: "18179759", date: "2026-07-01", time: "01:00", home: "Mexico",         away: "Ecuador",             round: "Round of 32" },
  { fixtureId: "18179764", date: "2026-07-01", time: "16:00", home: "England",        away: "Congo DR",            round: "Round of 32" },
  { fixtureId: "18179550", date: "2026-07-01", time: "20:00", home: "Belgium",        away: "Senegal",             round: "Round of 32" },
  { fixtureId: "18172379", date: "2026-07-02", time: "00:00", home: "USA",            away: "Bosnia & Herzegovina",round: "Round of 32" },
  { fixtureId: "18179551", date: "2026-07-02", time: "19:00", home: "Spain",          away: "Austria",             round: "Round of 32" },
  { fixtureId: "18179763", date: "2026-07-02", time: "23:00", home: "Portugal",       away: "Croatia",             round: "Round of 32" },
  { fixtureId: "18179552", date: "2026-07-03", time: "03:00", home: "Switzerland",    away: "Algeria",             round: "Round of 32" },
  { fixtureId: "18176123", date: "2026-07-03", time: "18:00", home: "Australia",      away: "Egypt",               round: "Round of 32" },
  { fixtureId: "18175918", date: "2026-07-03", time: "22:00", home: "Argentina",      away: "Cape Verde",          round: "Round of 32" },
  { fixtureId: "18179549", date: "2026-07-04", time: "01:30", home: "Colombia",       away: "Ghana",               round: "Round of 32" },
];

/** Returns true if the match is currently in progress (within 110 min of kickoff). */
export function isLive(f: Fixture): boolean {
  const now = Date.now();
  const kickoff = new Date(`${f.date}T${f.time}:00Z`).getTime();
  const elapsed = now - kickoff;
  return elapsed >= 0 && elapsed < 110 * 60 * 1000;
}

/** Returns true if kickoff has passed. */
export function isFinished(f: Fixture): boolean {
  const kickoff = new Date(`${f.date}T${f.time}:00Z`).getTime();
  return Date.now() > kickoff + 110 * 60 * 1000;
}
