# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Co to je

Painting Boids — mírumilovná, poetická boids vizualizace v **p5.js**. Hejna
světelných bytostí volně létají, periodicky se složí do obrazce (srdce,
kopretina, hvězda…), chvíli po jeho obrysu „proudí jako po neviditelné silnici",
a pak se zase rozletí. Žádný build, žádný framework — čistý JS + p5.js z CDN.

## Spuštění / vývoj

- **Spustit:** otevřít `index.html` v prohlížeči. Spolehlivější přes lokální
  server (kvůli CDN / cache):
  ```
  python -m http.server 8000   # pak http://localhost:8000
  ```
- **Kontrola syntaxe** (jediný „test", který tu je):
  ```
  node --check sketch.js
  ```
- Žádný build/lint/test toolchain. p5.js verze je připnutá v `index.html`
  (`p5@1.9.4` z jsDelivr).

### Headless pozorování chování (`observe.js`)

Když je problém s POHYBEM (boidi se někde divně chovají) a od stolu se nedá
najít, nehádej — **pozoruj**. `observe.js` nashiluje p5 (vektor, noise, math,
ovladatelné `millis()`/`frameCount`, render = no-op) a pustí skutečný `sketch.js`
v Node bez prohlížeče:
```
node observe.js
```
Přepne simulaci na konkrétní tvar (default kruh), nahookuje pár boidů a loguje
jejich `heading`/rychlost/stav/`shapeWeight`/`flowPhase` po snímcích — takže je
vidět PŘESNĚ kdy a proč se směr mění. Takhle se našlo, že boidi v RELEASE obíhali
zamrzlý cíl (flowPhase se neposouval). Chceš jiný tvar / jiné boidy / delší běh —
uprav konstanty nahoře v `observe.js`. Je to vývojový nástroj, ne součást appky.
Pozor: úhlové rozdíly počítej přes `atan2(sin,cos)` (wrap kolem ±180°).

## Struktura

- `index.html` — načte p5.js z CDN + `sketch.js`. Tmavé pozadí, fullscreen canvas.
- `sketch.js` — **veškerá logika v jednom souboru** (tak to chtěl autor).
- `observe.js` — headless pozorovací nástroj pro ladění pohybu (viz výše).
- `README.md` — uživatelská dokumentace (ovládání, tvary).

## Architektura (sketch.js)

Pořadí v souboru: `CONFIG` + konstanty → `ShapePath` + tvarové helpery →
`SimulationController` + `STATE` → `Boid` → `Flock` → p5 `setup`/`draw` → vstupy.

- **`Boid`** — jedna letící bytost. Boids pravidla (`flock`), síla obrazce
  (`applyShape`), atraktor (`applyAttractor`), modulace rychlosti (`applySpeed`),
  integrace pohybu (`update`), wrap-around (`edges`), kreslení (`draw`).
- **`Flock`** — hejno se společnou barvou + sdílený `cruise` (rychlost celého
  squadu, kolísá pomalým noise v `update(t)`).
- **`ShapePath`** — parametrický obrazec; `getPoint(t)` pro `t ∈ 0..1` vrací
  `p5.Vector` **už v souřadnicích plátna** (vycentrováno). `getTangent(t)` =
  numerická derivace (směr proudění).
- **`SimulationController`** — stavový automat, výběr tvaru, `flowPhase`,
  `getShapeWeight()`, `getCurrentShapePoint(boid)`, atraktor od myši.

### Stavový automat (SimulationController)

`FREE_FLOCK (6–10 s)` → `GATHER_TO_SHAPE (5 s)` → `FLOW_ON_SHAPE (6–8 s)` →
`RELEASE (4 s)` → zpět na FREE_FLOCK s dalším tvarem. Klíčové:

- **`shapeWeight` 0..1** (`getShapeWeight`, smoothstep): FREE=0, GATHER 0→1,
  FLOW=1, RELEASE 1→0. Obrazec je VŽDY jen další síla přidaná k boids chování,
  nikdy tvrdý příkaz.
- **`flowPhase`** narůstá jen ve FLOW; resetuje se na 0 při vstupu do GATHER,
  aby proudění plynule navázalo na složení. Cíl boida: v GATHER `t = shapeOffset`
  (pevně), jinak `t = shapeOffset + flowPhase` (teče).
- **`shapeForceFactor()`** — síla obrazce: FLOW `2.3`, jinak `1.8` (záměrně NE
  tolik, aby nepřebila separation a boční kolébání → jinak „jízda po kolejích").

## Klíčové mechaniky pohybu (proč to vypadá živě)

Tyhle věci jsou převzaté/inspirované sesterskou repo
`C:\repo\github\ByPS\PredatorPrayBoids` (bohatá predator/prey boids sim — dobrý
zdroj nápadů pro přirozený pohyb). Postupně vznikaly z feedbacku autora:

1. **Setrvačnost / omezení otáčení** (`Boid.update`, `CONFIG.turn`) — směr se za
   snímek smí natočit jen o omezený úhel, a limit KLESÁ s rychlostí (rychlý =
   široké oblouky, pomalý = ostřejší zatáčky). Tohle je hlavní důvod, proč boidi
   nenaskakují na přesné pozice. **Důsledek:** ostré rohy boidi neproletí.
2. **Minimální rychlost** (`CONFIG.minSpeedFactor`) — boid se nikdy nezastaví.
3. **Wander přes „wander kruh"** (`Boid.wander`, `CONFIG.wander`) — cíl na kruhu
   před boidem, úhel řídí pomalý Perlin noise → plynulý meandr, ne cukání.
4. **Osobní prostor** (`Boid.spacing = random(0.75,1.35)`) — každý boid chce jiný
   odstup → hejno není mřížka.
5. **Boční kolébání na silnici** (`applyShape`, FLOW) — `sin` s per-boid fází
   (`swayPhase/Speed/Amount`) + noise → boidi se vlní mimo přesný obrys.
6. **Dobíhání na pozici** (`Boid.applySpeed`) — kdo je daleko od cíle při
   GATHER/FLOW, zrychlí až 1.9× („dobíhá tramvaj").
7. **Rychlost hejna jako celku** (`Flock.cruise`) — sdílená, kolísá v čase →
   jedinec se přizpůsobí většině svého hejna, ale hejna mají různé tempo.

## Tvary (ShapePath)

Celkem 11: `srdce`, `kopretina`, `kruh`, `spirala`, `vlna`, `hvezda`,
`trojuhelnik`, `sestiuhelnik`, `nekonecno`, `trojlistek`, `lissajous`.

**Důležité pravidlo: žádné ostré rohy.** Kvůli omezení otáčení (viz výše) boidi
ostrý cíp nezvládnou zatočit (problém u `srdce`). Proto:

- Mnohoúhelníky a hvězdu stav jako **`roundedPolyShape(name, makeVertsFn,
  roundIters)`** — vrcholy se zaoblí **Chaikinovým ořezáváním rohů** (`chaikin`)
  a po výsledné křivce se jde podle ujité délky obvodu. Výsledek se **cachuje**
  (závisí jen na velikosti plátna). Vyšší `roundIters` = kulatější.
- Vrcholové generátory: `regularPolygonVerts(n, radiusFactor)`,
  `starVerts(points, outerFactor, innerFactor)`.
- Hladké křivky (`nekonecno`, `trojlistek`, `lissajous`, `kruh`, …) jsou prosté
  parametrické funkce — žádné cípy, takže OK.
- `shapeCenter()` / `shapeScale()` (= `min(width,height)*0.34`) drží tvary
  vycentrované a škálované podle plátna.

Přidání tvaru: jeden `shapes.push(new ShapePath('jmeno', t => …))` (nebo
`roundedPolyShape`) v `buildShapes()`. Nové ostrohranné tvary VŽDY zaoblit.
Třetí parametr je jméno barevného schématu (viz níže), default `'hejna'`.

## Barevná schémata obrazců

Registr `COLOR_SCHEMES` (objekt nahoře) — obrazec na schéma odkazuje JMÉNEM, není
hardcoded v kreslení. Typy: `solid` (jedna barva), `duo` (přechod 2 barev napříč
šířkou silnice přes `roadOffset`), `rainbow` (duha podél tvaru dle `t`, pomalu
rotuje), `oscillate` (odstín cykluje v čase), `flock` (barvy hejn). Příznak
`neon` = sytá barva + silnější/větší záře.

Barvu počítá boid sám (`Boid.currentColor`) jako `lerp(barva_hejna ->
barva_schématu, shapeWeight)` — ve volném letu pastel hejna, na obrazci barva
schématu, plynule tam a zpět. Pomocné: `hsv2rgb`, `lerpRGB`, `schemeColor`.
Barvy jsou `[r,g,b]` pole (NE p5.Color), kreslí se aditivně, takže sytě září.
Přidání schématu: položka do `COLOR_SCHEMES` + odkaz jménem u tvaru.

## Ovládání

`mezerník` další tvar · klik myši = jemný atraktor · `r` reset · `t` traily
zap/vyp · `+`/`-` (i `=`,`[`,`]`) délka trailů · `,`/`.` šířka silnice ·
`w` okraje průchozí/uzavřené. HUD vlevo nahoře ukazuje stav.

Okraje (`CONFIG.edges`): `wrap=true` proletí ven a objeví se na druhé straně;
`wrap=false` boidi se drží uvnitř — `Boid.applyEdges()` je od kraje (margin)
plynule stočí dovnitř (steering, aplikuje se před `update`), `Boid.edges()` pak
buď wrapne, nebo tvrdě podrží uvnitř s útlumem rychlosti ven. Containment se dá
otestovat: `WRAP=0 node observe.js` (hlásí max přesah mimo plátno, má být ~0).

## Ladění / konvence

- **Všechno laditelné je v `CONFIG`** (nahoře) + sadě konstant `NUM_FLOCKS`,
  `BOIDS_PER_FLOCK`, `PERCEPTION`, `SEPARATION_RADIUS`, váhy `W_*`,
  `OTHER_FLOCK_FACTOR`. Měň primárně tam.
- Vizuál: tmavé pozadí, pastelové barvy hejn (paleta v `initSimulation`),
  svítící trojúhelníčky kreslené **aditivně** (`blendMode(ADD)`), traily přes
  průhledný overlay (při vypnutí plné překreslení).
- Komentáře v kódu jsou **česky** — drž ten styl.
- Separation musí zůstat aktivní vždy (i během obrazce), jinak se boidi slepí.

## Kontext / preference autora (paměť)

- Autor je česky mluvící; preferuje čistý, srozumitelný JS, žádný TypeScript,
  žádné zbytečné frameworky, vše v jednom `sketch.js`.
- Estetika: klidná, živá, hypnotická — NE agresivní barvy ani „bojový" styl.
  Boidi musí pořád působit jako živé letící bytosti, ne statické body/drony.
- Opakovaný feedback během vývoje (užitečné vodítko, co autora ruší):
  „hmyzí" trhaný pohyb, příliš výrazné/široké traily, sterilní přesné formace,
  jízda „po kolejích" bez bočního pohybu, a ostré rohy, kterými boidi neproletí.
  Když děláš změny, míř
  na organický, plynulý, lehce nepřesný pohyb.
