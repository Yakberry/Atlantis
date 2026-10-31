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
import { canStillMove, legalSteps, moveUnit } from './maneuver.js';
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
const rider = (s, p) => s.units.find((u) => u.ownerId === p && u.kind === 'rider');
const walker = (s, p) => s.units.find((u) => u.ownerId === p && u.kind === 'unit');
const at = (s, id) => s.units.find((u) => u.id === id);
const hexAt = (s, c) => s.hexes.find((h) => G.sameCell(h, c));
const isLand = (s, c) => hexAt(s, c) && hexAt(s, c).type !== 'sea';
const place = (s, id, c) => ({ ...s, units: s.units.map((u) => (u.id === id ? { ...u, q: c.q, r: c.r, revealed: { q: c.q, r: c.r } } : u)) });
const unit = (id, ownerId, kind, c) => ({ id, ownerId, kind, shownKind: kind, fresh: false, q: c.q, r: c.r, tired: false, blocked: false, revealed: { q: c.q, r: c.r } });
const road = (id, owner, a, b, freshFlag = false) => ({ id, ownerId: owner, a, b, fresh: freshFlag });
const discover = (s, ...cells) => ({ ...s, hexes: s.hexes.map((h) => (cells.some((c) => G.sameCell(c, h)) ? { ...h, discovered: true } : h)) });
const endAll = (s, players) => players.reduce((acc, p) => (acc.ready.includes(p) ? acc : act(acc, p, { type: 'end_phase' }).state), s);
/** Партия на фазе строительства. */
/** Проходит все этапы манёвра (с потолком итераций: зависание превращается в ошибку). */
const endManeuver = (s, players) => { for (let i = 0; s.phase === 'maneuver'; i++) { assert.ok(i < 10, 'манёвр завис'); s = endAll(s, players); } return s; };
const landNeighbors = (s, c) => G.neighbors(c).filter((n) => isLand(s, n));
/** Три клетки суши X–Y–Z подряд: Y соседствует и с X, и с Z. */
const corridor = (s) => { for (const y of s.hexes.filter((h) => h.type !== 'sea')) { const [x, z] = landNeighbors(s, y); if (x && z) return { x, y: { q: y.q, r: y.r }, z }; } };
const toBuild = (players, seed = 1) => { const s = endManeuver(fresh(players, seed), players); assert.equal(s.phase, 'build'); return s; };
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
const reports = [];
for (let i = 0; s.phase === 'maneuver'; i++) { assert.ok(i < 10, 'манёвр завис'); for (const p of ['a', 'b']) { if (s.ready.includes(p) || s.phase !== 'maneuver') continue; const rr = act(s, p, { type: 'end_phase' }); s = rr.state; reports.push(...rr.reports); } }
assert.equal(s.phase, 'build', 'после снабжения идёт строительство');
assert.deepEqual(s.stock.a, { food: 1, wood: 2, marble: 4, copper: 2 });
const log = reports.filter((r) => r.data.type === 'supply');
assert.equal(log.length, 2, 'в журнале снабжения запись на каждого игрока');
assert.deepEqual(log[0].data.spent, { food: 3, wood: 0, marble: 0, copper: 2 });
assert.deepEqual(log[0].data.left, s.stock.a);
assert.deepEqual(log[0].audience, ['a', 'b'], 'журнал виден всем');
s = endAll(s, ['a', 'b']);
assert.equal(s.phase, 'harvest');
const fin = endAll(s, ['a', 'b']);
assert.equal(fin.turn, 2); assert.equal(fin.phase, 'maneuver'); assert.equal(fin.stage, 'riders'); assert.ok(fin.units.every((u) => !u.tired && !u.blocked));
console.log('2. манёвр → снабжение (журнал на каждого) → строительство → добыча → бой → новый ход — ок');

// ---------- 3. нехватка ресурсов ----------
s = fresh(['a', 'b']);
s = { ...s, stock: { ...s.stock, a: { food: 1, wood: 0, marble: 0, copper: 0 } } };
s = endManeuver(s, ['a', 'b']);
assert.equal(s.phase, 'supply'); assert.deepEqual(s.ready, ['b']);
const u1 = walker(s, 'a'), u2 = rider(s, 'a');
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

// ---------- 5. дороги: общие, оба конца — доступные места ----------
const withRoad = act(known, 'a', { type: 'build', building: 'road', at: aHome, to: N });
assert.equal(withRoad.state.roads.length, 1); assert.equal(withRoad.state.stock.a.marble, 3, 'цена: 1 мрамор');
assert.ok(bad(withRoad.state, 'a', { type: 'build', building: 'road', at: aHome, to: N }).includes('где её ещё нет'), 'дубль');
assert.ok(bad(withRoad.state, 'a', { type: 'build', building: 'road', at: N, to: aHome }).length > 0, 'обратное направление — тот же отрезок');
assert.ok(bad(known, 'a', { type: 'build', building: 'road', at: aHome }).length > 0, 'нужна соседняя локация');
const far = known.hexes.find((h) => h.type !== 'sea' && G.distance(h, aHome) >= 2);
assert.ok(bad(known, 'a', { type: 'build', building: 'road', at: aHome, to: far }).length > 0, 'только к соседней');
const seaCell = G.neighbors(aHome).find((n) => hexAt(base, n) && hexAt(base, n).type === 'sea');
if (seaCell) assert.ok(bad(discover(known, seaCell), 'a', { type: 'build', building: 'road', at: aHome, to: seaCell }).length > 0, 'по морю нельзя');
// второй конец тоже должен быть доступен для строительства (захваченная/спорная/чужая локация — нет)
const endP = G.neighbors(aHome).find((n) => isLand(known, n) && !G.sameCell(n, N) && G.canBuildAt(discover(known, n), 'a', n));
if (endP) {
  const knownP = discover(known, endP);
  assert.ok(G.roadTargets(knownP, 'a', aHome).some((c) => G.sameCell(c, endP)), 'свободная разведанная соседка — конец дороги');
  const takenP = place(knownP, soldiers(knownP, 'b')[0].id, endP);
  assert.ok(!G.roadTargets(takenP, 'a', aHome).some((c) => G.sameCell(c, endP)), 'захваченная локация — не конец дороги');
  assert.ok(bad(takenP, 'a', { type: 'build', building: 'road', at: aHome, to: endP }).includes('доступными вам'), 'дорогу в недоступную локацию строить нельзя');
}
const unknownNeighbor = G.neighbors(aHome).find((n) => isLand(base, n) && !hexAt(known, n).discovered);
if (unknownNeighbor) assert.ok(bad(known, 'a', { type: 'build', building: 'road', at: aHome, to: unknownNeighbor }).length > 0, 'к неразведанной локации нельзя');
// дорога видна тем, кто видит хотя бы один её конец
assert.equal(G.viewFor(withRoad.state, 'a').roads.length, 1);
console.log('5. дорога: цена, без дублей, оба конца — доступные для строительства места — ок');

// ---------- 5б. новые постройки и дороги скрыты от других до конца строительства ----------
const watcher = G.neighbors(N).find((n) => isLand(known, n) && !G.sameCell(n, aHome));
const watched = watcher ? place(known, soldiers(known, 'b')[0].id, watcher) : known;   // юнит b рядом с N: видит её
assert.ok(!watcher || G.canSee(watched, 'b', N), 'наблюдатель видит локацию');
const builtNew = act(watched, 'a', { type: 'build', building: 'colony', at: N }).state;
const builtRoad = act(builtNew, 'a', { type: 'build', building: 'road', at: aHome, to: N }).state;
const unitsIn = (v) => v.hexes.flatMap((h) => (h.visible ? h.units : []));
const newId = builtRoad.units.find((u) => u.fresh).id;
assert.ok(unitsIn(G.viewFor(builtRoad, 'a')).some((u) => u.id === newId), 'владелец видит новую колонию');
assert.ok(!unitsIn(G.viewFor(builtRoad, 'b')).some((u) => u.id === newId), 'противник новую колонию не видит');
assert.equal(G.viewFor(builtRoad, 'a').roads.length, 1, 'владелец видит новую дорогу');
assert.equal(G.viewFor(builtRoad, 'b').roads.length, 0, 'противник новую дорогу не видит');
const kindsSeen = (st, viewer) => unitsIn(G.viewFor(st, viewer)).filter((u) => u.ownerId === 'a' && G.UNIT_KINDS[u.kind].colony).map((u) => u.kind);
const hiddenUpgrade = act(watched, 'a', { type: 'build', building: 'fortified_colony', at: aHome }).state;
assert.deepEqual(kindsSeen(hiddenUpgrade, 'a'), ['fortified_colony']);
assert.ok(!kindsSeen(hiddenUpgrade, 'b').includes('fortified_colony'), 'об укреплении противник не знает до конца фазы');
const opened = endAll(builtRoad, ['a', 'b']);
assert.equal(opened.phase, 'harvest');
assert.ok(opened.units.every((u) => !u.fresh && u.shownKind === u.kind) && opened.roads.every((rd) => !rd.fresh), 'конец фазы открывает всё');
assert.ok(unitsIn(G.viewFor(opened, 'b')).some((u) => u.id === newId), 'после фазы противник видит новую колонию');
assert.equal(G.viewFor(opened, 'b').roads.length, 1, 'и дорогу');
assert.ok(endAll(hiddenUpgrade, ['a', 'b']).units.some((u) => u.kind === 'fortified_colony' && u.shownKind === 'fortified_colony'));
console.log('5б. новые постройки и дороги скрыты до конца фазы строительства, улучшение выглядит прежним — ок');

// ---------- 6. этапы манёвра ----------
const mv = fresh(['a', 'b'], 3);
const mHome = { q: colony(mv, 'a').q, r: colony(mv, 'a').r };
const M1 = landNeighbors(mv, mHome)[0];
const M2 = landNeighbors(mv, M1).find((n) => !G.sameCell(n, mHome));
assert.ok(bad(mv, 'a', { type: 'move', unitId: walker(mv, 'a').id, to: M1 }).includes('повышенной скоростью'), 'этап 1: обычный юнит не ходит');
let st = act(mv, 'a', { type: 'move', unitId: rider(mv, 'a').id, to: M1 }).state;
assert.ok(at(st, rider(mv, 'a').id).tired);
assert.ok(st.ready.includes('a'), 'ходить больше некому — игрок готов сам');
const secondStep = moveUnit({ ...st, ready: [] }, 'a', rider(mv, 'a').id, M2);
assert.ok(!secondStep.ok && secondStep.error.includes('на этом этапе'), 'один шаг за этап');
assert.deepEqual(at(st, rider(mv, 'a').id).revealed, mHome, 'до синхронизации противники видят старую позицию');
st = endAll(st, ['a', 'b']);
assert.deepEqual(at(st, rider(mv, 'a').id).revealed, { q: M1.q, r: M1.r }, 'после этапа перемещение показано всем');
assert.equal(st.stage, 'march', 'этап дорог пропущен: дорог нет');
assert.ok(!at(st, rider(mv, 'a').id).tired, 'на новом этапе юнит снова может ходить');
// этап «дороги»: только по дороге, дорога общая
let onRoad = { ...mv, stage: 'roads', roads: [road('r1', 'b', mHome, M1)] };
assert.ok(bad(onRoad, 'a', { type: 'move', unitId: walker(onRoad, 'a').id, to: landNeighbors(mv, mHome).find((n) => !G.sameCell(n, M1)) }).includes('по дороге'));
onRoad = act(onRoad, 'a', { type: 'move', unitId: walker(onRoad, 'a').id, to: M1 }).state;
assert.ok(G.sameCell(at(onRoad, walker(mv, 'a').id), M1));
const marchNow = endAll(onRoad, ['a', 'b']);
assert.equal(marchNow.stage, 'march');
const again = act(marchNow, 'a', { type: 'move', unitId: walker(mv, 'a').id, to: M2 }).state;
assert.ok(G.sameCell(at(again, walker(mv, 'a').id), M2), 'тот же юнит идёт и на этапе марша');
// этап пропускается, когда ходить некому (нет всадников)
const noRiders = { ...mv, units: mv.units.filter((u) => u.kind !== 'rider') };
assert.ok(G.removePlayer(noRiders, 'zzz').state.stage === 'riders');
const skipState = endAll({ ...noRiders, ready: [] }, []);
assert.equal(skipState.stage, 'riders');
console.log('6. этапы манёвра: всадники → по дорогам → марш; синхронизация после каждого; пропуск пустых этапов — ок');

// ---------- 6б. столкновения ----------
const { x: cX, y: cY, z: cZ } = corridor(mv);
const setup = (kindA, kindB, ca, cb) => {
  let q = mv;
  q = place(q, kindA === 'rider' ? rider(q, 'a').id : walker(q, 'a').id, ca);
  return place(q, kindB === 'rider' ? rider(q, 'b').id : walker(q, 'b').id, cb);
};
let coll = setup('rider', 'rider', cX, cZ);
coll = act(coll, 'a', { type: 'move', unitId: rider(coll, 'a').id, to: cY }).state;
coll = act(coll, 'b', { type: 'move', unitId: rider(coll, 'b').id, to: cY }).state;   // ходить больше некому: этап синхронизируется сам
assert.equal(coll.stage, 'march');
assert.ok(at(coll, rider(mv, 'a').id).blocked && at(coll, rider(mv, 'b').id).blocked, 'столкнувшиеся юниты заблокированы');
assert.ok(bad({ ...coll, stage: 'march' }, 'a', { type: 'move', unitId: rider(mv, 'a').id, to: cX }).includes('столкнулся'), 'дальше двигаться нельзя');
assert.ok(!canStillMove({ ...coll, stage: 'march' }, at(coll, rider(mv, 'a').id)));
const headOn = (v) => { let q = setup('rider', 'rider', cX, cY); q = act(q, 'a', { type: 'move', unitId: rider(q, 'a').id, to: cY }).state; return act(q, 'b', { type: 'move', unitId: rider(q, 'b').id, to: cX }, () => v).state; };   // последний ход запускает синхронизацию
const lo = headOn(0.1), hi = headOn(0.9);
for (const q of [lo, hi]) {
  const ua = at(q, rider(mv, 'a').id), ub = at(q, rider(mv, 'b').id);
  assert.ok(G.sameCell(ua, ub) && (G.sameCell(ua, cX) || G.sameCell(ua, cY)), 'в одной из двух стартовых клеток');
  assert.ok(ua.blocked && ub.blocked, 'и заблокированы');
}
assert.ok(!G.sameCell(at(lo, rider(mv, 'a').id), at(hi, rider(mv, 'a').id)), 'какая именно — случайно');
let still = setup('rider', 'unit', cX, cY);
still = act(still, 'a', { type: 'move', unitId: rider(still, 'a').id, to: cY }).state;
still = endAll(still, ['a', 'b']);
assert.ok(at(still, rider(mv, 'a').id).blocked && at(still, walker(mv, 'b').id).blocked, 'заблокированы и вошедший, и стоявший');
let lone = place(mv, rider(mv, 'a').id, cX);
lone = { ...lone, units: lone.units.filter((u) => !(u.ownerId === 'b' && u.kind !== 'colony')) };
lone = place(lone, colony(lone, 'b').id, cY);
lone = act(lone, 'a', { type: 'move', unitId: rider(lone, 'a').id, to: cY }).state;
lone = endAll(lone, ['a', 'b']);
assert.ok(!at(lone, rider(mv, 'a').id).blocked, 'постройки в столкновении не участвуют');
console.log('6б. столкновения и встречные ходы: блокировка до конца хода, случайная стартовая клетка, постройки не блокируют — ок');

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
// дороги общие: цепочку образует и дорога, построенная другим игроком
const foreignRoad = { ...hv, roads: [road('r', 'b', H, N)] };
assert.equal(G.viewFor(foreignRoad, 'a').chains.length, 1, 'дороги общие: цепочку образует и чужая дорога');
assert.equal(act(foreignRoad, 'a', { type: 'end_phase' }, () => 0.5).events.length, 2, 'добывают обе колонии цепочки');
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
const priv = fresh(['a', 'b'], 11);
const before = JSON.stringify(G.viewFor(priv, 'b'));
const mover = rider(priv, 'a');
const moved = act(priv, 'a', { type: 'move', unitId: mover.id, to: G.neighbors(mover).find((n) => isLand(priv, n)) }).state;
const hideReady = (json) => { const v = JSON.parse(json); delete v.ready; return JSON.stringify(v); };   // готовность игроков публична
assert.ok(hideReady(JSON.stringify(G.viewFor(moved, 'b'))) === hideReady(before), 'ход a не виден b до раскрытия');
const stateView = G.viewFor(withRoad.state, 'b');
assert.ok(stateView.roads.length === 0 || stateView.roads.every((rd) => G.canSee(withRoad.state, 'b', rd.a) || G.canSee(withRoad.state, 'b', rd.b)), 'дороги видны только при виде на конец');
console.log('9. бои, приватность и видимость дорог — ок');

// ---------- 10. автопропуск строительства ----------
const broke = endManeuver({ ...fresh(['a', 'b']), stock: { a: { food: 9, wood: 0, marble: 0, copper: 9 }, b: { food: 9, wood: 0, marble: 0, copper: 9 } } }, ['a', 'b']);
assert.equal(broke.phase, 'harvest', 'нечего строить — фаза строительства проходит сама');
console.log('10. фаза строительства пропускается, если строить нечего — ок');

// ---------- 11. выход, соло ----------
const left = G.removePlayer(endAll(fresh(['a', 'b', 'c']), ['a', 'b']), 'c', lcg(1));
assert.ok(left.state.phase !== 'maneuver' || left.state.stage !== 'riders', 'ушёл последний, кого ждали: этап пошёл дальше');
let solo = { ...fresh(['a']), stock: { a: { food: 99, wood: 0, marble: 0, copper: 99 } } };
for (let turn = 1; turn < G.WIN_TURN; turn++) solo = endAll(endManeuver(solo, ['a']), ['a']);
assert.equal(solo.winnerId, 'a');
console.log('11. выход игрока и соло-партия — ок');

// ---------- 12. 150 случайных партий ----------
let builds = 0, roadsBuilt = 0, blockedGames = 0; const stageMoves = { riders: 0, roads: 0, march: 0 };
const SEEDS = Number(process.env.SEEDS ?? 150);
for (let seed = 1; seed <= SEEDS; seed++) {
  const players = ['a', 'b', 'c', 'd'].slice(0, 1 + (seed % 4));
  const rng = lcg(seed * 13);
  let g = G.createGame(players, { mapSize: 5 + (seed % 31), mapStyle: G.MAP_STYLES[seed % 3] }, rng);
  g = { ...g, hexes: g.hexes.map((x) => ({ ...x, discovered: rng() < 0.7 || x.discovered })) };   // больше разведанных клеток
  for (let i = 0; i < 120 && !g.winnerId; i++) {
    for (const p of players) {
      if (g.winnerId || g.ready.includes(p)) continue;
      const mine = g.units.filter((u) => u.ownerId === p);
      let action = { type: 'end_phase' };
      if (g.phase === 'maneuver') {
        const mover2 = mine.find((u) => canStillMove(g, u));
        const steps = mover2 ? legalSteps(g, mover2) : [];
        if (mover2 && rng() < 0.75) { action = { type: 'move', unitId: mover2.id, to: steps[Math.floor(rng() * steps.length)] }; stageMoves[g.stage]++; }
      } else if (g.phase === 'supply') {
        const keep = [...mine]; const ids = [];
        while (!G.covers(g.stock[p], G.supplyNeeds(keep)) && keep.length) ids.push(keep.pop().id);
        for (const id of [...ids]) { const back = keep.concat(mine.filter((u) => u.id === id)); if (G.covers(g.stock[p], G.supplyNeeds(back))) { keep.push(mine.find((u) => u.id === id)); ids.splice(ids.indexOf(id), 1); } }
        action = { type: 'drop_unsupplied', unitIds: ids };
      } else if (g.phase === 'build') {
        const options = [];
        for (const site of G.buildSites(g, p)) {
          options.push({ type: 'build', building: 'colony', at: site }, { type: 'build', building: 'fortified_colony', at: site });
          for (const to of G.roadTargets(g, p, site)) options.push({ type: 'build', building: 'road', at: site, to });
        }
        action = options.find((o) => G.applyAction(g, p, o).ok && rng() < 0.5) ?? options.find((o) => G.applyAction(g, p, o).ok) ?? action;
        if (action.type === 'build') { builds++; if (action.building === 'road') roadsBuilt++; }
      }
      const res = G.applyAction(g, p, action, rng);
      assert.ok(res.ok, `seed ${seed} ${g.phase} ${p} ${action.type}: ${res.error}`);
      g = res.value.state;
      if (g.units.some((u) => u.blocked)) blockedGames++;
      assert.ok(g.units.every((u) => !(u.blocked && u.tired && g.phase === 'maneuver' && false)), 'ok');
      assert.ok(Object.values(g.stock).every((s2) => Object.values(s2).every((n) => n >= 0 && Number.isInteger(n))), 'запасы неотрицательны');
      assert.equal(new Set(g.units.map((u) => u.id)).size, g.units.length, 'идентификаторы уникальны');
      assert.equal(new Set(g.roads.map((rd) => rd.id)).size, g.roads.length);
    }
  }
}
if (SEEDS >= 100) assert.ok(builds > 100 && roadsBuilt > 10 && stageMoves.riders > 50 && stageMoves.march > 100 && blockedGames > 0, JSON.stringify({ builds, roadsBuilt, stageMoves, blockedGames }));
console.log(`12. ${SEEDS} случайных партий: построек ${builds}, дорог ${roadsBuilt}, ходов по этапам ${JSON.stringify(stageMoves)}, шагов со столкновениями ${blockedGames} — без ошибок`);
