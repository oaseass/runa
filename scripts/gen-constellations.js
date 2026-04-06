// Generates 12 zodiac constellation SVGs
// Stars: {x, y, r} — r = visual radius (brightness proxy)
// Lines: [fromIdx, toIdx]

const constellations = {
  aries: {
    label: "ARIES",
    stars: [
      {x:100, y:192, r:2.5},  // 0: 41 Ari
      {x:192, y:208, r:5.5},  // 1: Hamal α (brightest)
      {x:234, y:220, r:3.5},  // 2: Sheratan β
      {x:257, y:224, r:2.8},  // 3: Mesarthim γ
    ],
    lines: [[0,1],[1,2],[2,3]],
  },
  taurus: {
    label: "TAURUS",
    stars: [
      {x:220, y:232, r:6.5},  // 0: Aldebaran α (1st mag)
      {x:198, y:215, r:3.5},  // 1: θ1 Tau
      {x:178, y:195, r:4.0},  // 2: γ Tau (Hyadum I)
      {x:172, y:220, r:3.5},  // 3: δ Tau
      {x:205, y:207, r:3.0},  // 4: ε Tau
      {x:265, y:148, r:4.5},  // 5: Elnath β (horn tip)
      {x:295, y:172, r:3.5},  // 6: ζ Tau (2nd horn)
      {x:130, y:150, r:3.5},  // 7: Alcyone (Pleiades)
      {x:118, y:136, r:2.5},  // 8: Atlas
      {x:140, y:140, r:2.5},  // 9: Electra
      {x:127, y:158, r:2.2},  // 10: Maia
      {x:138, y:162, r:2.0},  // 11: Merope
    ],
    lines: [[2,1],[1,0],[0,4],[4,3],[0,5],[5,6],[2,7]],
  },
  gemini: {
    label: "GEMINI",
    stars: [
      {x:155, y:118, r:4.5},  // 0: Castor α
      {x:215, y:132, r:5.0},  // 1: Pollux β (brightest)
      {x:148, y:152, r:3.0},  // 2: ε Gem
      {x:210, y:162, r:3.5},  // 3: μ Gem
      {x:152, y:188, r:4.0},  // 4: η Gem
      {x:205, y:195, r:3.0},  // 5: ν Gem
      {x:165, y:222, r:3.5},  // 6: ξ Gem
      {x:212, y:230, r:3.0},  // 7: δ Gem
      {x:160, y:258, r:4.0},  // 8: γ Gem (Alhena)
      {x:228, y:270, r:3.5},  // 9: Wasat δ
      {x:170, y:292, r:3.5},  // 10: Propus η
      {x:235, y:298, r:3.0},  // 11: Mebsuda ε
    ],
    lines: [[0,2],[2,4],[4,6],[6,8],[8,10],[1,3],[3,5],[5,7],[7,9],[9,11],[10,11],[0,1]],
  },
  cancer: {
    label: "CANCER",
    stars: [
      {x:145, y:255, r:3.0},  // 0: Acubens α
      {x:250, y:245, r:3.0},  // 1: Al Tarf β (brightest)
      {x:200, y:188, r:2.5},  // 2: Asellus Borealis γ
      {x:215, y:212, r:2.5},  // 3: Asellus Australis δ
      {x:245, y:155, r:2.5},  // 4: ι Cnc
    ],
    lines: [[0,3],[1,3],[2,3],[2,4]],
  },
  leo: {
    label: "LEO",
    stars: [
      {x:118, y:245, r:6.5},  // 0: Regulus α (1st mag)
      {x:138, y:202, r:3.5},  // 1: η Leo
      {x:165, y:172, r:4.5},  // 2: γ Leo (Algieba)
      {x:205, y:162, r:3.8},  // 3: ζ Leo (Adhafera)
      {x:238, y:175, r:3.8},  // 4: μ Leo
      {x:258, y:202, r:3.5},  // 5: ε Leo
      {x:250, y:168, r:3.5},  // 6: λ Leo
      {x:310, y:212, r:4.0},  // 7: Denebola β (tail)
      {x:278, y:248, r:3.5},  // 8: δ Leo (Zosma)
      {x:285, y:235, r:3.0},  // 9: θ Leo
    ],
    lines: [[0,1],[1,2],[2,3],[3,4],[4,5],[5,0],[3,6],[6,4],[7,8],[8,9],[9,7],[8,5]],
  },
  virgo: {
    label: "VIRGO",
    stars: [
      {x:255, y:302, r:7.0},  // 0: Spica α (1st mag)
      {x:210, y:232, r:4.5},  // 1: γ Vir (Porrima)
      {x:178, y:195, r:4.0},  // 2: η Vir (Zaniah)
      {x:145, y:158, r:4.5},  // 3: β Vir (Zavijava)
      {x:185, y:165, r:3.5},  // 4: δ Vir
      {x:220, y:182, r:4.0},  // 5: ε Vir (Vindemiatrix)
      {x:268, y:200, r:3.5},  // 6: ζ Vir
      {x:290, y:245, r:3.5},  // 7: τ Vir
      {x:145, y:228, r:3.5},  // 8: 109 Vir
    ],
    lines: [[0,1],[1,2],[2,3],[2,4],[4,5],[5,1],[5,6],[6,7],[7,0],[1,8]],
  },
  libra: {
    label: "LIBRA",
    stars: [
      {x:160, y:240, r:3.5},  // 0: Zubenelgenubi α (south scale)
      {x:238, y:195, r:4.0},  // 1: Zubeneschamali β (north scale, brightest)
      {x:198, y:292, r:3.0},  // 2: σ Lib
      {x:200, y:232, r:3.0},  // 3: υ Lib
      {x:255, y:258, r:3.0},  // 4: γ Lib
    ],
    lines: [[0,1],[0,3],[1,3],[3,2],[0,4],[4,1]],
  },
  scorpius: {
    label: "SCORPIUS",
    stars: [
      {x:175, y:168, r:3.5},  // 0: σ Sco
      {x:200, y:185, r:8.0},  // 1: Antares α (1st mag, huge)
      {x:235, y:192, r:3.5},  // 2: τ Sco
      {x:252, y:210, r:4.0},  // 3: ε Sco
      {x:258, y:232, r:3.5},  // 4: μ¹ Sco
      {x:252, y:255, r:3.5},  // 5: ζ Sco
      {x:240, y:278, r:3.5},  // 6: η Sco
      {x:222, y:296, r:3.5},  // 7: θ Sco
      {x:205, y:310, r:4.0},  // 8: ι Sco
      {x:188, y:320, r:4.5},  // 9: κ Sco
      {x:172, y:322, r:5.0},  // 10: λ Sco (Shaula)
      {x:160, y:312, r:4.0},  // 11: υ Sco
      {x:148, y:158, r:3.5},  // 12: δ Sco
      {x:165, y:142, r:3.0},  // 13: π Sco
    ],
    lines: [[12,13],[12,0],[0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,7],[7,8],[8,9],[9,10],[9,11]],
  },
  sagittarius: {
    label: "SAGITTARIUS",
    stars: [
      {x:225, y:262, r:5.5},  // 0: Kaus Australis ε (brightest)
      {x:198, y:228, r:4.5},  // 1: Kaus Media δ
      {x:172, y:205, r:4.0},  // 2: Kaus Borealis λ
      {x:205, y:195, r:3.5},  // 3: φ Sgr
      {x:252, y:212, r:4.5},  // 4: Nunki (σ)
      {x:278, y:195, r:3.5},  // 5: ζ Sgr
      {x:260, y:178, r:3.5},  // 6: τ Sgr
      {x:195, y:242, r:3.5},  // 7: δ (handle)
      {x:165, y:248, r:4.0},  // 8: γ Sgr (Alnasl — teapot spout)
      {x:238, y:182, r:3.5},  // 9: π Sgr (teapot lid)
    ],
    lines: [[8,7],[7,1],[1,2],[2,3],[3,9],[9,6],[6,5],[5,4],[4,0],[0,7],[0,1],[3,4],[9,4]],
  },
  capricornus: {
    label: "CAPRICORNUS",
    stars: [
      {x:128, y:198, r:4.0},  // 0: Algedi α¹
      {x:132, y:205, r:3.5},  // 1: Algedi α² (close pair)
      {x:148, y:222, r:3.5},  // 2: Dabih β
      {x:185, y:242, r:3.0},  // 3: ψ Cap
      {x:218, y:252, r:3.5},  // 4: ω Cap
      {x:252, y:248, r:3.5},  // 5: ζ Cap
      {x:275, y:228, r:3.5},  // 6: ε Cap
      {x:278, y:205, r:3.0},  // 7: δ Cap (Deneb Algedi)
      {x:258, y:190, r:4.0},  // 8: γ Cap
      {x:225, y:200, r:3.0},  // 9: ι Cap
      {x:192, y:208, r:3.0},  // 10: θ Cap
    ],
    lines: [[0,2],[1,2],[2,3],[3,4],[4,5],[5,6],[6,7],[7,8],[8,9],[9,10],[10,2],[7,9]],
  },
  aquarius: {
    label: "AQUARIUS",
    stars: [
      {x:188, y:162, r:4.0},  // 0: Sadalsuud β (brightest)
      {x:232, y:178, r:4.0},  // 1: Sadalmelik α
      {x:268, y:232, r:3.5},  // 2: Skat δ
      {x:208, y:208, r:3.5},  // 3: Sadachbia γ
      {x:178, y:228, r:3.0},  // 4: η Aqr
      {x:165, y:258, r:3.0},  // 5: π Aqr
      {x:188, y:275, r:3.0},  // 6: ζ Aqr
      {x:210, y:290, r:3.0},  // 7: χ Aqr (stream)
      {x:232, y:305, r:2.8},  // 8: stream drop
      {x:220, y:325, r:2.5},  // 9: stream end
      {x:250, y:335, r:2.5},  // 10: stream end 2
    ],
    lines: [[0,1],[0,3],[1,2],[3,4],[4,5],[5,6],[6,7],[7,8],[8,9],[9,10],[3,2]],
  },
  pisces: {
    label: "PISCES",
    stars: [
      // North fish (upper-right)
      {x:268, y:138, r:2.5},  // 0
      {x:288, y:155, r:3.0},  // 1
      {x:295, y:175, r:2.5},  // 2
      {x:285, y:195, r:2.5},  // 3
      {x:268, y:205, r:3.5},  // 4: η Psc (brightest, north)
      {x:248, y:198, r:2.5},  // 5
      {x:238, y:178, r:2.5},  // 6
      {x:248, y:158, r:2.5},  // 7
      // Cord (junction)
      {x:200, y:235, r:3.5},  // 8: Al Rischa α (cord knot)
      // West fish (lower-left)
      {x:152, y:255, r:2.5},  // 9
      {x:135, y:270, r:2.5},  // 10
      {x:128, y:290, r:2.5},  // 11
      {x:138, y:308, r:2.5},  // 12
      {x:155, y:316, r:3.0},  // 13
      {x:172, y:310, r:2.5},  // 14
      {x:180, y:295, r:2.5},  // 15
      {x:172, y:278, r:2.5},  // 16
    ],
    lines: [
      // north fish ring
      [0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,7],[7,0],
      // cord from north fish to knot
      [4,8],
      // cord from knot to west fish
      [8,9],
      // west fish ring
      [9,10],[10,11],[11,12],[12,13],[13,14],[14,15],[15,16],[16,9],
    ],
  },
};

const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, '..', 'public', 'luna', 'assets', 'costar', 'constellations');

function makeSVG(slug, data) {
  const W = 400, H = 400;

  const lines = data.lines.map(([a, b]) => {
    const s1 = data.stars[a], s2 = data.stars[b];
    return `<line x1="${s1.x}" y1="${s1.y}" x2="${s2.x}" y2="${s2.y}" stroke="rgba(20,21,22,0.55)" stroke-width="2"/>`;
  }).join('\n    ');

  const stars = data.stars.map(({x, y, r}) => {
    const glowR = r * 3.0;
    return `<circle cx="${x}" cy="${y}" r="${glowR}" fill="rgba(20,21,22,0.12)"/>
    <circle cx="${x}" cy="${y}" r="${r * 1.4}" fill="rgba(20,21,22,0.88)"/>`;
  }).join('\n    ');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <!-- constellation lines -->
  ${lines}
  <!-- constellation stars -->
  ${stars}
</svg>`;
}

for (const [slug, data] of Object.entries(constellations)) {
  const svg = makeSVG(slug, data);
  const outPath = path.join(OUT_DIR, `${slug}.svg`);
  fs.writeFileSync(outPath, svg, 'utf8');
  console.log(`✓ ${slug}.svg`);
}
console.log('All constellations generated.');
