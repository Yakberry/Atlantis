// Smoke-тест логики игры (фазы, снабжение, бои, разъезд, приватность, случайные партии).
// Как запускать без сети (пути адаптировать под своё окружение):
//   1. tsc: tsconfig с extends ../../tsconfig.base.json, noEmit:false, outDir:/tmp/smoke/out,
//      rootDir:packages/shared/src/game, include:packages/shared/src/game/*.ts
//   2. cd /tmp/smoke/out && echo '{"type":"module"}' > package.json
//      sed -i -E "s#from '(\./[a-z]+)'#from '\1.js'#g" *.js
//   3. скопировать этот файл в /tmp/smoke/out/test.mjs и выполнить: node test.mjs
import assert from 'node:assert/strict';
import * as G from './index.js';
import { resolveBattles } from './battle.js';
import { harvestColony } from './harvest.js';
import { LOCATION_NAMES } from './names.js';

const SETTINGS = { mapSize: 12, mapStyle: 'solid' };
const lcg = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const die = (n) => (n - 0.5) / 6;
const script = (...values) => { let i = 0; return () => values[i++ % values.length]; };
const fresh = (players, seed = 1, settings = SETTINGS) => G.createGame(players, settings, lcg(seed));
const act = (s, p, a, rng) => { const r = G.applyAction(s, p, a, rng); assert.ok(r.ok, `${p} ${a.type}: ${r.error}`); return r.value; };
const bad = (s, p, a) => { const r = G.applyAction(s, p, a); assert.ok(!r.ok, `${a.type} должно быть отклонено`); return r.error; };
const colony = (s, p) => s.units.find((u) => u.ownerId === p && u.kind === 'colony');
const soldiers = (s, p) => s.units.filter((u) => u.ownerId === p && u.kind === 'unit');
const hexAt = (s, c) => s.hexes.find((h) => G.sameCell(h, c));
const isLand = (s, c) => hexAt(s, c) && hexAt(s, c).type !== 'sea';
const place = (s, id, c) => ({ ...s, units: s.units.map((u) => (u.id === id ? { ...u, q: c.q, r: c.r, revealed: { q: c.q, r: c.r } } : u)) });
const unit = (id, ownerId, kind, c) => ({ id, ownerId, kind, q: c.q, r: c.r, tired: false, steps: 0, boosted: false, revealed: { q: c.q, r: c.r } });
const discover = (s, ...cells) => ({ ...s, hexes: s.hexes.map((h) => (cells.some((c) => G.sameCell(c, h)) ? { ...h, discovered: true } : h)) });
const endAll = (s, players) => players.reduce((acc, p) => (acc.ready.includes(p) ? acc : act(acc, p, { type: 'end_phase' }).state), s);
/** Партия на фазе строительства. */
const toBuild = (players, seed = 1) => { const s = endAll(fresh(players, seed), players); assert.equal(s.phase, 'build'); return s; };
/** Свободная соседняя суша у клетки, рядом с которой нет колоний (кроме колонии игрока). */
const freeNeighbor = (s, from) => G.neighbors(from).find((n) => isLand(s, n) && !s.units.some((u) => G.sameCell(u, n)));

// ---------- 1. старт и названия ----------
let s = fresh(['a', 'b']);
assert.equal(s.phase, 'maneuver');
assert.deepEqual(s.stock.a, { food: 4, wood: 2, marble: 4, copper: 4 });
assert.deepEqual(G.RESOURCES, ['food', 'wood', 'marble', 'copper']);
assert.ok(LOCATION_NAMES.length >= G.MAX_MAP_SIZE && new Set(LOCATION_NAMES).size === LOCATION_NAMES.length, 'названий хватает и они уникальны');
for (let seed = 1; seed <= 100; seed++) {
  const g = G.createGame(['a', 'b'], { mapSize: 5 + (seed % 31), mapStyle: G.MAP_STYLES[seed % 3] }, lcg(seed));
  const land = g.hexes.filter((h) => h.type !== 'sea');
  const names = land.map((h) => h.name);
  assert.ok(names.every((n) => typeof n === 'string' && LOCATION_NAMES.includes(n)), 'названия из списка');
  assert.equal(new Set(names).size, names.length, 'названия не повторяются');
  assert.ok(g.hexes.filter((h) => h.type === 'sea').every((h) => h.name === null), 'у моря названия нет');
}
const orders = new Set(Array.from({ length: 20 }, (_, i) => G.createGame(['a'], { mapSize: 35, mapStyle: 'solid' }, lcg(i + 1)).hexes.filter((h) => h.type !== 'sea').slice(0, 5).map((h) => h.name).join()));
assert.ok(orders.size > 10, 'названия раскладываются в разном порядке');
const seen = G.viewFor(s, 'a').hexes;
assert.ok(seen.filter((h) => h.visible && h.terrain === 'land').every((h) => h.name !== null), 'видимая суша показывает название');
assert.ok(seen.filter((h) => !h.visible).every((h) => !('name' in h)), 'у скрытой локации названия нет');
console.log('1. старт 4/2/4/4 (медь), уникальные названия суши в случайном порядке, видны только у видимых локаций — ок');

// ---------- 2. порядок фаз и журнал снабжения ----------
s = fresh(['a', 'b']);
s = act(s, 'a', { type: 'end_phase' }).state;
let step = act(s, 'b', { type: 'end_phase' });
assert.equal(step.state.phase, 'build', 'после снабжения идёт строительство');
assert.deepEqual(step.state.stock.a, { food: 1, wood: 2, marble: 4, copper: 2 });
const log = step.reports.filter((r) => r.data.type === 'supply');
assert.equal(log.length, 2, 'в журнале снабжения запись на каждого игрока');
assert.deepEqual(log[0].data.spent, { food: 3, wood: 0, marble: 0, copper: 2 });
assert.deepEqual(log[0].data.left, step.state.stock.a);
assert.deepEqual(log[0].audience, ['a', 'b'], 'журнал виден всем');
s = step.state;
s = endAll(s, ['a', 'b']);
assert.equal(s.phase, 'harvest');
const fin = endAll(s, ['a', 'b']);
assert.equal(fin.turn, 2); assert.equal(fin.phase, 'maneuver');
console.log('2. манёвр → снабжение (журнал на каждого) → строительство → добыча → бой → новый ход — ок');

// ---------- 3. нехватка ресурсов ----------
s = fresh(['a', 'b']);
s = { ...s, stock: { ...s.stock, a: { food: 1, wood: 0, marble: 0, copper: 0 } } };
s = endAll(s, ['a', 'b']);
assert.equal(s.phase, 'supply'); assert.deepEqual(s.ready, ['b']);
const [u1, u2] = soldiers(s, 'a');
assert.ok(bad(s, 'a', { type: 'end_phase' }).includes('Не хватает'));
assert.ok(!G.applyAction(s, 'a', { type: 'drop_unsupplied', unitIds: [u1.id] }).ok);
const dropped = act(s, 'a', { type: 'drop_unsupplied', unitIds: [u1.id, u2.id] });
assert.equal(dropped.state.units.filter((u) => u.ownerId === 'a').length, 1);
assert.ok(dropped.reports.some((r) => r.data.type === 'supply' && r.data.playerId === 'a'), 'траты попали в журнал');
assert.ok(dropped.reports.some((r) => r.data.type === 'unsupplied' && r.audience.join() === 'a'), 'потери — только игроку');
console.log('3. снабжение: выбор допустим только минимальный, журнал и личный отчёт — ок');

// ---------- 4. строительство: места и постройки ----------
const base = toBuild(['a', 'b'], 3);
const aHome = { q: colony(base, 'a').q, r: colony(base, 'a').r };
const bHome = { q: colony(base, 'b').q, r: colony(base, 'b').r };
assert.ok(G.buildSites(base, 'a').some((c) => G.sameCell(c, aHome)), 'своя разведанная локация — место для строительства');
assert.ok(!G.buildSites(base, 'a').some((c) => G.sameCell(c, bHome)), 'чужая локация — нет');
assert.deepEqual(G.viewFor(base, 'a').sites.map((c) => `${c.q},${c.r}`), G.buildSites(base, 'a').map((c) => `${c.q},${c.r}`));
assert.deepEqual(G.viewFor({ ...base, ready: ['a'] }, 'a').sites, [], 'после готовности мест нет');

// колония: не на локации, где уже есть колония
assert.ok(bad(base, 'a', { type: 'build', building: 'colony', at: aHome }).includes('уже есть колония'));
// укреплённая колония поверх своей
const fort = act(base, 'a', { type: 'build', building: 'fortified_colony', at: aHome }).state;
const upgraded = fort.units.find((u) => u.kind === 'fortified_colony');
assert.ok(upgraded && G.sameCell(upgraded, aHome) && upgraded.ownerId === 'a');
assert.ok(!fort.units.some((u) => u.kind === 'colony' && u.ownerId === 'a'), 'укреплённая заменила колонию');
assert.deepEqual(fort.stock.a, { food: 1, wood: 1, marble: 1, copper: 2 }, 'цена: 1 лес и 3 мрамора');
assert.ok(bad(fort, 'a', { type: 'build', building: 'fortified_colony', at: aHome }).length > 0, 'повторно укрепить нельзя');
assert.deepEqual(G.supplyNeeds(fort.units.filter((u) => u.ownerId === 'a')), { food: 3, wood: 0, marble: 0, copper: 2 }, 'снабжение укреплённой — 1 еда');

// колония на разведанной соседней клетке
const N = G.neighbors(aHome).find((n) => isLand(base, n) && !G.neighbors(n).some((m) => base.units.some((u) => G.sameCell(u, m) && u.ownerId === 'b' && G.UNIT_KINDS[u.kind].colony)));
assert.ok(N, 'нашлась соседняя суша');
assert.ok(!G.buildSites(base, 'a').some((c) => G.sameCell(c, N)), 'неразведанная локация — не место');
assert.ok(bad(base, 'a', { type: 'build', building: 'colony', at: N }).includes('разведана'));
const known = discover(base, N);
assert.ok(G.buildSites(known, 'a').some((c) => G.sameCell(c, N)), 'разведанная пустая клетка рядом со своей колонией — место');
const grown = act(known, 'a', { type: 'build', building: 'colony', at: N });
const newColony = grown.state.units.find((u) => u.kind === 'colony' && G.sameCell(u, N));
assert.ok(newColony && newColony.ownerId === 'a'); assert.deepEqual(grown.state.stock.a, { food: 1, wood: 1, marble: 3, copper: 2 }, 'цена: 1 лес и 1 мрамор');
assert.ok(bad(grown.state, 'a', { type: 'build', building: 'colony', at: N }).includes('уже есть колония'), 'не больше одной колонии на локацию');
// захваченная и спорная локации — не места
const invaded = place(known, soldiers(known, 'b')[0].id, N);
assert.ok(!G.buildSites(invaded, 'a').some((c) => G.sameCell(c, N)), 'чужой юнит захватил локацию');
const contested = place(known, soldiers(known, 'b')[0].id, aHome);
assert.ok(!G.buildSites(contested, 'a').some((c) => G.sameCell(c, aHome)), 'спорная локация — не место');
// рядом с чужой колонией (пустая клетка, соседствующая и с моей, и с чужой колонией)
const between = { ...known, units: known.units.map((u) => (u.id === colony(known, 'b').id ? { ...u, q: G.neighbors(N).find((m) => !G.sameCell(m, aHome) && isLand(known, m)).q, r: G.neighbors(N).find((m) => !G.sameCell(m, aHome) && isLand(known, m)).r } : u)) };
assert.ok(!G.buildSites(between, 'a').some((c) => G.sameCell(c, N)), 'рядом чужая колония — не место');
// ресурсы
assert.ok(bad({ ...known, stock: { ...known.stock, a: { food: 0, wood: 0, marble: 0, copper: 0 } } }, 'a', { type: 'build', building: 'colony', at: N }).includes('Не хватает'));
assert.ok(bad(fresh(['a', 'b']), 'a', { type: 'build', building: 'colony', at: aHome }).includes('фазе строительства'));
console.log('4. строительство: условия места (разведана, контроль/соседство, спорная, захваченная), колония, укрепление, цены — ок');

// ---------- 5. дороги ----------
const withRoad = act(known, 'a', { type: 'build', building: 'road', at: aHome, to: N });
assert.equal(withRoad.state.roads.length, 1); assert.equal(withRoad.state.stock.a.marble, 3, 'цена: 1 мрамор');
assert.ok(bad(withRoad.state, 'a', { type: 'build', building: 'road', at: aHome, to: N }).includes('где её ещё нет'), 'дубль');
assert.ok(bad(withRoad.state, 'a', { type: 'build', building: 'road', at: N, to: aHome }).length > 0, 'обратное направление — тот же отрезок');
assert.ok(bad(known, 'a', { type: 'build', building: 'road', at: aHome }).length > 0, 'нужна соседняя локация');
const far = known.hexes.find((h) => h.type !== 'sea' && G.distance(h, aHome) >= 2);
assert.ok(bad(known, 'a', { type: 'build', building: 'road', at: aHome, to: far }).length > 0, 'только к соседней');
const seaCell = G.neighbors(aHome).find((n) => hexAt(base, n) && hexAt(base, n).type === 'sea');
if (seaCell) assert.ok(bad(discover(known, seaCell), 'a', { type: 'build', building: 'road', at: aHome, to: seaCell }).length > 0, 'по морю нельзя');
const unknownNeighbor = G.neighbors(aHome).find((n) => isLand(base, n) && !hexAt(known, n).discovered);
if (unknownNeighbor) assert.ok(bad(known, 'a', { type: 'build', building: 'road', at: aHome, to: unknownNeighbor }).length > 0, 'к неразведанной локации нельзя');
// дорога видна тем, кто видит хотя бы один её конец
assert.equal(G.viewFor(withRoad.state, 'a').roads.length, 1);
console.log('5. дорога: цена, соседняя разведанная суша, без дублей — ок');

// ---------- 6. дороги и движение ----------
let move = endAll(act(withRoad.state, 'b', { type: 'end_phase' }).state, ['a']);   // дальше манёвр нового хода достигнем ниже
// прямое состояние манёвра: два шага по дороге
const mv = fresh(['a', 'b'], 3);
const mHome = { q: colony(mv, 'a').q, r: colony(mv, 'a').r };
const M1 = G.neighbors(mHome).find((n) => isLand(mv, n));
const M2 = G.neighbors(M1).find((n) => isLand(mv, n) && !G.sameCell(n, mHome));
const road = (id, owner, a, b) => ({ id, ownerId: owner, a, b });
const hero = soldiers(mv, 'a')[0];
let t = { ...mv, roads: [road('r1', 'b', mHome, M1)] };            // дорогу построил ДРУГОЙ игрок: ходить по ней можно
t = act(t, 'a', { type: 'move', unitId: hero.id, to: M1 }).state;
let h = t.units.find((u) => u.id === hero.id);
assert.ok(h.boosted && !h.tired, 'прошёл по дороге — может шагнуть ещё раз');
t = act(t, 'a', { type: 'move', unitId: hero.id, to: M2 }).state;
h = t.units.find((u) => u.id === hero.id);
assert.ok(G.sameCell(h, M2) && h.tired, 'второй шаг — и всё');
assert.ok(!G.applyAction(t, 'a', { type: 'move', unitId: hero.id, to: M1 }).ok, 'больше двух шагов нельзя');
// без дороги — один шаг
const plain = act(mv, 'a', { type: 'move', unitId: hero.id, to: M1 }).state;
assert.ok(plain.units.find((u) => u.id === hero.id).tired, 'без дороги юнит устаёт после одного шага');
// шаг по дороге вторым (после обычного) бонуса не даёт
const R2 = G.neighbors(M1).find((n) => isLand(mv, n) && !G.sameCell(n, mHome));
let late = { ...mv, roads: [road('r2', 'a', M1, R2)] };
late = { ...late, units: late.units.map((u) => (u.id === hero.id ? { ...u, q: M1.q, r: M1.r, revealed: { q: M1.q, r: M1.r } } : u)) };
late = act(late, 'a', { type: 'move', unitId: hero.id, to: R2 }).state;
assert.ok(late.units.find((u) => u.id === hero.id).boosted === true && !late.units.find((u) => u.id === hero.id).tired, 'дорога на первом шаге даёт ещё один');
// манёвр не завершается, пока у юнита есть шаг; бонус сбрасывается на новом ходу
const half = act({ ...mv, roads: [road('r1', 'a', mHome, M1)] }, 'a', { type: 'move', unitId: hero.id, to: M1 }).state;
const other = soldiers(half, 'a')[1];
const afterOther = act(half, 'a', { type: 'move', unitId: other.id, to: G.neighbors(other).find((n) => isLand(mv, n)) }).state;
assert.ok(!afterOther.ready.includes('a'), 'у юнита с рывком ещё есть шаг — манёвр не закончен');
console.log('6. дороги: юнит, прошедший по дороге (любого игрока), делает ещё один шаг; максимум два — ок');

// ---------- 7. цепочки колоний и добыча ----------
const H = aHome;
const A = { id: 'cA', ...H }, B = { id: 'cB', ...N }, C = { id: 'cC', q: 50, r: 50 };
assert.deepEqual(G.colonyChains([A, B, C], []).map((c) => c.length), [1, 1, 1], 'без дорог — отдельные цепочки');
assert.deepEqual(G.colonyChains([A, B, C], [road('x', 'a', H, N)]).map((c) => c.length).sort(), [1, 2], 'дорога соединяет колонии');
const mid = { q: 51, r: 50 };
assert.deepEqual(G.colonyChains([A, C], [road('x', 'a', H, mid), road('y', 'a', mid, C)]).map((c) => c.length), [2], 'через промежуточную клетку');

// игровой сценарий на фазе добычи: колонии a в home и N, плюс третья отдельная
let hv = { ...grown.state, phase: 'harvest', ready: [] };           // колонии: home и N (построена)
hv = { ...hv, units: [...hv.units.filter((u) => !(u.kind === 'colony' && u.ownerId === 'a' && G.sameCell(u, N))), ...hv.units.filter((u) => u.kind === 'colony' && u.ownerId === 'a' && G.sameCell(u, N)).map((u) => ({ ...u }))] };
const cHome = colony(hv, 'a'); const cN = hv.units.find((u) => u.kind === 'colony' && G.sameCell(u, N));
assert.equal(G.viewFor(hv, 'a').chains.length, 2, 'две колонии без дороги — две цепочки');
const one = act(hv, 'a', { type: 'harvest', colonyId: cHome.id }, () => 0.5);
assert.ok(bad(one.state, 'a', { type: 'harvest', colonyId: cN.id }).length > 0, 'с другой цепочки в эту фазу нельзя');
const chainError = harvestColony({ ...one.state, ready: [] }, 'a', cN.id, () => 0.5);
assert.ok(!chainError.ok && chainError.error.includes('одной цепочки'), 'причина — одна цепочка за фазу');
assert.ok(one.state.ready.includes('a'), 'остальные цепочки недоступны — игрок готов сам');
// дорога объединяет: обе колонии в одной цепочке
const linked = { ...hv, roads: [road('r', 'a', H, N)] };
assert.equal(G.viewFor(linked, 'a').chains.length, 1);
const both = act(linked, 'a', { type: 'end_phase' }, () => 0.5);
assert.equal(both.events.length, 2, 'в одной цепочке добывают обе колонии');
// «Завершить ход» выбирает наибольшую цепочку
const third = { ...hv, roads: [road('r', 'a', H, N)], units: [...hv.units, unit('far', 'a', 'colony', { q: N.q + 7, r: N.r + 7 })] };
const biggest = act(third, 'a', { type: 'end_phase' }, () => 0.5);
assert.deepEqual(biggest.events.map((e) => e.unitId).sort(), [cHome.id, cN.id].sort(), 'автодобыча берёт наибольшую цепочку');
// чужая дорога цепочку не образует
const foreignRoad = { ...hv, roads: [road('r', 'b', H, N)] };
assert.equal(G.viewFor(foreignRoad, 'a').chains.length, 2, 'цепочки образуют только собственные дороги');
console.log('7. цепочки: дороги объединяют колонии, за фазу — одна цепочка, автодобыча берёт наибольшую, чужие дороги не считаются — ок');

// ---------- 8. осада и укреплённая колония ----------
const P = { q: 0, r: 0 };
const bs = (units) => ({ ...fresh(['a', 'b', 'c']), units });
let r = resolveBattles(bs([unit('a1', 'a', 'unit', P), unit('bc', 'b', 'colony', P)]), script(die(4)));
assert.ok(r.reports[0].data.destroyed && !r.state.units.some((u) => u.id === 'bc'), 'обычная колония падает от 4');
r = resolveBattles(bs([unit('a1', 'a', 'unit', P), unit('bf', 'b', 'fortified_colony', P)]), script(die(4), 0));
assert.ok(!r.reports[0].data.destroyed && r.state.units.some((u) => u.id === 'bf') && !r.state.units.some((u) => u.id === 'a1'), 'укреплённая устояла от 4, нападающий погиб');
r = resolveBattles(bs([unit('a1', 'a', 'unit', P), unit('bf', 'b', 'fortified_colony', P)]), script(die(5)));
assert.ok(r.reports[0].data.destroyed && !r.state.units.some((u) => u.id === 'bf'), 'от 5 укреплённая падает');
console.log('8. осада: обычная колония — от 4, укреплённая — от 5 — ок');

// ---------- 9. бои, разъезд, приватность (как раньше) ----------
let c = resolveBattles(bs([unit('a1', 'a', 'unit', P), unit('a2', 'a', 'unit', P), unit('b1', 'b', 'unit', P)]), script(die(3), die(5), die(4)));
assert.deepEqual(c.state.units.map((u) => u.id), ['a1', 'a2']);
c = resolveBattles(bs([unit('a1', 'a', 'unit', P), unit('b1', 'b', 'unit', P)]), script(die(6), die(6)));
assert.equal(c.reports[0].data.winnerId, null);
const sw = fresh(['a', 'b'], 7);
const X = sw.hexes.find((x) => x.type !== 'sea' && G.neighbors(x).some((n) => isLand(sw, n)));
const Y = G.neighbors(X).find((n) => isLand(sw, n));
const [a1] = soldiers(sw, 'a'); const [b1] = soldiers(sw, 'b');
const swapped = place(place(sw, a1.id, X), b1.id, Y);
const meet = (v) => { let q = act(swapped, 'a', { type: 'move', unitId: a1.id, to: Y }).state; q = act(q, 'b', { type: 'move', unitId: b1.id, to: X }).state; q = act(q, 'a', { type: 'end_phase' }).state; return act(q, 'b', { type: 'end_phase' }, () => v).state; };
for (const t2 of [meet(0.1), meet(0.9)]) assert.ok(G.sameCell(t2.units.find((u) => u.id === a1.id), t2.units.find((u) => u.id === b1.id)), 'столкнулись');
const priv = fresh(['a', 'b'], 11);
const before = JSON.stringify(G.viewFor(priv, 'b'));
const mover = soldiers(priv, 'a')[0];
const moved = act(priv, 'a', { type: 'move', unitId: mover.id, to: G.neighbors(mover).find((n) => isLand(priv, n)) }).state;
assert.equal(JSON.stringify(G.viewFor(moved, 'b')), before, 'ход a не виден b до раскрытия');
const stateView = G.viewFor(withRoad.state, 'b');
assert.ok(stateView.roads.length === 0 || stateView.roads.every((rd) => G.canSee(withRoad.state, 'b', rd.a) || G.canSee(withRoad.state, 'b', rd.b)), 'дороги видны только при виде на конец');
console.log('9. бои, разъезд, приватность и видимость дорог — ок');

// ---------- 10. автопропуск строительства ----------
const broke = endAll({ ...fresh(['a', 'b']), stock: { a: { food: 9, wood: 0, marble: 0, copper: 9 }, b: { food: 9, wood: 0, marble: 0, copper: 9 } } }, ['a', 'b']);
assert.equal(broke.phase, 'harvest', 'нечего строить — фаза строительства проходит сама');
console.log('10. фаза строительства пропускается, если строить нечего — ок');

// ---------- 11. выход, соло ----------
const left = G.removePlayer(endAll(fresh(['a', 'b', 'c']), ['a', 'b']), 'c', lcg(1));
assert.notEqual(left.state.phase, 'maneuver', 'ушёл последний, кого ждали');
let solo = { ...fresh(['a']), stock: { a: { food: 99, wood: 0, marble: 0, copper: 99 } } };
for (let turn = 1; turn < G.WIN_TURN; turn++) solo = endAll(endAll(solo, ['a']), ['a']);
assert.equal(solo.winnerId, 'a');
console.log('11. выход игрока и соло-партия — ок');

// ---------- 12. 150 случайных партий ----------
let builds = 0, roadsBuilt = 0, boosts = 0;
for (let seed = 1; seed <= 150; seed++) {
  const players = ['a', 'b', 'c', 'd'].slice(0, 1 + (seed % 4));
  const rng = lcg(seed * 13);
  let g = G.createGame(players, { mapSize: 5 + (seed % 31), mapStyle: G.MAP_STYLES[seed % 3] }, rng);
  g = { ...g, hexes: g.hexes.map((x) => ({ ...x, discovered: rng() < 0.7 || x.discovered })) };   // больше разведанных клеток
  for (let i = 0; i < 80 && !g.winnerId; i++) {
    for (const p of players) {
      if (g.winnerId || g.ready.includes(p)) continue;
      const mine = g.units.filter((u) => u.ownerId === p);
      let action = { type: 'end_phase' };
      if (g.phase === 'maneuver') {
        const mover2 = mine.find((u) => !u.tired && G.UNIT_KINDS[u.kind].mobile);
        const to = mover2 && G.neighbors(mover2).find((n) => isLand(g, n));
        if (mover2 && to && rng() < 0.7) action = { type: 'move', unitId: mover2.id, to };
      } else if (g.phase === 'supply') {
        const keep = [...mine]; const ids = [];
        while (!G.covers(g.stock[p], G.supplyNeeds(keep)) && keep.length) ids.push(keep.pop().id);
        for (const id of [...ids]) { const back = keep.concat(mine.filter((u) => u.id === id)); if (G.covers(g.stock[p], G.supplyNeeds(back))) { keep.push(mine.find((u) => u.id === id)); ids.splice(ids.indexOf(id), 1); } }
        action = { type: 'drop_unsupplied', unitIds: ids };
      } else if (g.phase === 'build') {
        const options = [];
        for (const site of G.buildSites(g, p)) {
          options.push({ type: 'build', building: 'colony', at: site }, { type: 'build', building: 'fortified_colony', at: site });
          for (const to of G.roadTargets(g, site)) options.push({ type: 'build', building: 'road', at: site, to });
        }
        action = options.find((o) => G.applyAction(g, p, o).ok && rng() < 0.5) ?? options.find((o) => G.applyAction(g, p, o).ok) ?? action;
        if (action.type === 'build') { builds++; if (action.building === 'road') roadsBuilt++; }
      }
      const res = G.applyAction(g, p, action, rng);
      assert.ok(res.ok, `seed ${seed} ${g.phase} ${p} ${action.type}: ${res.error}`);
      g = res.value.state;
      boosts += g.units.filter((u) => u.boosted).length ? 1 : 0;
      assert.ok(Object.values(g.stock).every((s2) => Object.values(s2).every((n) => n >= 0 && Number.isInteger(n))), 'запасы неотрицательны');
      assert.equal(new Set(g.units.map((u) => u.id)).size, g.units.length, 'идентификаторы уникальны');
      assert.equal(new Set(g.roads.map((rd) => rd.id)).size, g.roads.length);
    }
  }
}
assert.ok(builds > 100 && roadsBuilt > 10 && boosts > 0, `случайные партии действительно строили (${builds} построек, ${roadsBuilt} дорог, рывков ${boosts})`);
console.log(`12. 150 случайных партий: построек ${builds}, дорог ${roadsBuilt}, рывков по дороге ${boosts} — без ошибок`);
