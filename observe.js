// Headless pozorovací harness: nashiluje p5, spustí sketch.js, přepne na kruh
// a loguje heading vybraných boidů přes přechod FLOW -> RELEASE -> FREE.
// Spuštění: node observe.js
'use strict';
const fs = require('fs');
const vm = require('vm');

// ---- deterministická náhoda (LCG) ----
let _seed = 12345;
function rnd() { _seed = (_seed * 1664525 + 1013904223) >>> 0; return _seed / 4294967296; }
function random(a, b) {
  if (a === undefined) return rnd();
  if (b === undefined) return rnd() * a;
  return a + rnd() * (b - a);
}

// ---- jemný "noise" 0..1 ----
function noise(x, y = 0, z = 0) {
  let v = Math.sin(x * 1.7 + 1.3) + Math.sin(y * 2.1 + 2.7) + Math.sin(z * 1.1 + 0.5)
        + Math.sin((x + y) * 0.9);
  return (v / 4) * 0.5 + 0.5;
}

// ---- Vektor ----
class Vec {
  constructor(x = 0, y = 0) { this.x = x; this.y = y; }
  set(x, y) { this.x = x; this.y = y; return this; }
  add(v) { this.x += v.x; this.y += v.y; return this; }
  sub(v) { this.x -= v.x; this.y -= v.y; return this; }
  mult(s) { this.x *= s; this.y *= s; return this; }
  div(s) { this.x /= s; this.y /= s; return this; }
  mag() { return Math.hypot(this.x, this.y); }
  magSq() { return this.x * this.x + this.y * this.y; }
  setMag(m) { const l = this.mag() || 1; this.x = this.x / l * m; this.y = this.y / l * m; return this; }
  limit(m) { const l = this.mag(); if (l > m) { this.x = this.x / l * m; this.y = this.y / l * m; } return this; }
  normalize() { const l = this.mag() || 1; this.x /= l; this.y /= l; return this; }
  heading() { return Math.atan2(this.y, this.x); }
  copy() { return new Vec(this.x, this.y); }
}
const PVector = {
  sub: (a, b) => new Vec(a.x - b.x, a.y - b.y),
  add: (a, b) => new Vec(a.x + b.x, a.y + b.y),
  mult: (v, s) => new Vec(v.x * s, v.y * s),
  dist: (a, b) => Math.hypot(a.x - b.x, a.y - b.y),
  lerp: (a, b, f) => new Vec(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f),
  random2D: () => { const a = random(Math.PI * 2); return new Vec(Math.cos(a), Math.sin(a)); },
  fromAngle: (a) => new Vec(Math.cos(a), Math.sin(a)),
};
function createVector(x, y) { return new Vec(x, y); }

// ---- math helpers ----
function map(v, a, b, c, d, clamp) {
  let r = c + (d - c) * ((v - a) / (b - a));
  if (clamp) { const lo = Math.min(c, d), hi = Math.max(c, d); r = Math.max(lo, Math.min(hi, r)); }
  return r;
}
function constrain(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function lerp(a, b, t) { return a + (b - a) * t; }

// ---- ovladatelné hodiny / frame ----
let CLOCK = 0;
const noop = () => {};

const sandbox = {
  // math
  cos: Math.cos, sin: Math.sin, pow: Math.pow, abs: Math.abs, sqrt: Math.sqrt,
  floor: Math.floor, ceil: Math.ceil, round: Math.round, min: Math.min, max: Math.max,
  PI: Math.PI, TWO_PI: Math.PI * 2, HALF_PI: Math.PI / 2,
  map, constrain, lerp,
  random, noise,
  // p5 vektor
  createVector, p5: { Vector: PVector },
  // čas / plátno
  millis: () => CLOCK, frameCount: 0, width: 1280, height: 800,
  windowWidth: 1280, windowHeight: 800,
  // render stuby
  createCanvas: noop, colorMode: noop, resizeCanvas: noop, background: noop,
  push: noop, pop: noop, translate: noop, rotate: noop, fill: noop, noFill: noop,
  noStroke: noop, stroke: noop, strokeWeight: noop, rect: noop, ellipse: noop,
  triangle: noop, beginShape: noop, vertex: noop, endShape: noop, blendMode: noop,
  text: noop, textSize: noop, textAlign: noop,
  color: (r, g, b) => [r, g, b], red: c => c[0], green: c => c[1], blue: c => c[2],
  ADD: 'ADD', BLEND: 'BLEND', LEFT: 'LEFT', TOP: 'TOP', RGB: 'RGB', HSB: 'HSB',
  console,
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

// načti sketch + přidej hook na konec (sdílí scope -> vidí const/let/function)
let code = fs.readFileSync(__dirname + '/sketch.js', 'utf8');
code += `
globalThis.__hook = {
  setup, draw, STATE, CONFIG,
  get controller() { return controller; },
  get allBoids() { return allBoids; }
};`;
vm.runInContext(code, sandbox);

const hook = sandbox.__hook;
hook.setup();

// volitelně otestuj uzavřené okraje: WRAP=0 node observe.js
if (process.env.WRAP === '0' || process.env.WRAP === 'false') {
  hook.CONFIG.edges.wrap = false;
  console.log('>> okraje UZAVŘENÉ (wrap=false) - hlídám, zda boidi neopustí plátno');
}
let maxOut = 0; // největší přesah boida mimo plátno (px)

// přepni na kruh a spusť skládání
const ctrl = hook.controller;
const circleIdx = ctrl.shapes.findIndex(s => s.name === 'kruh');
ctrl.shapeIndex = circleIdx;
ctrl.currentShape = ctrl.shapes[circleIdx];
ctrl.enterState(hook.STATE.GATHER_TO_SHAPE);

// vyber pár boidů ke sledování
const boids = hook.allBoids;
const watch = [boids[0], boids[40], boids[80], boids[120]];

function deg(b) { return (b.velocity.heading() * 180 / Math.PI).toFixed(0).padStart(4); }
function spd(b) { return b.velocity.mag().toFixed(2); }

let prevState = ctrl.state;
let prevHeading = watch.map(b => b.velocity.heading());

const DT = 1000 / 60;
for (let frame = 0; frame < 60 * 22; frame++) {  // ~22 s
  CLOCK += DT;
  sandbox.frameCount++;
  hook.draw();

  // sleduj přesah mimo plátno (relevantní hlavně při uzavřených okrajích)
  for (const b of boids) {
    let out = Math.max(0, -b.position.x, b.position.x - sandbox.width,
                          -b.position.y, b.position.y - sandbox.height);
    if (out > maxOut) maxOut = out;
  }

  // detekuj velké skoky headingu (mezi snímky) u sledovaných boidů
  let maxTurn = 0, who = -1;
  watch.forEach((b, i) => {
    let h = b.velocity.heading();
    let raw = h - prevHeading[i];
    let d = Math.abs(Math.atan2(Math.sin(raw), Math.cos(raw))) * 180 / Math.PI; // korektní wrap
    if (d > maxTurn) { maxTurn = d; who = i; }
    prevHeading[i] = h;
  });

  const stateChanged = ctrl.state !== prevState;
  // loguj každých 10 snímků, plus vždy při změně stavu, plus při velkém otočení
  if (frame % 10 === 0 || stateChanged || maxTurn > 8) {
    const sw = ctrl.getShapeWeight().toFixed(2);
    const fr = ctrl.getFlockReturn().toFixed(2);
    let line = `f${String(frame).padStart(4)} t=${(CLOCK/1000).toFixed(1)}s ` +
      `${ctrl.state.padEnd(16)} sw=${sw} fr=${fr} flow=${ctrl.flowPhase.toFixed(3)} | ` +
      watch.map(b => `${deg(b)}°/${spd(b)}`).join('  ');
    if (maxTurn > 8) line += `  <== boid#${who} otočka ${maxTurn.toFixed(0)}°/snímek`;
    if (stateChanged) line += `  *** STAV: ${prevState} -> ${ctrl.state} ***`;
    console.log(line);
  }
  prevState = ctrl.state;
}

console.log(`\nMax přesah mimo plátno za celý běh: ${maxOut.toFixed(1)} px` +
  (hook.CONFIG.edges.wrap ? '  (wrap zapnutý - přesah je normální)'
                          : '  (wrap vypnutý - mělo by být ~0)'));
