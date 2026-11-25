# Nápady na další rozvoj

Původně sekce „Další směr (cíl projektu)“ v `CLAUDE.md` (commit 19d9328, 6. 6. 2026). Z pokynů pro agenty
přesunuto sem, protože jde o seznam práce, ne o pravidlo. Text níže je původní znění.

- **Cíl:** dotáhnout z hotového prototypu do prezentovatelného „produktu", který
  jde ukázat ostatním (work na to plánovaný cca červen 2026 a dál).
- Možné kroky k produktu (nápady do příště): hezčí/uklizenější UI místo textového
  HUDu (panel s ovládáním, on/off přepínače), úvodní obrazovka / název, mobilní
  ovládání (touch), volba palet a tvarů, plynulé přechody scén, sdílení/odkaz,
  případně nasazení (GitHub Pages).

Co je z toho hotové (ověřeno v kódu 25. 11. 2026): UI panel s tlačítky (`UI_ACTIONS`, `drawUiPanel` v `sketch.js`),
dotykové ovládání a mobilní režim (`detectDevice`, `applyDeviceTuning`), nasazení na GitHub Pages
(<https://byps128.github.io/PaintingBoids/>). Repo má git remote `origin` na GitHubu (původní věta „Repo zatím nemá
git remote.“ už neplatila).
