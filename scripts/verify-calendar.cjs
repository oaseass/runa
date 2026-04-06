// @ts-nocheck
// Verification: simulate deriveDateCats for April/May/June 2026 with mock DayScore data

// ── Mirror of the functions in calendar/page.tsx ────────────────────────────

const SERVER_TO_CAT = {
  "\u2661": "\uAD00\uACC4",
  "\u2605": "\uC77C",
  "\uD83D\uDCAC": "\uC18C\uD1B5",
  "\u2726": "\uB0B4\uBA74",
};
const DOM_TO_CAT = {
  "\uAD00\uACC4": "\uAD00\uACC4",
  "\uB8E8\uD2F4\u00B7\uC77C": "\uC77C",
  "\uC0AC\uACE0\u00B7\uD45C\uD604": "\uC18C\uD1B5",
  "\uAC10\uC815\u00B7\uB0B4\uBA74": "\uB0B4\uBA74",
};
const HOUSE_TO_CAT = {
  1:"\uB0B4\uBA74", 2:"\uC77C", 3:"\uC18C\uD1B5", 4:"\uC9D1",
  5:"\uAD00\uACC4", 6:"\uC77C", 7:"\uAD00\uACC4", 8:"\uB0B4\uBA74",
  9:"\uC774\uB3D9", 10:"\uC77C", 11:"\uC18C\uD1B5", 12:"\uC9D1",
};
function getPlanetPairCat(pair) {
  if (!pair) return null;
  if (pair.startsWith("Venus")) return "\uAD00\uACC4";
  if (pair.startsWith("Jupiter")) return "\uD589\uC6B4";
  if (pair.startsWith("Saturn"))
    return (pair.includes("Sun") || pair.includes("Moon")) ? "\uAE34\uC7A5" : "\uB0B4\uBA74";
  if (pair.startsWith("Mars")) return "\uC774\uB3D9";
  if (pair === "Moon-Venus" || pair === "Moon-Jupiter") return "\uAD00\uACC4";
  return null;
}

function deriveDateCats(day, month, year, ds) {
  if (!ds) {
    const seed = day * 31 + month * 37 + (year - 2026) * 1009;
    if ((seed % 29) < 5) return [];
    const FB = ["\uAD00\uACC4","\uC77C","\uC18C\uD1B5","\uB0B4\uBA74","\uC774\uB3D9","\uC9D1"];
    return [FB[(seed * 4999) % FB.length]];
  }
  const cats = []; const seen = new Set();
  const add = (c) => { if (!seen.has(c)) { cats.push(c); seen.add(c); } };
  const { aspectType: at, applying, score, tone } = ds;
  if ((at === "square" || at === "opposition") && applying && score < 60) add("\uAE34\uC7A5");
  if (at === "conjunction" && applying && score >= 70) add("\uD589\uC6B4");
  else if (at === "trine" && applying && score >= 65) add("\uD589\uC6B4");
  else if (score >= 82 && tone !== "challenge") add("\uD589\uC6B4");
  if (!seen.has("\uAE34\uC7A5") && tone === "challenge" && score < 40) add("\uAE34\uC7A5");
  if (!seen.has("\uD589\uC6B4") && score >= 78 && tone !== "challenge") add("\uD589\uC6B4");
  for (const ic of ds.icons) {
    if (ic === "\u2B50") continue;
    const cat = SERVER_TO_CAT[ic];
    if (cat) add(cat);
    if (cats.length >= 3) break;
  }
  if (cats.length < 3 && ds.topDomain) { const c = DOM_TO_CAT[ds.topDomain]; if (c) add(c); }
  if (cats.length < 3 && ds.secondDomain) { const c = DOM_TO_CAT[ds.secondDomain]; if (c) add(c); }
  if (cats.length < 3) { const pc = getPlanetPairCat(ds.planetPair); if (pc) add(pc); }
  if (cats.length < 3 && ds.dominantHouse) { const hc = HOUSE_TO_CAT[ds.dominantHouse]; if (hc) add(hc); }
  if (cats.length < 2) {
    if (score >= 62 && tone !== "challenge" && applying) add("\uC774\uB3D9");
    else if (tone === "neutral" && score >= 30) add("\uC9D1");
  }
  if (cats.length === 0) {
    const seed = day * 31 + month * 37 + (year - 2026) * 1009;
    const FB = ["\uAD00\uACC4","\uC77C","\uC18C\uD1B5","\uB0B4\uBA74","\uC774\uB3D9","\uC9D1"];
    add(FB[(seed * 4999) % FB.length]);
  }
  return cats.slice(0, 3);
}

function getAspectCtx(ds) {
  if (!ds?.aspectType) return "base";
  const { aspectType: at, applying } = ds;
  if (at === "trine" || at === "sextile") return "harmonious";
  if (at === "conjunction" && applying) return "intense";
  if ((at === "square" || at === "opposition") && applying) return "tense";
  return "base";
}

// ── Mock DayScores — one rich entry per sample date ─────────────────────────
// Designed to exercise all 4 copy contexts and all 8 categories across the 15 dates.

const SAMPLES = [
  // === Apr 2026 ===
  { day:3,  month:3, year:2026, ds:{ day:3,  score:71, tone:"strength", topDomain:"\uAD00\uACC4", secondDomain:"\uC0AC\uACE0\u00B7\uD45C\uD604", icons:["\u2661"], aspectType:"trine",       applying:true,  dominantHouse:5,  planetPair:"Venus-Sun"    }},
  { day:7,  month:3, year:2026, ds:{ day:7,  score:38, tone:"challenge", topDomain:"\uAC10\uC815\u00B7\uB0B4\uBA74", secondDomain:null, icons:["\u2726"], aspectType:"square",       applying:true,  dominantHouse:12, planetPair:"Saturn-Moon"  }},
  { day:14, month:3, year:2026, ds:{ day:14, score:85, tone:"strength", topDomain:"\uB8E8\uD2F4\u00B7\uC77C",     secondDomain:"\uC0AC\uACE0\u00B7\uD45C\uD604", icons:["\u2605","\uD83D\uDCAC"], aspectType:"conjunction", applying:true,  dominantHouse:10, planetPair:"Jupiter-Mercury"}},
  { day:20, month:3, year:2026, ds:{ day:20, score:54, tone:"neutral",  topDomain:null,             secondDomain:null, icons:[],  aspectType:"sextile",      applying:false, dominantHouse:4,  planetPair:"Moon-Venus"   }},
  { day:27, month:3, year:2026, ds:{ day:27, score:67, tone:"strength", topDomain:"\uC0AC\uACE0\u00B7\uD45C\uD604", secondDomain:"\uAD00\uACC4", icons:["\uD83D\uDCAC"], aspectType:"opposition",  applying:true,  dominantHouse:3,  planetPair:"Mars-Sun"     }},
  // === May 2026 ===
  { day:2,  month:4, year:2026, ds:{ day:2,  score:78, tone:"strength", topDomain:"\uAD00\uACC4",   secondDomain:"\uB8E8\uD2F4\u00B7\uC77C", icons:["\u2661"], aspectType:"trine",       applying:false, dominantHouse:7,  planetPair:"Venus-Moon"   }},
  { day:9,  month:4, year:2026, ds:{ day:9,  score:42, tone:"challenge", topDomain:"\uB8E8\uD2F4\u00B7\uC77C", secondDomain:null, icons:["\u2605"], aspectType:"square",       applying:false, dominantHouse:6,  planetPair:"Saturn-Sun"   }},
  { day:16, month:4, year:2026, ds:{ day:16, score:63, tone:"neutral",  topDomain:null,             secondDomain:"\uAC10\uC815\u00B7\uB0B4\uBA74", icons:[], aspectType:"conjunction",  applying:true,  dominantHouse:9,  planetPair:"Mars-Jupiter" }},
  { day:22, month:4, year:2026, ds:{ day:22, score:88, tone:"strength", topDomain:"\uC0AC\uACE0\u00B7\uD45C\uD604", secondDomain:"\uAD00\uACC4", icons:["\uD83D\uDCAC","\u2661"], aspectType:"conjunction", applying:true, dominantHouse:11, planetPair:"Jupiter-Sun"}},
  { day:29, month:4, year:2026, ds:{ day:29, score:35, tone:"challenge", topDomain:"\uAC10\uC815\u00B7\uB0B4\uBA74", secondDomain:null, icons:["\u2726"], aspectType:"opposition",  applying:true,  dominantHouse:8,  planetPair:"Saturn-Venus" }},
  // === Jun 2026 ===
  { day:4,  month:5, year:2026, ds:{ day:4,  score:60, tone:"neutral",  topDomain:null,             secondDomain:null, icons:[],  aspectType:null,          applying:null,  dominantHouse:4,  planetPair:null           }},
  { day:11, month:5, year:2026, ds:{ day:11, score:72, tone:"strength", topDomain:"\uAD00\uACC4",   secondDomain:"\uB8E8\uD2F4\u00B7\uC77C", icons:["\u2661","\u2605"], aspectType:"sextile",  applying:true, dominantHouse:5,  planetPair:"Venus-Jupiter"}},
  { day:18, month:5, year:2026, ds:{ day:18, score:51, tone:"neutral",  topDomain:"\uB8E8\uD2F4\u00B7\uC77C", secondDomain:"\uC0AC\uACE0\u00B7\uD45C\uD604", icons:["\u2605"], aspectType:"trine", applying:false, dominantHouse:2, planetPair:"Moon-Sun"}},
  { day:24, month:5, year:2026, ds:{ day:24, score:44, tone:"challenge", topDomain:null,             secondDomain:null, icons:[], aspectType:"square",       applying:true,  dominantHouse:1,  planetPair:"Saturn-Moon"  }},
  { day:30, month:5, year:2026, ds:{ day:30, score:80, tone:"strength", topDomain:"\uAC10\uC815\u00B7\uB0B4\uBA74", secondDomain:"\uAD00\uACC4", icons:["\u2726"], aspectType:"trine",      applying:true,  dominantHouse:8,  planetPair:"Jupiter-Moon" }},
];

const MONTHS = ["Apr","May","Jun"];

console.log("=== Luna Calendar — deriveDateCats + pickInsightCopy verification ===\n");

let currentMonth = -1;
for (const s of SAMPLES) {
  if (s.month !== currentMonth) {
    currentMonth = s.month;
    console.log(`\n── ${MONTHS[s.month - 3]} 2026 ────────────────────────────────────────`);
  }
  const cats = deriveDateCats(s.day, s.month, s.year, s.ds);
  const ctx  = getAspectCtx(s.ds);
  const asp  = `${s.ds.aspectType ?? "none"}/${s.ds.applying === true ? "appl" : s.ds.applying === false ? "sep" : "-"}`;
  console.log(`  ${MONTHS[s.month-3]} ${String(s.day).padStart(2,"0")}  score=${s.ds.score} tone=${s.ds.tone.slice(0,3)} asp=${asp.padEnd(18," ")} ctx=${ctx.padEnd(10," ")} → [${cats.join(", ")}]`);
}

console.log("\n=== Context distribution ===");
const ctxFreq = {};
for (const s of SAMPLES) {
  const ctx = getAspectCtx(s.ds);
  ctxFreq[ctx] = (ctxFreq[ctx] ?? 0) + 1;
}
for (const [k,v] of Object.entries(ctxFreq)) {
  console.log(`  ${k.padEnd(12)}: ${v} dates`);
}

console.log("\n=== Category distribution (primary slot) ===");
const catFreq = {};
for (const s of SAMPLES) {
  const cats = deriveDateCats(s.day, s.month, s.year, s.ds);
  if (cats.length) catFreq[cats[0]] = (catFreq[cats[0]] ?? 0) + 1;
}
for (const [k,v] of Object.entries(catFreq)) {
  console.log(`  ${k.padEnd(6)}: ${v}`);
}
