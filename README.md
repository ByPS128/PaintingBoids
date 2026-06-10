# Painting Boids

**▶ Živá ukázka: <https://byps128.github.io/PaintingBoids/>** — běží přímo
v prohlížeči, nic se neinstaluje.

Mírumilovná, poetická **boids** vizualizace v [p5.js](https://p5js.org/).

Hejna světelných bytostí volně létají po obrazovce. Občas jim je „vnuknuta
myšlenka" vytvořit obrazec — boidi se postupně přeskupí, začnou proudit po
neviditelné silnici ve tvaru obrazce, chvíli ho drží za letu, a pak se zase
rozletí do volných hejn. Celé to běží samo dokola a obrazce se střídají.

Boidi se pořád chovají jako živé letící bytosti — plynulý let, setrvačné
zatáčení v obloucích, proměnlivé tempo hejna a lehce nepřesné formace.

## Spuštění

Nejjednodušší je otevřít `index.html` v prohlížeči. Spolehlivější přes lokální
server:

```bash
python -m http.server 8000
# pak otevři http://localhost:8000
```

p5.js se načítá z CDN, takže žádná instalace ani build nejsou potřeba.

## Ovládání

Dole na obrazovce je **panel tlačítek** (tvar, traily, délka stopy, šířka
silnice, počet boidů, okraje, reset) — funguje myší i prstem, na dotykových
zařízeních nahrazuje klávesnici. Klik/tap kamkoli jinam vytvoří jemný
**atraktor**; tažením prstu/myši se atraktor přesouvá a boidi plynou za ním.

Výchozí **počet boidů** se na desktopu odvozuje z plochy okna (velký monitor
dostane víc), tlačítky `boidi −/+` nebo klávesami `b`/`n` ho jde měnit po
desítkách. Noví boidi se líhnou poblíž svých hejn, ubírá se z konce.

Klávesové zkratky (desktop):

| Klávesa / akce | Co dělá |
|---|---|
| `mezerník` | ručně přepne na další obrazec |
| klik myší | vytvoří jemný atraktor, který boidy na chvíli přitáhne |
| `r` | reset simulace |
| `t` | traily (stopy) zapnout / vypnout |
| `+` / `-` | prodloužit / zkrátit traily (i `=`, `[`, `]`) |
| `,` / `.` | užší / širší „silnice" obrazce |
| `b` / `n` | míň / víc boidů (po 10) |
| `w` | okraje: průchozí (proletí na druhou stranu) ↔ uzavřené (drží se uvnitř) |

Stav simulace a nastavení se zobrazují v levém horním rohu.

## Mobil

Aplikace detekuje malou obrazovku a dotykové ovládání a přizpůsobí se:
užší výchozí „silnice" (tvary se na malém displeji neslévají), o něco větší
obrazce, méně boidů (výkon) a **vlastní sada obrazců** čitelných v malém —
místo osmilisté kopretiny pětilistý kvítek, spirála jen se dvěma otočkami;
vlna, šestiúhelník a lissajous se na mobilu nenabízejí.

## Obrazce

Srdce · kopretina · kruh · spirála · vlna · hvězda · trojúhelník · šestiúhelník ·
nekonečno (∞) · trojlístek · lissajous.
(Na malé obrazovce kompaktní sada: srdce · kvítek · kruh · spirála · hvězda ·
trojúhelník · nekonečno · trojlístek.)

Mnohoúhelníky a hvězda mají **zaoblené rohy**, aby jimi boidi dokázali za letu
proletět.

Každý obrazec má vlastní **barevné schéma** (srdce rudé, kopretina bílá,
trojlístek zelený, spirála/trojúhelník duhové, šestiúhelník/nekonečno neonové…).
Ve volném letu mají boidi pastelové barvy hejn a do barvy obrazce plynule
přecházejí při skládání.

## Jak to funguje (stručně)

Simulace běží přes stavový automat:

1. **FREE_FLOCK** — hejna létají volně (klasická pravidla separation / alignment
   / cohesion + jemný wander).
2. **GATHER_TO_SHAPE** — vybere se obrazec, vliv tvaru postupně narůstá a boidi
   se během několika sekund organicky přeskupí; vzdálení „přispěchají".
3. **FLOW_ON_SHAPE** — boidi proudí po obrysu obrazce (každý má vlastní pozici na
   křivce, která se v čase posouvá), s jemným kolébáním, aby tvar dýchal.
4. **RELEASE** — vliv obrazce klesá a boidi se plynule rozletí zpět do hejn.

Obrazec není nikdy tvrdý příkaz — je to jen další síla přidaná k běžnému
flockingu, jejíž váha plynule najíždí od 0 do 1 a zpět.

## Konfigurace

Veškeré laditelné parametry jsou nahoře v `sketch.js` — objekt `CONFIG`
(traily, rychlost otáčení, wander, minimální rychlost) a sada konstant pod ním
(počet hejn, počet boidů, vnímací poloměry, váhy jednotlivých sil).

## Struktura

- `index.html` — načte p5.js + `sketch.js`
- `sketch.js` — celá aplikace (třídy `Boid`, `Flock`, `ShapePath`,
  `SimulationController`)
- `observe.js` — vývojový nástroj: spustí simulaci „bez prohlížeče" v Node
  (`node observe.js`) a vypíše chování boidů po snímcích. Užitečné při ladění
  pohybu — je vidět přesně, kdy a proč boid mění směr.

Podrobnosti k architektuře a vývoji viz [`CLAUDE.md`](./CLAUDE.md).

## Technologie

Čistý JavaScript + p5.js (z CDN). Žádný build, žádné závislosti, žádný
TypeScript.
