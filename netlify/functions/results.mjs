// Netlify-funktio: hakee pelattujen otteluiden tulokset aina kun sivu ladataan.
// Vastaus pidetään Netlifyn välimuistissa 2 minuuttia, jotta lähteitä ei kuormiteta turhaan.
//
// Lähteet (ilmaiset, ei avainta):
//   Liiga  -> liiga.fi/api/v2/games
//   Mestis -> mestis.fi (otteluohjelmasivun HTML)
//   Muut   -> ESPN:n julkinen scoreboard-rajapinta

const DAYS = 14;            // montako päivää taaksepäin
const CACHE_SECONDS = 120;  // Netlifyn välimuistin kesto
const AHEAD_DAYS = 14;      // montako päivää eteenpäin etsitään tulevia otteluita
const NEXT_COUNT = 15;      // montako tulevaa ottelua palautetaan sarjaa kohden (sivu näyttää 5 tai 15)
const UA = "pitkavetotulokset/1.0 (+personal project)";

const ESPN_LEAGUES = [
  { id: "epl", name: "Valioliiga", sport: "fb", path: "soccer/eng.1" },
  { id: "laliga", name: "La Liga", sport: "fb", path: "soccer/esp.1" },
  { id: "ucl", name: "Mestarien liiga", sport: "fb", path: "soccer/uefa.champions" },
  { id: "nhl", name: "NHL", sport: "ih", path: "hockey/nhl" },
  { id: "nba", name: "NBA", sport: "bb", path: "basketball/nba" },
];

async function getJSON(url) {
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return await r.json();
  } catch (e) {
    console.warn("Haku epäonnistui:", url, e.message);
    return null;
  }
}

async function getText(url) {
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html" } });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return await r.text();
  } catch (e) {
    console.warn("Haku epäonnistui:", url, e.message);
    return "";
  }
}

const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, "");

// ------------------------------------------------------------ Liiga
async function fetchLiiga(now, start) {
  const season = now.getUTCMonth() >= 6 ? now.getUTCFullYear() + 1 : now.getUTCFullYear(); // kausi 2026–27 = "2027"
  const data = (await getJSON(`https://liiga.fi/api/v2/games?tournament=runkosarja&season=${season}`)) || [];
  const games = [];
  const upcoming = data
    .filter((g) => !g.started && new Date(g.start) > now)
    .sort((a, b) => new Date(a.start) - new Date(b.start))
    .slice(0, NEXT_COUNT)
    .map((g) => ({ t: new Date(g.start).toISOString(), home: g.homeTeam.teamName || "?", away: g.awayTeam.teamName || "?" }));
  for (const g of data) {
    const t = new Date(g.start);
    if (t < start || t > now || !g.ended) continue;
    const ft = g.finishedType || "";
    let note = "";
    if (ft.includes("WINNING_SHOT")) note = "vl";
    else if (ft.includes("EXTENDED") || ft.includes("OVERTIME")) note = "ja";
    let regH = null, regA = null;
    if (note) {
      const per = (g.periods || []).filter((p) => p.category === "NORMAL");
      regH = per.reduce((s, p) => s + p.homeTeamGoals, 0);
      regA = per.reduce((s, p) => s + p.awayTeamGoals, 0);
    }
    games.push({
      t: t.toISOString(),
      home: g.homeTeam.teamName || "?", away: g.awayTeam.teamName || "?",
      hs: g.homeTeam.goals, as: g.awayTeam.goals,
      status: "post", note, regH, regA,
    });
  }
  return { id: "liiga", name: "Suomi", sport: "ih", games, upcoming };
}

// ------------------------------------------------------------ Mestis
const decode = (s) => s.replace(/&mdash;/g, "—").replace(/&ndash;/g, "–").replace(/&amp;/g, "&")
  .replace(/&auml;/g, "ä").replace(/&ouml;/g, "ö").replace(/&Auml;/g, "Ä").replace(/&Ouml;/g, "Ö")
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
const cells = (row) => [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)]
  .map((m) => decode(m[1].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim());

// Muuntaa Suomen paikallisen ajan UTC:ksi (huomioi kesäajan).
function helsinkiToUTC(y, mo, d, h, mi) {
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Helsinki", hour: "2-digit", hourCycle: "h23" });
  const localHour = +fmt.format(new Date(guess));
  const offset = ((localHour - h + 24) % 24); // 2 tai 3 tuntia
  return new Date(guess - offset * 3600e3);
}

async function fetchMestis(now, start) {
  const y = now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  const html = await getText(`https://mestis.fi/fi/ottelut/${y}-${y + 1}/runkosarja/`);
  const games = [];
  const upcoming = [];
  for (const m of html.matchAll(/<tr data-time="(\d{8})">([\s\S]*?)<\/tr>/g)) {
    const c = cells(m[2]);
    if (c.length < 7 || !c[3].includes(" - ")) continue;
    const day = m[1];
    const [hh, mm] = (c[2] || "18:30").split(":").map(Number);
    const t = helsinkiToUTC(+day.slice(0, 4), +day.slice(4, 6), +day.slice(6, 8), hh || 18, mm || 0);
    const sc = c[5].match(/(\d+)\D+(\d+)/);
    const [home, away] = c[3].split(" - ").map((s) => s.trim());
    if (!sc && t > now) { upcoming.push({ t: t.toISOString(), home, away }); continue; }
    if (t < start || t > now || !sc) continue;
    const note = { JA: "ja", VL: "vl" }[c[6].toUpperCase()] || "";
    const hs = +sc[1], as = +sc[2];
    const reg = note ? Math.min(hs, as) : null;
    games.push({ t: t.toISOString(), home, away, hs, as, status: "post", note, regH: reg, regA: reg });
  }
  upcoming.sort((a, b) => new Date(a.t) - new Date(b.t));
  return { id: "mestis", name: "Mestis", sport: "ih", games, upcoming: upcoming.slice(0, NEXT_COUNT) };
}

// ------------------------------------------------------------ ESPN
async function fetchEspn(lg, now, start) {
  const days = [];
  const until = new Date(now.getTime() + AHEAD_DAYS * 864e5);
  for (let d = new Date(start); d <= until; d = new Date(d.getTime() + 864e5)) days.push(ymd(d));
  const results = await Promise.all(days.map((d) =>
    getJSON(`https://site.api.espn.com/apis/site/v2/sports/${lg.path}/scoreboard?dates=${d}`)));
  const seen = new Set();
  const games = [];
  const upcoming = [];
  for (const data of results) {
    for (const e of data?.events || []) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      const c = e.competitions[0];
      const st = c.status.type;
      const home = c.competitors.find((x) => x.homeAway === "home");
      const away = c.competitors.find((x) => x.homeAway === "away");
      const nm = (x) => x.team.shortDisplayName || x.team.displayName;
      if (st.state === "pre" && new Date(e.date) > now) {
        upcoming.push({ t: new Date(e.date).toISOString(), home: nm(home), away: nm(away) });
        continue;
      }
      if (st.state !== "post") continue;
      const detail = (st.shortDetail || st.detail || "").toUpperCase();
      let note = "";
      if (detail.includes("SO")) note = "vl";
      else if (detail.includes("OT") || detail.includes("AET")) note = "ja";
      else if (detail.includes("PEN")) note = "rp";
      games.push({
        t: new Date(e.date).toISOString(),
        home: home.team.shortDisplayName || home.team.displayName,
        away: away.team.shortDisplayName || away.team.displayName,
        hs: +home.score, as: +away.score,
        status: "post", note, regH: null, regA: null,
      });
    }
  }
  upcoming.sort((a, b) => new Date(a.t) - new Date(b.t));
  return { id: lg.id, name: lg.name, sport: lg.sport, games, upcoming: upcoming.slice(0, NEXT_COUNT) };
}

export default async () => {
  const now = new Date();
  const start = new Date(now.getTime() - DAYS * 864e5);
  start.setUTCHours(0, 0, 0, 0);

  const leagues = await Promise.all([
    fetchLiiga(now, start),
    fetchMestis(now, start),
    ...ESPN_LEAGUES.map((lg) => fetchEspn(lg, now, start)),
  ]);

  const body = JSON.stringify({ generated: now.toISOString(), leagues });
  return new Response(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      // Selain hakee aina uudestaan, Netlifyn CDN pitää vastauksen hetken välimuistissa.
      "Cache-Control": "public, max-age=0, must-revalidate",
      "Netlify-CDN-Cache-Control": `public, durable, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=600`,
    },
  });
};

export const config = { path: "/api/results" };
