// @ts-nocheck
// Before/after verification for 3 specific dates + cluster spread analysis

const CAT_ORD = { "\uAD00\uACC4":0,"\uC77C":1,"\uC18C\uD1B5":2,"\uB0B4\uBA74":3,"\uC774\uB3D9":4,"\uC9D1":5,"\uD589\uC6B4":6,"\uAE34\uC7A5":7 };
const ASP = ["conjunction","sextile","square","trine","opposition"];

// mirrors current pickInsightCopy seed formula
function seedFor(day, position, co, atH, houseH) {
  return day * 31 + position * 7 + co * 13 + atH * 3 + houseH * 17;
}

// old seed (no atH/houseH)
function oldSeedFor(day, position, co) {
  return day * 31 + position * 7 + co * 13;
}

// Mock DayScores aligned closely to what a real chart would produce
const CASES = [
  {
    label: "2026-04-02 (오늘)",
    ds: { day:2, score:68, tone:"strength", topDomain:"\uAD00\uACC4", secondDomain:"\uC0AC\uACE0\u00B7\uD45C\uD604",
          icons:["\u2661"], aspectType:"trine", applying:true, dominantHouse:5, planetPair:"Venus-Sun" },
  },
  {
    label: "2026-04-24",
    ds: { day:24, score:44, tone:"challenge", topDomain:"\uAC10\uC815\u00B7\uB0B4\uBA74", secondDomain:null,
          icons:["\u2726"], aspectType:"square", applying:true, dominantHouse:12, planetPair:"Saturn-Moon" },
  },
  {
    label: "2026-10-14",
    ds: { day:14, score:82, tone:"strength", topDomain:"\uB8E8\uD2F4\u00B7\uC77C", secondDomain:"\uC18C\uD1B5",
          icons:["\u2605","\uD83D\uDCAC"], aspectType:"conjunction", applying:true, dominantHouse:10, planetPair:"Jupiter-Mercury" },
  },
];

// Map aspect context
function getAspectCtx(ds) {
  if (!ds?.aspectType) return "base";
  const { aspectType: at, applying } = ds;
  if (at === "trine" || at === "sextile") return "harmonious";
  if (at === "conjunction" && applying) return "intense";
  if ((at === "square" || at === "opposition") && applying) return "tense";
  return "base";
}

// Category derivation (mirrors page.tsx)
const SERVER_TO_CAT = { "\u2661":"\uAD00\uACC4","\u2605":"\uC77C","\uD83D\uDCAC":"\uC18C\uD1B5","\u2726":"\uB0B4\uBA74" };
const DOM_TO_CAT = { "\uAD00\uACC4":"\uAD00\uACC4","\uB8E8\uD2F4\u00B7\uC77C":"\uC77C","\uC0AC\uACE0\u00B7\uD45C\uD604":"\uC18C\uD1B5","\uAC10\uC815\u00B7\uB0B4\uBA74":"\uB0B4\uBA74" };

function deriveCats(ds) {
  const cats = []; const seen = new Set();
  const add = c => { if (!seen.has(c)) { cats.push(c); seen.add(c); } };
  const { aspectType:at, applying, score, tone } = ds;
  if ((at==="square"||at==="opposition") && applying && score<60) add("\uAE34\uC7A5");
  if (at==="conjunction" && applying && score>=70) add("\uD589\uC6B4");
  else if (at==="trine" && applying && score>=65) add("\uD589\uC6B4");
  else if (score>=82 && tone!=="challenge") add("\uD589\uC6B4");
  if (!seen.has("\uAE34\uC7A5") && tone==="challenge" && score<40) add("\uAE34\uC7A5");
  if (!seen.has("\uD589\uC6B4") && score>=78 && tone!=="challenge") add("\uD589\uC6B4");
  for (const ic of ds.icons) {
    if (ic==="\u2B50") continue;
    const cat = SERVER_TO_CAT[ic]; if (cat) add(cat);
    if (cats.length>=3) break;
  }
  if (cats.length<3 && ds.topDomain) { const c=DOM_TO_CAT[ds.topDomain]; if(c) add(c); }
  if (cats.length<3 && ds.secondDomain) { const c=DOM_TO_CAT[ds.secondDomain]; if(c) add(c); }
  if (cats.length<2) {
    if (score>=62 && tone!=="challenge" && applying) add("\uC774\uB3D9");
    else if (tone==="neutral" && score>=30) add("\uC9D1");
  }
  if (cats.length===0) add("\uAD00\uACC4");
  return cats.slice(0,3);
}

// --- tiny CAT_COPY excerpts for illustration (first entry only per ctx) ---
const COPY_PREVIEW = {
  "\uAD00\uACC4": { harmonious:"끌림이 자연스럽게 흐르는 날  /  억지로 만들 필요 없이 연결이 부드럽게 이어집니다.", intense:"강한 연결이 시작되는 날  /  오늘 만나는 사람과의 인상이 예상보다 오래 남습니다.", tense:"감정은 앞서지만 결론은 미뤄야 하는 날  /  강하게 느끼는 것이 맞을 수도 있지만, 말은 내일 꺼내세요.", base:"연결이 활발해지는 날  /  먼저 연락하는 쪽이 유리합니다." },
  "\uC77C": { harmonious:"흐름 좋게 진행되는 날  /  억지로 밀지 않아도 일이 자연스럽게 풀립니다.", intense:"집중력이 최고조인 날  /  중요한 일을 오늘 마무리할 수 있습니다.", tense:"우선순위를 좁혀야 하는 날  /  모든 것을 다 하려 하면 하나도 제대로 안 됩니다.", base:"집중력이 올라가는 날  /  밀린 일을 처리하기에 지금이 딱 좋습니다." },
  "\uC18C\uD1B5": { harmonious:"말이 술술 풀리는 날  /  평소보다 표현이 자연스럽고 잘 전달됩니다.", intense:"언어가 가장 강해지는 날  /  오늘 한 말이 오래 기억됩니다.", tense:"말보다 질문이 중요한 날  /  주장하기보다 상대방의 의도를 먼저 파악하세요.", base:"말이 잘 통하는 날  /  오늘의 대화는 생각보다 멀리 닿습니다." },
  "\uB0B4\uBA74": { harmonious:"자기 이해가 깊어지는 날  /  자신에 대해 새로운 것을 발견할 수 있습니다.", intense:"내면의 변화가 시작되는 날  /  지금 느끼는 것이 앞으로의 방향을 결정할 수 있습니다.", tense:"감정 기복이 커질 수 있는 날  /  즉흥적으로 밀어붙이기보다 호흡을 한 번 고르세요.", base:"직관이 날카로운 날  /  논리보다 감각을 먼저 믿어볼 만합니다." },
  "\uD589\uC6B4": { harmonious:"우호적인 흐름이 뒷받침되는 날", intense:"에너지가 가장 강하게 정렬되는 날", tense:"기회는 있지만 조건이 까다로운 날", base:"에너지가 정렬된 날" },
  "\uAE34\uC7A5": { harmonious:"긴장이 풀리기 시작하는 날", intense:"결론을 내야 하는 날", tense:"흐름을 거스르지 않는 날", base:"흐름을 거스르지 않는 날" },
  "\uC774\uB3D9": { harmonious:"이동이 좋은 결과로 이어지는 날", intense:"중요한 이동이 있는 날", tense:"이동이 예상보다 복잡해지는 날", base:"이동이 많아지는 날" },
  "\uC9D1": { harmonious:"머무는 것이 자연스러운 날", intense:"공간을 재정비하기 좋은 날", tense:"집 문제가 신경 쓰이는 날", base:"내 공간에서 충전하기 좋은 날" },
};

console.log("=== 3-date before/after comparison ===\n");

for (const c of CASES) {
  const cats = deriveCats(c.ds);
  const ctx  = getAspectCtx(c.ds);
  console.log(`── ${c.label}`);
  console.log(`   cats:  [${cats.join(", ")}]   ctx: ${ctx}`);
  console.log(`   asp: ${c.ds.aspectType}/${c.ds.applying?"appl":"sep"}  score=${c.ds.score} tone=${c.ds.tone}`);
  console.log();
  cats.forEach((cat, i) => {
    const co    = CAT_ORD[cats.find(x => x!==cat) ?? cat] ?? 0;
    const atH   = c.ds.aspectType ? ASP.indexOf(c.ds.aspectType)+1 : 0;
    const houseH = (c.ds.dominantHouse??0)%4;
    const oldSeed = oldSeedFor(c.ds.day, i, co);
    const newSeed = seedFor(c.ds.day, i, co, atH, houseH);
    const prevPool = COPY_PREVIEW[cat];
    const copy = prevPool ?prevPool[ctx] : "—";
    console.log(`   [${i}] ${cat}  (oldIdx=${oldSeed%4}→${oldSeed%6}|newIdx=${newSeed%6})`);
    console.log(`        ↳ ${copy}`);
  });
  console.log();
}

// --- cluster spread: simulate 30-day month with pseudo-random DayScores ---
console.log("=== 30-day cluster variety check (seed-only mode) ===");
const cats30 = [];
for (let d=1; d<=30; d++) {
  const seed = d*31 + 3*37;
  const FB = ["\uAD00\uACC4","\uC77C","\uC18C\uD1B5","\uB0B4\uBA74","\uC774\uB3D9","\uC9D1"];
  // Simulate what deriveDateCats returns without real API data
  const cat = (seed%29)<5 ? null : FB[(seed*4999)%FB.length];
  cats30.push(cat);
}

// now apply simplified Pass 3 + Pass 4 mirror
const result = {};
for (let d=1; d<=30; d++) result[d] = cats30[d-1] ? [cats30[d-1]] : [];

// Pass 3
for (let d=2; d<=30; d++) {
  const prev=result[d-1]; const curr=result[d];
  if (prev?.length && curr?.length>1 && curr[0]===prev[0]) {
    const r=[...curr]; [r[0],r[1]]=[r[1],r[0]]; result[d]=r;
  }
}

const seq = Object.values(result).map(c=>c[0]??"-");
console.log("  " + seq.join("  "));

// Count consecutive runs
let maxRun=1, run=1;
for (let i=1; i<seq.length; i++) {
  if (seq[i]===seq[i-1] && seq[i]!=="-") run++;
  else run=1;
  maxRun=Math.max(maxRun,run);
}
console.log(`  longest consecutive same-primary run: ${maxRun}`);

// Cluster pair frequency
const pairs = {};
for (let d=1; d<=30; d++) {
  const c=result[d];
  if (c?.length>=2) { const k=`${c[0]}+${c[1]}`; pairs[k]=(pairs[k]??0)+1; }
}
const sorted = Object.entries(pairs).sort((a,b)=>b[1]-a[1]);
console.log("  top cluster pairs:", sorted.slice(0,5).map(([k,v])=>`${k}(${v})`).join(", "));
