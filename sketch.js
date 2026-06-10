// =============================================================
// Painting Boids
// Mírumilovná, poetická boids simulace v p5.js.
// Hejna světelných bytostí volně létají, občas se složí do
// obrazce (srdce, kopretina, kruh, spirála, vlna), chvíli po
// jeho obrysu proudí, a pak se zase rozletí do volných hejn.
//
// Architektura:
//   Boid                 - jedna letící bytost (boids pravidla + shape seek)
//   Flock                - hejno boidů se společnou barvou
//   ShapePath            - parametrický obrazec, getPoint(t), getTangent(t)
//   SimulationController - stavový automat a řízení vlivu obrazce
// =============================================================

// ---- Globální konfigurace ----------------------------------
// Snadno laditelné za běhu klávesami (viz keyPressed / HUD).
const CONFIG = {
  trailsEnabled: true,   // zapnuto/vypnuto - klávesa "t"
  // Alpha tmavého overlaye přes scénu. Nižší = delší stopy, vyšší = kratší.
  // Při vypnutí se použije plné překreslení (žádná stopa).
  trailFade: 100,        // výchozí délka stopy (~64 % na stupnici v HUDu)
  trailFadeMin: 12,      // nejdelší stopy
  trailFadeMax: 255,     // bez stopy

  // Minimální rychlost (násobek maxSpeed) - boid se nikdy úplně nezastaví,
  // pořád působí jako letící bytost, ne jako bod naskakující na pozici.
  minSpeedFactor: 0.35,

  // Plynulost změny max rychlosti (0..1). maxSpeed se k cílové hodnotě jen
  // postupně dotahuje -> dobíhání ("tramvaj") i zpomalení jsou plynulé,
  // ne skokové. Menší = pozvolnější náběh/doběh.
  speedSmooth: 0.05,

  // Doznění po opuštění trasy obrazce. Po vstupu do volného letu boidi
  // nejdřív chvíli letí setrvačně rovně (holdMs), pak se jim flocking
  // (alignment/cohesion/wander) plynule vrátí (rampMs) -> žádné "lusknutí
  // prsty", ale ani zaječí klička. Separation zůstává vždy plná.
  release: {
    holdMs: 450,   // jak dlouho po uvolnění drží setrvačně směr
    rampMs: 1400   // za jak dlouho pak najede flocking zpět na plno
  },

  // SETRVAČNOST: směr se za snímek smí natočit jen o omezený úhel (rad).
  // Limit klesá s rychlostí - rychlý dělá široké oblouky, pomalý zatáčí ostřeji.
  // Díky tomu boidi "banking" plynule zatáčejí a nenaskakují na přesné body.
  turn: {
    baseRate: 0.16,      // rad/snímek při referenční rychlosti
    speedRef: 2.0,       // rychlost, při které platí baseRate
    maxRate: 0.34,       // strop otáčení (pomalý se přesto netočí na místě)
    minRate: 0.05        // spodní mez (i nejrychlejší se trochu stočí)
  },

  // Wander přes "wander kruh" před boidem + Perlin noise - plynulé meandrování
  // místo náhodného cukání.
  wander: {
    circleDist: 26,      // jak daleko před boidem je střed wander kruhu
    circleRadius: 14,    // poloměr kruhu (menší = mírnější odchylky)
    noiseSpeed: 0.005    // jak rychle se mění noise úhel (menší = línější meandr)
  },

  // OKRAJE: wrap = boid proletí ven a objeví se na druhé straně (default).
  // Když wrap=false, boidi se drží uvnitř - od kraje (margin) plynule zatočí
  // dovnitř a tvrdá pojistka je nepustí ven. Přepínač klávesa "w".
  edges: {
    wrap: true,
    margin: 110,   // od jaké vzdálenosti od kraje začne boid zatáčet dovnitř
    weight: 1.6    // síla zatočení od kraje
  },

  // SILNICE: boidi nemíří přesně na vodící čáru tvaru, ale na pruh kolem ní.
  // Vodící čára vede středem, každý boid má vlastní příčný offset v rozsahu
  // +-width/2. width=0 => přesně po čáře. Klávesy "," a "." (úzká/široká).
  road: {
    width: 40,           // aktuální šířka silnice v px (0 = přesně po čáře)
    widthDesktop: 40,    // výchozí šířka na velké obrazovce
    widthMin: 0,
    widthMax: 260,
    step: 15
  },

  // MOBIL / MALÁ OBRAZOVKA: na malém displeji se tvary s velkým rozptylem
  // slévají (kopretina, vlna...), proto užší silnice, méně boidů, mírně
  // větší tvary a vlastní (čitelnější) sada obrazců - viz buildShapes.
  mobile: {
    smallSide: 700,      // menší strana okna pod tuhle mez => "malá obrazovka"
    roadWidth: 20,       // výchozí šířka silnice na malé obrazovce
    flocks: 3,           // méně hejn (výkon + čitelnost)
    boidsPerFlock: 28,   // méně boidů v hejnu
    shapeScaleFactor: 0.38, // tvary o kus větší vůči plátnu (desktop má 0.34)
  },

  // UI PANEL: kreslená tlačítka dole (ovládání prstem/myší - na dotykových
  // zařízeních nahrazuje klávesnici, na desktopu doplňuje).
  ui: {
    fontSize: 13,        // písmo tlačítek
    padX: 13,            // vnitřní odsazení tlačítka
    gap: 8,              // mezera mezi tlačítky
    heightTouch: 42,     // výška tlačítka na dotykovém zařízení (prst)
    heightMouse: 30,     // výška tlačítka pro myš
    marginBottom: 12,    // odsazení panelu od spodního okraje
  }
};

const NUM_FLOCKS = 4;          // počet hejn
const BOIDS_PER_FLOCK = 36;    // boidů v každém hejnu

// Vnímací poloměry boids pravidel
const PERCEPTION = 60;         // alignment / cohesion
const SEPARATION_RADIUS = 26;  // separation

// Váhy základního flockingu
const W_SEPARATION = 1.5;      // separation: silná (a vždy aktivní)
const W_ALIGNMENT  = 1.0;      // alignment: střední (drží společný směr -> méně kličkování)
const W_COHESION   = 0.8;      // cohesion: střední
const W_WANDER     = 0.08;     // noise / wander: jen lehké oživení, ne hmyzí poletování

// Vliv jiného hejna na alignment/cohesion (drží se hlavně svého)
const OTHER_FLOCK_FACTOR = 0.25;

let flocks = [];        // pole instancí Flock
let allBoids = [];      // všichni boidi (pro flocking dohromady)
let controller;         // SimulationController
let device = { touch: false, small: false }; // detekce zařízení (viz detectDevice)
let uiButtons = [];     // hitboxy kreslených tlačítek (plní drawUiPanel)

// Detekce zařízení: "touch" = ovládá se prstem (hrubý ukazatel / touch body),
// "small" = malá obrazovka (mobil) - dvě nezávislé vlastnosti. Tablet s velkým
// displejem dostane dotykové UI, ale plnou sadu tvarů.
function detectDevice() {
  const touch = (navigator.maxTouchPoints || 0) > 0 ||
    (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  const small = min(windowWidth, windowHeight) < CONFIG.mobile.smallSide;
  return { touch, small };
}

// Aplikuj ladění podle třídy zařízení (výchozí šířka silnice). Volá se při
// startu a když se třída změní resizem - úmyslně přepíše ruční nastavení,
// protože výchozí hodnota pro novou velikost je lepší startovní bod.
function applyDeviceTuning() {
  CONFIG.road.width = device.small ? CONFIG.mobile.roadWidth : CONFIG.road.widthDesktop;
}

// =============================================================
// Barevná schémata obrazců
// Každý obrazec si vybere schéma JMÉNEM z tohoto registru (není hardcoded
// v kreslení). Boid si barvu spočítá sám a plynule ji podle shapeWeight mísí
// z barvy svého hejna do barvy schématu (volný let -> obrazec -> zpět).
//
// Typy:
//   solid     - jedna pevná barva (rgb)
//   duo       - přechod mezi dvěma barvami napříč šířkou silnice (a/b)
//   rainbow   - duha rozložená podél tvaru (podle t), pomalu rotuje v čase
//   oscillate - odstín cykluje v čase (volitelně lehce rozprostřený přes boidy)
//   flock     - ponech barvu hejna (jako ve volném letu)
// Volitelný příznak neon -> silnější záře (viz Boid.draw).
// =============================================================
const COLOR_SCHEMES = {
  cervena:    { type: 'solid', rgb: [225, 35, 40] },        // srdce - sytá rudá
  bila:       { type: 'solid', rgb: [235, 240, 255] },      // kopretina
  zelena:     { type: 'solid', rgb: [55, 205, 70] },        // trojlístek - svěží zelená
  zlata:      { type: 'solid', rgb: [255, 200, 90] },       // hvězda
  ocean:      { type: 'duo', a: [80, 160, 255], b: [120, 255, 220] }, // kruh, vlna
  duha:       { type: 'rainbow', sat: 0.72, val: 1, loops: 1, speed: 0.03 }, // spirála, trojúhelník
  oscilace:   { type: 'oscillate', sat: 0.8, val: 1, speed: 0.05, spread: 0.2 }, // lissajous
  neon:       { type: 'rainbow', sat: 1.0, val: 1, loops: 1, speed: 0.08, neon: true }, // šestiúhelník
  neonPuls:   { type: 'oscillate', sat: 1.0, val: 1, speed: 0.07, spread: 0, neon: true }, // nekonečno
  hejna:      { type: 'flock' }   // beze změny barev hejn
};

// HSV (h ve stupních, s/v 0..1) -> [r,g,b] 0..255
function hsv2rgb(h, s, v) {
  h = ((h % 360) + 360) % 360;
  let c = v * s, x = c * (1 - abs((h / 60) % 2 - 1)), m = v - c;
  let r, g, b;
  if (h < 60)       { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else              { r = c; g = 0; b = x; }
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

// lineární mix dvou RGB polí
function lerpRGB(a, b, f) {
  return [lerp(a[0], b[0], f), lerp(a[1], b[1], f), lerp(a[2], b[2], f)];
}

// Vrátí barvu [r,g,b] pro daný boid podle schématu, jeho pozice t a času.
function schemeColor(scheme, boid, t, time) {
  switch (scheme.type) {
    case 'solid':
      return scheme.rgb;
    case 'duo': {
      let f = (boid.roadOffset + 1) * 0.5;     // 0..1 napříč šířkou silnice
      return lerpRGB(scheme.a, scheme.b, f);
    }
    case 'rainbow': {
      let hue = (t * scheme.loops + time * scheme.speed) * 360;
      return hsv2rgb(hue, scheme.sat, scheme.val);
    }
    case 'oscillate': {
      let hue = (time * scheme.speed + boid.shapeOffset * scheme.spread) * 360;
      return hsv2rgb(hue, scheme.sat, scheme.val);
    }
    case 'flock':
    default:
      return boid.flockColor;
  }
}

// =============================================================
// ShapePath - parametrický obrazec
// getPoint(t) pro t v rozsahu 0..1 vrací p5.Vector v souřadnicích
// obrazovky (už vycentrovaný kolem středu).
// =============================================================
class ShapePath {
  constructor(name, fn, schemeName = 'hejna') {
    this.name = name;
    this.fn = fn; // funkce (t) -> p5.Vector
    this.schemeName = schemeName; // klíč do COLOR_SCHEMES
  }

  getPoint(t) {
    // t zabalíme do 0..1, aby fungovalo i flow přetékání
    let tt = ((t % 1) + 1) % 1;
    return this.fn(tt);
  }

  // Tečna spočtená numericky (volitelné, pro směr proudění)
  getTangent(t) {
    const eps = 0.001;
    let a = this.getPoint(t - eps);
    let b = this.getPoint(t + eps);
    return b.sub(a).normalize();
  }
}

// Pomocné středy / měřítka počítané podle aktuální velikosti plátna
function shapeCenter() {
  return createVector(width / 2, height / 2);
}
function shapeScale() {
  // na malé obrazovce tvary mírně větší, ať vyplní displej
  return min(width, height) * (device.small ? CONFIG.mobile.shapeScaleFactor : 0.34);
}

// ---- Pomůcky pro mnohoúhelníky a hvězdy se zaoblenými rohy ----
// Boidi kvůli omezení otáčení neproletí ostrým rohem - proto vrcholy
// zaoblíme Chaikinovým "ořezáváním rohů" a po výsledné křivce pak jdeme
// podle parametru t (procházení obvodu).

// Jeden průchod Chaikinova zaoblení uzavřeného polygonu
function chaikin(pts) {
  let out = [];
  let n = pts.length;
  for (let i = 0; i < n; i++) {
    let a = pts[i], b = pts[(i + 1) % n];
    out.push(p5.Vector.add(p5.Vector.mult(a, 0.75), p5.Vector.mult(b, 0.25)));
    out.push(p5.Vector.add(p5.Vector.mult(a, 0.25), p5.Vector.mult(b, 0.75)));
  }
  return out;
}

// Vrcholy pravidelného mnohoúhelníku (první vrchol nahoře)
function regularPolygonVerts(n, radiusFactor = 1) {
  let c = shapeCenter(), s = shapeScale() * radiusFactor;
  let verts = [];
  for (let i = 0; i < n; i++) {
    let a = -HALF_PI + i / n * TWO_PI;
    verts.push(createVector(c.x + cos(a) * s, c.y + sin(a) * s));
  }
  return verts;
}

// Vrcholy hvězdy: střídání vnějšího a vnitřního poloměru
function starVerts(points, outerFactor, innerFactor) {
  let c = shapeCenter();
  let so = shapeScale() * outerFactor, si = shapeScale() * innerFactor;
  let verts = [];
  for (let i = 0; i < points * 2; i++) {
    let a = -HALF_PI + i / (points * 2) * TWO_PI;
    let r = (i % 2 === 0) ? so : si;
    verts.push(createVector(c.x + cos(a) * r, c.y + sin(a) * r));
  }
  return verts;
}

// ShapePath z vrcholů: zaoblí rohy a vrací bod podle ujité délky obvodu.
// Výsledek se cachuje (závisí jen na velikosti plátna) -> levné i per snímek.
function roundedPolyShape(name, makeVerts, roundIters = 3, schemeName = 'hejna') {
  let cache = null, key = '';
  function rebuild() {
    let verts = makeVerts();
    for (let i = 0; i < roundIters; i++) verts = chaikin(verts);
    let cum = [0], total = 0;
    for (let i = 0; i < verts.length; i++) {
      let a = verts[i], b = verts[(i + 1) % verts.length];
      total += p5.Vector.dist(a, b);
      cum.push(total);
    }
    cache = { verts, cum, total };
    key = width + 'x' + height;
  }
  return new ShapePath(name, (t) => {
    if (!cache || key !== width + 'x' + height) rebuild();
    let { verts, cum, total } = cache;
    let n = verts.length;
    let target = t * total;
    for (let i = 0; i < n; i++) {
      if (cum[i + 1] >= target) {
        let segLen = cum[i + 1] - cum[i];
        let f = segLen > 0 ? (target - cum[i]) / segLen : 0;
        return p5.Vector.lerp(verts[i], verts[(i + 1) % n], f);
      }
    }
    return verts[0].copy();
  }, schemeName);
}

// ---- Definice konkrétních obrazců ---------------------------

// compact=true (malá obrazovka): jen tvary, které jsou čitelné i v malém -
// jemně zvlněné křivky s mnoha lístky/otočkami (kopretina, spirála se 3
// otočkami, vlna přes celou šířku, proplétaný lissajous) se na mobilu slévají
// a nejde poznat, co boidi kreslí. Místo nich jednodušší varianty (kvítek
// s 5 lístky, spirála se 2 otočkami).
function buildShapes(compact = false) {
  const shapes = [];

  // Srdce - klasická parametrická rovnice (čitelné všude)
  shapes.push(new ShapePath('srdce', (t) => {
    let a = t * TWO_PI;
    let x = 16 * pow(sin(a), 3);
    let y = 13 * cos(a) - 5 * cos(2 * a) - 2 * cos(3 * a) - cos(4 * a);
    let c = shapeCenter();
    let s = shapeScale() / 17;
    // y obrátíme - rovnice má kladné y nahoru, obrazovka má dolů
    return createVector(c.x + x * s, c.y - y * s);
  }, 'cervena'));

  // Kopretina / kvítek - rose curve; na mobilu jen 5 výraznějších lístků,
  // na desktopu plných 8
  const petals = compact ? 5 : 8;
  shapes.push(new ShapePath(compact ? 'kvitek' : 'kopretina', (t) => {
    let a = t * TWO_PI;
    let r = 0.55 + 0.45 * cos(petals * a); // zvlněný obrys do lístků
    let c = shapeCenter();
    let s = shapeScale();
    return createVector(c.x + cos(a) * r * s, c.y + sin(a) * r * s);
  }, 'bila'));

  // Kruh - jednoduchý kruh kolem středu
  shapes.push(new ShapePath('kruh', (t) => {
    let a = t * TWO_PI;
    let c = shapeCenter();
    let s = shapeScale();
    return createVector(c.x + cos(a) * s, c.y + sin(a) * s);
  }, 'ocean'));

  // Spirála - na mobilu jen 2 otočky s větším začátkem (3 otočky se slévají)
  const turns = compact ? 2 : 3;
  const spiralStart = compact ? 0.2 : 0.08;
  shapes.push(new ShapePath('spirala', (t) => {
    let a = t * turns * TWO_PI;
    let r = lerp(spiralStart, 1.0, t) * shapeScale();
    let c = shapeCenter();
    return createVector(c.x + cos(a) * r, c.y + sin(a) * r);
  }, 'duha'));

  // Vlna - horizontální sinusovka přes obrazovku (jen desktop; na výšku
  // drženém mobilu je moc krátká a plochá)
  if (!compact) {
    shapes.push(new ShapePath('vlna', (t) => {
      let waves = 2.5;
      let margin = width * 0.12;
      let x = lerp(margin, width - margin, t);
      let y = height / 2 + sin(t * waves * TWO_PI) * shapeScale() * 0.55;
      return createVector(x, y);
    }, 'ocean'));
  }

  // Hvězda - 5 cípů, rohy zaoblené (aby je boidi proletěli)
  shapes.push(roundedPolyShape('hvezda', () => starVerts(5, 1.05, 0.45), 3, 'zlata'));

  // Trojúhelník - se zaoblenými rohy
  shapes.push(roundedPolyShape('trojuhelnik', () => regularPolygonVerts(3, 1.05), 3, 'duha'));

  // Šestiúhelník - se zaoblenými rohy (jen desktop, v malém splývá s kruhem)
  if (!compact) {
    shapes.push(roundedPolyShape('sestiuhelnik', () => regularPolygonVerts(6, 1.0), 2, 'neon'));
  }

  // Nekonečno - ležatá osmička (lemniskáta), hladká
  shapes.push(new ShapePath('nekonecno', (t) => {
    let a = t * TWO_PI;
    let s = shapeScale() * 1.3;
    let d = 1 + sin(a) * sin(a);
    let c = shapeCenter();
    return createVector(c.x + s * cos(a) / d, c.y + s * sin(a) * cos(a) / d);
  }, 'neonPuls'));

  // Trojlístek - rose křivka se 3 zaoblenými lístky
  shapes.push(new ShapePath('trojlistek', (t) => {
    let a = t * TWO_PI;
    let r = (0.55 + 0.45 * cos(3 * a)) * shapeScale();
    let c = shapeCenter();
    return createVector(c.x + cos(a) * r, c.y + sin(a) * r);
  }, 'zelena'));

  // Lissajous - jemně proplétaná hladká smyčka 3:2 (jen desktop, v malém
  // z ní je nečitelné klubko)
  if (!compact) {
    shapes.push(new ShapePath('lissajous', (t) => {
      let a = t * TWO_PI;
      let s = shapeScale();
      let c = shapeCenter();
      return createVector(c.x + cos(3 * a) * s, c.y + sin(2 * a) * s);
    }, 'oscilace'));
  }

  return shapes;
}

// =============================================================
// SimulationController - stavový automat
// Stavy: FREE_FLOCK -> GATHER_TO_SHAPE -> FLOW_ON_SHAPE -> RELEASE
// Plynule interpoluje shapeWeight (0..1) a řídí proudění po křivce.
// =============================================================
const STATE = {
  FREE_FLOCK: 'FREE_FLOCK',
  GATHER_TO_SHAPE: 'GATHER_TO_SHAPE',
  FLOW_ON_SHAPE: 'FLOW_ON_SHAPE',
  RELEASE: 'RELEASE'
};

class SimulationController {
  constructor(shapes) {
    this.shapes = shapes;
    this.shapeIndex = 0;
    this.currentShape = shapes[0];

    this.state = STATE.FREE_FLOCK;
    this.stateStart = 0;       // millis() při vstupu do stavu
    this.stateDuration = 0;    // ms

    this.flowPhase = 0;        // průběžná fáze proudění po křivce
    this.flowSpeed = 0.06;     // rychlost posunu t za sekundu

    // Atraktor od myši
    this.attractor = null;
    this.attractorStrength = 0;

    this.enterState(STATE.FREE_FLOCK);
  }

  // Délky stavů (v ms), částečně náhodné dle zadání
  durationFor(state) {
    switch (state) {
      case STATE.FREE_FLOCK:      return random(6000, 10000);
      case STATE.GATHER_TO_SHAPE: return 5000;
      case STATE.FLOW_ON_SHAPE:   return random(6000, 8000);
      case STATE.RELEASE:         return 4000;
    }
  }

  enterState(state) {
    this.state = state;
    this.stateStart = millis();
    this.stateDuration = this.durationFor(state);
    if (state === STATE.GATHER_TO_SHAPE) {
      this.flowPhase = 0; // proudění začínáme od nuly, aby navázalo na gather
    }
  }

  // Ruční přechod na další obrazec (mezerník)
  nextShape() {
    this.shapeIndex = (this.shapeIndex + 1) % this.shapes.length;
    this.currentShape = this.shapes[this.shapeIndex];
    this.enterState(STATE.GATHER_TO_SHAPE);
  }

  updateStateMachine(dt) {
    // Posun fáze proudění ve FLOW i v RELEASE. Kdyby v RELEASE zamrzla, cíl na
    // křivce by byl pevný bod a boidi (kvůli min. rychlosti) by ho donekonečna
    // OBÍHALI -> vypadalo by to jako otáčení o 180°. Když silnice běží dál,
    // boid plyne tečně dopředu a jak síla obrazce slábne, plynule se odpoutá.
    if (this.state === STATE.FLOW_ON_SHAPE || this.state === STATE.RELEASE) {
      this.flowPhase += this.flowSpeed * dt;
    }

    // Doznívání atraktoru
    if (this.attractorStrength > 0.001) {
      this.attractorStrength *= 0.94;
    } else {
      this.attractorStrength = 0;
      this.attractor = null;
    }

    // Přechody podle uplynulého času
    let elapsed = millis() - this.stateStart;
    if (elapsed < this.stateDuration) return;

    switch (this.state) {
      case STATE.FREE_FLOCK:
        // vyber další obrazec a začni se skládat
        this.shapeIndex = (this.shapeIndex + 1) % this.shapes.length;
        this.currentShape = this.shapes[this.shapeIndex];
        this.enterState(STATE.GATHER_TO_SHAPE);
        break;
      case STATE.GATHER_TO_SHAPE:
        this.enterState(STATE.FLOW_ON_SHAPE);
        break;
      case STATE.FLOW_ON_SHAPE:
        this.enterState(STATE.RELEASE);
        break;
      case STATE.RELEASE:
        this.enterState(STATE.FREE_FLOCK);
        break;
    }
  }

  // Plynulá váha vlivu obrazce 0..1 (se smoothstep zjemněním)
  getShapeWeight() {
    let f = constrain((millis() - this.stateStart) / this.stateDuration, 0, 1);
    let s = f * f * (3 - 2 * f); // smoothstep
    switch (this.state) {
      case STATE.FREE_FLOCK:      return 0;
      case STATE.GATHER_TO_SHAPE: return s;          // 0 -> 1
      case STATE.FLOW_ON_SHAPE:   return 1;          // plný vliv
      case STATE.RELEASE:         return 1 - s;      // 1 -> 0
    }
    return 0;
  }

  // Návrat flockingu (0..1) - škáluje alignment/cohesion/wander.
  //  - RELEASE: 0. Flocking se NEVRACÍ, dokud jsou boidi na obrazci. Jinak by
  //    u symetrických tvarů (kruh!) cohesion škubla boidy do těžiště uprostřed.
  //    Místo toho jen setrvačně doplachtí, jak síla obrazce mizí.
  //  - FREE_FLOCK: 0 prvních holdMs (doběh rovně), pak smoothstep na 1.
  //  - jinak (GATHER/FLOW): 1 - tam tlumení řeší shapeWeight.
  // Separation se tímhle NEškáluje, ta je vždy plná.
  getFlockReturn() {
    if (this.state === STATE.RELEASE) return 0;
    if (this.state !== STATE.FREE_FLOCK) return 1;
    let elapsed = millis() - this.stateStart;
    let R = CONFIG.release;
    if (elapsed < R.holdMs) return 0;
    let f = constrain((elapsed - R.holdMs) / R.rampMs, 0, 1);
    return f * f * (3 - 2 * f); // smoothstep
  }

  // Parametr t na křivce pro daného boida (podle stavu)
  shapeTForBoid(boid) {
    // GATHER: pevná pozice; jinak (FLOW/RELEASE) teče s flowPhase
    return this.state === STATE.GATHER_TO_SHAPE
      ? boid.shapeOffset
      : boid.shapeOffset + this.flowPhase;
  }

  // Cílový bod na křivce pro daného boida (podle stavu).
  // Vodící čára vede středem silnice; boid míří na bod posunutý kolmo o svůj
  // příčný offset v rámci šířky silnice -> tvar má tloušťku, ne jednu čáru.
  getCurrentShapePoint(boid) {
    let t = this.shapeTForBoid(boid);
    let p = this.currentShape.getPoint(t);

    let halfW = CONFIG.road.width * 0.5;
    if (halfW > 0.001) {
      let tan = this.currentShape.getTangent(t);
      // kolmice na směr křivky; posun o boidovu stranu silnice
      p.x += -tan.y * boid.roadOffset * halfW;
      p.y += tan.x * boid.roadOffset * halfW;
    }
    return p;
  }

  // Aktuální schéma obrazce (objekt z COLOR_SCHEMES)
  currentScheme() {
    return COLOR_SCHEMES[this.currentShape.schemeName] || COLOR_SCHEMES.hejna;
  }

  // Násobič síly obrazce - ve FLOW i RELEASE silnější ("neviditelná silnice");
  // v RELEASE se grip nezmenší skokem, jen ho plynule zháší shapeWeight ->
  // boidi plynule vyplynou z obrazce místo škubnutí. (Ne tolik, aby přebil
  // separation a boční kolébání, jinak by jeli po kolejích.)
  shapeForceFactor() {
    return (this.state === STATE.FLOW_ON_SHAPE || this.state === STATE.RELEASE)
      ? 2.3 : 1.8;
  }
}

// =============================================================
// Boid - jedna letící bytost
// =============================================================
class Boid {
  constructor(x, y, flockId) {
    this.position = createVector(x, y);
    this.velocity = p5.Vector.random2D().mult(random(1.5, 3));
    this.acceleration = createVector(0, 0);
    this.flockId = flockId;
    this.shapeOffset = random(1); // vlastní pozice na křivce 0..1
    this.baseMaxSpeed = 3.0;      // klidová rychlost (moduluje ji hejno + dobíhání)
    this.maxSpeed = 3.0;          // aktuální max rychlost (přepočítává se každý snímek)
    this.maxForce = 0.18;
    this.noiseSeed = random(1000); // pro individuální wander/turbulenci

    // OSOBNÍ PROSTOR: každý boid chce trochu jiný odstup od ostatních,
    // aby hejno nevypadalo jako pravidelná mřížka.
    this.spacing = random(0.75, 1.35);
    // Individuální fáze/rychlost bočního kolébání po silnici obrazce.
    this.swayPhase = random(TWO_PI);
    this.swaySpeed = random(0.6, 1.4);
    this.swayAmount = random(0.6, 1.4); // jak moc tenhle boid uhýbá ze stopy
    // Příčná pozice na silnici (-1..1): kde napříč šířkou tenhle boid jezdí.
    // Stabilní -> boid drží svou stranu, silnice se nepřelévá.
    this.roadOffset = random(-1, 1);
    // Barva hejna ([r,g,b]); nastaví se v initSimulation, tady jen pojistka.
    this.flockColor = [200, 210, 230];
  }

  applyForce(force) {
    this.acceleration.add(force);
  }

  // Klasický seek: steering k cíli
  seek(target, slowingRadius = 0) {
    let desired = p5.Vector.sub(target, this.position);
    let d = desired.mag();
    let speed = this.maxSpeed;
    if (slowingRadius > 0 && d < slowingRadius) {
      // jemné dobrzdění u cíle (organické dosednutí na křivku)
      speed = map(d, 0, slowingRadius, 0, this.maxSpeed);
    }
    desired.setMag(speed);
    let steer = p5.Vector.sub(desired, this.velocity);
    steer.limit(this.maxForce);
    return steer;
  }

  // Boids pravidla. shapeWeight zjemňuje cohesion, aby boidi nebojovali
  // s obrazcem; flockReturn (0..1) drží flocking utlumený během RELEASE a
  // hned po uvolnění, aby boidi setrvačně doletěli rovně místo škubnutí.
  // Separation zůstává vždy plná.
  flock(boids, shapeWeight, flockReturn = 1) {
    let sep = createVector(0, 0);
    let ali = createVector(0, 0);
    let coh = createVector(0, 0);
    let sepCount = 0, aliCount = 0, cohCount = 0;

    // osobní prostor tohoto boida (mírný individuální rozptyl)
    let sepRange = SEPARATION_RADIUS * this.spacing;

    for (let other of boids) {
      if (other === this) continue;
      let d = p5.Vector.dist(this.position, other.position);

      // Separation - od všech boidů v okolí
      if (d < sepRange && d > 0) {
        let diff = p5.Vector.sub(this.position, other.position);
        diff.div(d * d); // čím blíž, tím silněji
        sep.add(diff);
        sepCount++;
      }

      // Alignment + cohesion - hlavně se svým hejnem
      if (d < PERCEPTION && d > 0) {
        let weight = (other.flockId === this.flockId) ? 1.0 : OTHER_FLOCK_FACTOR;
        ali.add(p5.Vector.mult(other.velocity, weight));
        aliCount += weight;
        coh.add(p5.Vector.mult(other.position, weight));
        cohCount += weight;
      }
    }

    if (sepCount > 0) {
      sep.div(sepCount);
      sep.setMag(this.maxSpeed);
      sep.sub(this.velocity).limit(this.maxForce);
    }
    if (aliCount > 0) {
      ali.div(aliCount);
      ali.setMag(this.maxSpeed);
      ali.sub(this.velocity).limit(this.maxForce);
    }
    if (cohCount > 0) {
      coh.div(cohCount);
      coh = this.seek(coh);
    }

    // Během obrazce letové síly slábnou, aby ho boidi nepřebíjeli.
    // Separation zůstává skoro plná - boidi se navzájem postrkují mimo přesnou
    // čáru, takže silnice obrazce "žije" a není to jízda po kolejích.
    // alignment/cohesion/wander navíc během RELEASE a po uvolnění najíždějí
    // přes flockReturn (setrvačný doběh rovně, pak plynulé seskupení).
    let sepScale = W_SEPARATION * (1 - 0.1 * shapeWeight);
    let aliScale = W_ALIGNMENT * (1 - 0.6 * shapeWeight) * flockReturn;
    let cohScale = W_COHESION  * (1 - 0.8 * shapeWeight) * flockReturn;

    this.applyForce(sep.mult(sepScale));
    this.applyForce(ali.mult(aliScale));
    this.applyForce(coh.mult(cohScale));

    // Lehký wander přes wander-kruh (plynulý meandr), během obrazce skoro mizí
    // a během RELEASE / po uvolnění také teprve postupně naběhne (flockReturn).
    let wanderScale = W_WANDER * (1 - 0.9 * shapeWeight) * flockReturn;
    this.applyForce(this.wander().mult(wanderScale));
  }

  // Wander: cíl na "wander kruhu" před boidem, jeho úhel řídí pomalý Perlin
  // noise -> plynulé meandrování místo náhodného cukání.
  wander() {
    let W = CONFIG.wander;
    let n = noise(this.noiseSeed + frameCount * W.noiseSpeed);
    let ang = map(n, 0, 1, -PI, PI);

    let heading = this.velocity.copy();
    if (heading.magSq() < 0.0001) heading.set(1, 0);
    heading.setMag(W.circleDist);

    let offset = p5.Vector.fromAngle(ang).mult(W.circleRadius);
    let target = p5.Vector.add(heading, offset); // relativně k boidovi

    target.setMag(this.maxSpeed);
    let steer = p5.Vector.sub(target, this.velocity);
    steer.limit(this.maxForce);
    return steer;
  }

  // Cíl na křivce pro tohoto boida (zkratka přes controller)
  getShapeTarget(controller) {
    return controller.getCurrentShapePoint(this);
  }

  // Aplikuj sílu obrazce + jemnou kolmou turbulenci, aby tvar dýchal
  applyShape(controller, shapeWeight) {
    if (shapeWeight <= 0.001) return;

    let target = this.getShapeTarget(controller);
    // ve FLOW i RELEASE se teče (bez brzdění), v GATHER jemné dobrzdění u cíle
    let slowing = controller.state === STATE.GATHER_TO_SHAPE ? 80 : 0;
    let force = this.seek(target, slowing);

    let factor = controller.shapeForceFactor();
    force.mult(shapeWeight * factor);
    this.applyForce(force);

    // Boční pohyb po silnici - boidi neletí přesně po obrysu, ale lehce se
    // od něj vychylují do stran (jak to boidi dělají). Skládá se z pomalého
    // individuálního kolébání (sin) a Perlin noise turbulence. Aktivní ve FLOW
    // i RELEASE (zháší ho shapeWeight), aby pohyb na hraně nezmizel skokem.
    if (controller.state === STATE.FLOW_ON_SHAPE || controller.state === STATE.RELEASE) {
      let tan = controller.currentShape.getTangent(
        this.shapeOffset + controller.flowPhase
      );
      let perp = createVector(-tan.y, tan.x);
      let sway = sin(frameCount * 0.02 * this.swaySpeed + this.swayPhase);
      let wobble = (noise(this.noiseSeed + 50, frameCount * 0.01) - 0.5) * 2;
      let lateral = (sway * 0.7 + wobble * 0.5) * this.swayAmount;
      perp.mult(lateral * 0.14 * shapeWeight);
      this.applyForce(perp);
    }
  }

  // Atraktor od myši
  applyAttractor(controller) {
    if (!controller.attractor || controller.attractorStrength <= 0) return;
    let f = this.seek(controller.attractor);
    f.mult(controller.attractorStrength * 1.2);
    this.applyForce(f);
  }

  // Přepočítej aktuální max rychlost: základ * rychlost hejna (cruise),
  // a při skládání do tvaru DOBÍHÁNÍ - kdo je daleko od své pozice, zrychlí,
  // aby se na místo "přispěchal" (jako když dobíháš tramvaj).
  applySpeed(controller, flockCruise) {
    let target = this.baseMaxSpeed * flockCruise;

    let st = controller.state;
    if (st === STATE.GATHER_TO_SHAPE || st === STATE.FLOW_ON_SHAPE) {
      let tp = controller.getCurrentShapePoint(this);
      let d = p5.Vector.dist(this.position, tp);
      // daleko -> velký boost, blízko -> normál; plynule
      let far = min(width, height) * 0.45;
      let boost = constrain(map(d, 70, far, 1, 1.9), 1, 1.9);
      target *= boost;
    }

    // PLYNULÁ akcelerace/decelerace: max rychlost se k cíli jen dotahuje,
    // nemění se skokem -> dobíhání i zpomalení vypadají hladce.
    this.maxSpeed += (target - this.maxSpeed) * CONFIG.speedSmooth;
  }

  update() {
    // kandidát na novou rychlost (síly -> akcelerace), ořezaný na maxSpeed
    let cand = p5.Vector.add(this.velocity, this.acceleration);
    cand.limit(this.maxSpeed);

    // cílová rychlost s minimem - boid se nikdy úplně nezastaví
    let minSpeed = this.maxSpeed * CONFIG.minSpeedFactor;
    let candSpeed = max(cand.mag(), minSpeed);

    // SETRVAČNOST: směr se smí natočit jen o omezený úhel za snímek; limit
    // klesá s rychlostí (rychlý = široké oblouky, pomalý = ostřejší zatáčky).
    // Tohle dělá pohyb živým a brání naskakování na přesné pozice.
    let T = CONFIG.turn;
    let curSpeed = this.velocity.mag();
    if (curSpeed > 1e-4 && cand.magSq() > 1e-8) {
      let maxTurn = constrain(T.baseRate * T.speedRef / curSpeed, T.minRate, T.maxRate);
      let a0 = this.velocity.heading();
      let diff = cand.heading() - a0;
      while (diff > PI) diff -= TWO_PI;     // normalizace do [-PI, PI]
      while (diff < -PI) diff += TWO_PI;
      diff = constrain(diff, -maxTurn, maxTurn);
      this.velocity = p5.Vector.fromAngle(a0 + diff).mult(candSpeed);
    } else {
      this.velocity = cand.setMag(candSpeed);
    }

    this.position.add(this.velocity);
    this.acceleration.mult(0); // vynuluj na další snímek
  }

  // Síla od kraje - jen když je wrap vypnutý. Blízko okraje plynule zatočí
  // dovnitř (steering), takže boid k hranici doletí v oblouku, ne že do ní
  // narazí. Aplikuje se mezi ostatní síly (před update).
  applyEdges() {
    if (CONFIG.edges.wrap) return;
    let m = CONFIG.edges.margin;
    let desired = createVector(0, 0);
    if (this.position.x < m)              desired.x = this.maxSpeed;
    else if (this.position.x > width - m) desired.x = -this.maxSpeed;
    if (this.position.y < m)              desired.y = this.maxSpeed;
    else if (this.position.y > height - m) desired.y = -this.maxSpeed;
    if (desired.x === 0 && desired.y === 0) return;
    desired.setMag(this.maxSpeed);
    let steer = p5.Vector.sub(desired, this.velocity);
    steer.limit(this.maxForce);
    this.applyForce(steer.mult(CONFIG.edges.weight));
  }

  // Ošetření pozice na okrajích (volá se po update):
  //  - wrap: proletí ven a objeví se na druhé straně,
  //  - jinak: tvrdá pojistka - drž uvnitř plátna a utlum rychlost ven.
  edges() {
    if (CONFIG.edges.wrap) {
      if (this.position.x < 0) this.position.x += width;
      if (this.position.x > width) this.position.x -= width;
      if (this.position.y < 0) this.position.y += height;
      if (this.position.y > height) this.position.y -= height;
    } else {
      const damp = -0.5; // odraz se ztlumením, aby se boid u kraje "neslepil"
      if (this.position.x < 0)      { this.position.x = 0;     if (this.velocity.x < 0) this.velocity.x *= damp; }
      else if (this.position.x > width) { this.position.x = width;  if (this.velocity.x > 0) this.velocity.x *= damp; }
      if (this.position.y < 0)      { this.position.y = 0;     if (this.velocity.y < 0) this.velocity.y *= damp; }
      else if (this.position.y > height) { this.position.y = height; if (this.velocity.y > 0) this.velocity.y *= damp; }
    }
  }

  // Aktuální barva boida: barva hejna, plynule přimíchaná k barvě schématu
  // obrazce podle shapeWeight (volný let -> obrazec -> zpět). Vrací i sílu
  // neonu (0..1) pro zesílení záře.
  currentColor() {
    let base = this.flockColor;
    let sw = controller.getShapeWeight();
    if (sw <= 0.001) return { rgb: base, neon: 0 };

    let scheme = controller.currentScheme();
    let t = controller.shapeTForBoid(this);
    let sc = schemeColor(scheme, this, t, millis() / 1000);
    return { rgb: lerpRGB(base, sc, sw), neon: scheme.neon ? sw : 0 };
  }

  // Vykreslení - svítící trojúhelníček s naznačeným směrem letu
  draw() {
    let angle = this.velocity.heading();
    let speed = this.velocity.mag();
    let glow = map(speed, 0, this.maxSpeed, 0.4, 1, true);

    let cc = this.currentColor();
    let r = cc.rgb[0], g = cc.rgb[1], b = cc.rgb[2];

    push();
    translate(this.position.x, this.position.y);
    rotate(angle);

    // záře pod tělem - v neon režimu výraznější a větší (svítící trubice)
    noStroke();
    if (cc.neon > 0) {
      fill(r, g, b, 30 * glow * cc.neon);
      ellipse(0, 0, 22, 22);
    }
    fill(r, g, b, (26 + 24 * cc.neon) * glow);
    ellipse(0, 0, 8 + 4 * cc.neon, 8 + 4 * cc.neon);

    // tělo - útlý trojúhelníček ukazující směr
    fill(r, g, b, 210);
    triangle(6, 0, -4, 2.6, -4, -2.6);
    pop();
  }
}

// =============================================================
// Flock - hejno boidů se společnou barvou
// =============================================================
class Flock {
  constructor(id, col) {
    this.id = id;
    this.color = col;
    this.boids = [];
    // Rychlost hejna jako celku - lehce kolísá v čase (pomalý noise), takže
    // jeden squad chvíli plyne líně, jiný svižně. Boidi ji sdílejí, takže se
    // jedinec přizpůsobí většině svého hejna (nelétají každý jinak rychle).
    this.cruise = 1;
    this.cruiseSeed = random(1000);
  }

  addBoid(boid) {
    this.boids.push(boid);
  }

  // Aktualizace sdílené rychlosti hejna (volá se každý snímek)
  update(t) {
    let n = noise(this.cruiseSeed + t * 0.12);
    this.cruise = map(n, 0, 1, 0.78, 1.18);
  }

  // Vykreslení celého hejna (barvu si boid spočítá sám podle stavu)
  draw() {
    for (let b of this.boids) {
      b.draw();
    }
  }
}

// =============================================================
// p5.js setup / draw
// =============================================================

let lastTime = 0;

function setup() {
  createCanvas(windowWidth, windowHeight);
  colorMode(RGB, 255);
  device = detectDevice();
  applyDeviceTuning();
  initSimulation();
  lastTime = millis();
}

function initSimulation() {
  flocks = [];
  allBoids = [];

  // na malé obrazovce méně hejn i boidů (výkon + čitelnost tvarů)
  const numFlocks = device.small ? CONFIG.mobile.flocks : NUM_FLOCKS;
  const boidsPerFlock = device.small ? CONFIG.mobile.boidsPerFlock : BOIDS_PER_FLOCK;

  // Pastelové, jemné odstíny pro jednotlivá hejna ([r,g,b])
  const palette = [
    [170, 210, 240], // pastelově modrá
    [205, 195, 235], // jemná levandulová
    [190, 230, 210], // pastelově mátová
    [245, 215, 200]  // pudrově broskvová
  ];

  for (let i = 0; i < numFlocks; i++) {
    let col = palette[i % palette.length];
    let flock = new Flock(i, col);
    // každé hejno startuje z jiné oblasti obrazovky
    let cx = random(width * 0.2, width * 0.8);
    let cy = random(height * 0.2, height * 0.8);
    for (let j = 0; j < boidsPerFlock; j++) {
      let b = new Boid(cx + random(-60, 60), cy + random(-60, 60), i);
      b.flockColor = col;      // základní barva pro míchání s barvou obrazce
      flock.addBoid(b);
      allBoids.push(b);
    }
    flocks.push(flock);
  }

  controller = new SimulationController(buildShapes(device.small));
}

function draw() {
  // delta čas v sekundách pro plynulé časování
  let now = millis();
  let dt = (now - lastTime) / 1000;
  lastTime = now;

  // Overlay přes scénu. Při vypnutých trailech plné překreslení (žádná stopa),
  // jinak průhledné - nižší alpha = delší stopy.
  let fade = CONFIG.trailsEnabled ? CONFIG.trailFade : 255;
  noStroke();
  fill(6, 8, 16, fade);
  rect(0, 0, width, height);

  controller.updateStateMachine(dt);
  let shapeWeight = controller.getShapeWeight();

  // Náznak zářícího obrysu během proudění (hlavní tvar dělají boidi)
  if (controller.state === STATE.FLOW_ON_SHAPE) {
    drawShapeGhost(shapeWeight);
  }

  // Aktualizace rychlosti hejn (společný cruise pro celý squad)
  let tSec = now / 1000;
  for (let f of flocks) {
    f.update(tSec);
  }

  // Návrat flockingu (utlumený přes RELEASE -> setrvačný doběh -> seskupení)
  let flockReturn = controller.getFlockReturn();

  // Aktualizace všech boidů
  for (let b of allBoids) {
    b.applySpeed(controller, flocks[b.flockId].cruise); // cruise + dobíhání
    b.flock(allBoids, shapeWeight, flockReturn);
    b.applyShape(controller, shapeWeight);
    b.applyAttractor(controller);
    b.applyEdges();              // zatočení od kraje (jen když wrap=false)
    b.update();
    b.edges();
  }

  // Vykreslení po hejnech (svítící prvky sčítáme aditivně)
  push();
  blendMode(ADD);
  for (let f of flocks) {
    f.draw();
  }
  pop();

  drawHud();
  drawUiPanel();
}

// Velmi jemný "duch" obrysu obrazce (vodící čára uprostřed silnice) -
// jen naznačení, laděné do barvy schématu obrazce.
function drawShapeGhost(shapeWeight) {
  // reprezentativní barva schématu (uprostřed křivky)
  let scheme = controller.currentScheme();
  let ref = schemeColor(scheme, { roadOffset: 0, shapeOffset: 0.5, flockColor: [120, 140, 170] },
                        0.5, millis() / 1000);
  push();
  blendMode(ADD);
  noFill();
  stroke(ref[0], ref[1], ref[2], 20 * shapeWeight);
  strokeWeight(1);
  beginShape();
  for (let t = 0; t <= 1.0001; t += 0.01) {
    let p = controller.currentShape.getPoint(t);
    vertex(p.x, p.y);
  }
  endShape();
  pop();
}

// =============================================================
// UI panel - kreslená tlačítka dole (prst i myš)
// Na dotykových zařízeních nahrazuje klávesnici, na desktopu doplňuje.
// Štítky se počítají za běhu (ukazují stav), hitboxy se ukládají do
// uiButtons a vyhodnocují v mousePressed (tlačítko má přednost před
// atraktorem).
// =============================================================
const UI_ACTIONS = [
  { id: 'shape', label: () => '▸ tvar',
    act: () => controller.nextShape() },
  { id: 'trails', label: () => CONFIG.trailsEnabled ? 'traily ✓' : 'traily ✗',
    act: () => { CONFIG.trailsEnabled = !CONFIG.trailsEnabled; } },
  { id: 'trailMinus', label: () => 'stopa −',
    act: () => { CONFIG.trailsEnabled = true;
      CONFIG.trailFade = min(CONFIG.trailFadeMax, CONFIG.trailFade + 12); } },
  { id: 'trailPlus', label: () => 'stopa +',
    act: () => { CONFIG.trailsEnabled = true;
      CONFIG.trailFade = max(CONFIG.trailFadeMin, CONFIG.trailFade - 12); } },
  { id: 'roadMinus', label: () => 'šíře −',
    act: () => { CONFIG.road.width = max(CONFIG.road.widthMin, CONFIG.road.width - CONFIG.road.step); } },
  { id: 'roadPlus', label: () => 'šíře +',
    act: () => { CONFIG.road.width = min(CONFIG.road.widthMax, CONFIG.road.width + CONFIG.road.step); } },
  { id: 'edges', label: () => CONFIG.edges.wrap ? 'okraje ⇄' : 'okraje ▣',
    act: () => { CONFIG.edges.wrap = !CONFIG.edges.wrap; } },
  { id: 'reset', label: () => 'reset',
    act: () => { initSimulation(); lastTime = millis(); } },
];

function drawUiPanel() {
  const U = CONFIG.ui;
  const btnH = device.touch ? U.heightTouch : U.heightMouse;

  push();
  blendMode(BLEND);
  textSize(U.fontSize);
  textAlign(CENTER, CENTER);

  // šířky tlačítek podle textu, zalamování do řádků (úzké displeje)
  const widths = UI_ACTIONS.map(a => textWidth(a.label()) + 2 * U.padX);
  const maxRowW = width - 16;
  const rows = [[]];
  let rowW = 0;
  UI_ACTIONS.forEach((a, i) => {
    const w = widths[i];
    if (rowW > 0 && rowW + U.gap + w > maxRowW) { rows.push([]); rowW = 0; }
    rows[rows.length - 1].push({ a, w });
    rowW += (rowW > 0 ? U.gap : 0) + w;
  });

  // vykreslení odspodu nahoru, každý řádek vycentrovaný
  uiButtons = [];
  let y = height - U.marginBottom - btnH;
  for (let r = rows.length - 1; r >= 0; r--) {
    const row = rows[r];
    const totalW = row.reduce((s, b) => s + b.w, 0) + U.gap * (row.length - 1);
    let x = (width - totalW) / 2;
    for (const { a, w } of row) {
      noStroke();
      fill(30, 40, 60, 170);
      rect(x, y, w, btnH, btnH / 2);
      fill(190, 205, 230, 220);
      text(a.label(), x + w / 2, y + btnH / 2 - 1);
      uiButtons.push({ id: a.id, x, y, w, h: btnH, act: a.act });
      x += w + U.gap;
    }
    y -= btnH + U.gap;
  }
  pop();
}

// Decentní informační text
function drawHud() {
  push();
  blendMode(BLEND);
  noStroke();
  fill(180, 200, 230, 120);
  textSize(13);
  textAlign(LEFT, TOP);
  let label = controller.state + '  -  ' + controller.currentShape.name +
    '  [' + controller.currentShape.schemeName + ']';
  text(label, 16, 14);

  // Klávesové nápovědy jen tam, kde je klávesnice (na dotyku je nahrazuje
  // panel tlačítek dole); stavové hodnoty se hodí všude.
  fill(150, 170, 200, 80);
  textSize(11);
  let lenPct = round(map(CONFIG.trailFade,
    CONFIG.trailFadeMin, CONFIG.trailFadeMax, 100, 0));
  let trailInfo = CONFIG.trailsEnabled ? 'traily: ZAP (délka ' + lenPct + '%)' : 'traily: VYP';
  let edgeInfo = CONFIG.edges.wrap ? 'okraje: průchozí' : 'okraje: uzavřené';
  if (device.touch) {
    text(trailInfo + '    silnice: ' + round(CONFIG.road.width) + ' px    ' + edgeInfo, 16, 34);
  } else {
    text('mezerník: další obrazec    klik: atraktor    r: reset', 16, 34);
    text(trailInfo + '    t: zap/vyp    +/-: délka', 16, 50);
    text('silnice: ' + round(CONFIG.road.width) + ' px    ,/. : užší/širší', 16, 66);
    text(edgeInfo + '    w: přepnout', 16, 82);
  }
  pop();
}

// =============================================================
// Interakce
// =============================================================

function keyPressed() {
  if (key === ' ') {
    controller.nextShape();       // ruční přechod na další obrazec
  } else if (key === 'r' || key === 'R') {
    initSimulation();             // reset simulace
    lastTime = millis();
  } else if (key === 't' || key === 'T') {
    CONFIG.trailsEnabled = !CONFIG.trailsEnabled; // zap/vyp trailů
  } else if (key === '+' || key === '=' || key === ']') {
    // delší stopy = menší fade alpha
    CONFIG.trailsEnabled = true;
    CONFIG.trailFade = max(CONFIG.trailFadeMin, CONFIG.trailFade - 12);
  } else if (key === '-' || key === '_' || key === '[') {
    // kratší stopy = větší fade alpha
    CONFIG.trailsEnabled = true;
    CONFIG.trailFade = min(CONFIG.trailFadeMax, CONFIG.trailFade + 12);
  } else if (key === ',' || key === '<') {
    // užší silnice
    CONFIG.road.width = max(CONFIG.road.widthMin, CONFIG.road.width - CONFIG.road.step);
  } else if (key === '.' || key === '>') {
    // širší silnice
    CONFIG.road.width = min(CONFIG.road.widthMax, CONFIG.road.width + CONFIG.road.step);
  } else if (key === 'w' || key === 'W') {
    // přepni průchozí okraje (wrap) / uzavřené (drží se uvnitř)
    CONFIG.edges.wrap = !CONFIG.edges.wrap;
  }
}

function mousePressed() {
  // tlačítka panelu mají přednost (tap na tlačítko nesmí spustit atraktor)
  for (const b of uiButtons) {
    if (mouseX >= b.x && mouseX <= b.x + b.w && mouseY >= b.y && mouseY <= b.y + b.h) {
      b.act();
      return false; // na dotyku potlačí i syntetický scroll/zoom
    }
  }
  // jemný atraktor, který boidy na chvíli přitáhne
  controller.attractor = createVector(mouseX, mouseY);
  controller.attractorStrength = 1.0;
  return false;
}

// Tažení prstem/myší: atraktor plyne za prstem (na mobilu hlavní hračka)
function mouseDragged() {
  if (controller.attractor) {
    controller.attractor.set(mouseX, mouseY);
    controller.attractorStrength = 1.0;
  }
  return false; // ať tažení po plátně neroluje stránku
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  // při překlopení třídy zařízení (velká <-> malá obrazovka) se přepne
  // výchozí šířka silnice, sada tvarů i počty boidů (vyžaduje re-init)
  const before = device.small;
  device = detectDevice();
  if (device.small !== before) {
    applyDeviceTuning();
    initSimulation();
    lastTime = millis();
  }
}
