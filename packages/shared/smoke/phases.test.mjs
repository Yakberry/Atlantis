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

const SETTINGS = { mapSize: 12, mapStyle: 'solid' };
const lcg = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const die = (n) => (n - 0.5) / 6;                       // значение rng, из которого выпадет n на d6
const script = (...values) => { let i = 0; return () => values[i++ % values.length]; };
const fresh = (players, seed = 1) => G.createGame(players, SETTINGS, lcg(seed));
const act = (s, p, a, rng) => { const r = G.applyAction(s, p, a, rng); assert.ok(r.ok, `${p} ${a.type}: ${r.error}`); return r.value; };
const bad = (s, p, a) => { const r = G.applyAction(s, p, a); assert.ok(!r.ok, `${a.type} должно быть отклонено`); return r.error; };
const colony = (s, p) => s.units.find((u) => u.ownerId === p && u.kind === 'colony');
const soldiers = (s, p) => s.units.filter((u) => u.ownerId === p && u.kind === 'unit');
const hexAt = (s, c) => s.hexes.find((h) => G.sameCell(h, c));
const place = (s, id, c) => ({ ...s, units: s.units.map((u) => (u.id === id ? { ...u, q: c.q, r: c.r, revealed: { q: c.q, r: c.r } } : u)) });
const unit = (id, ownerId, kind, c) => ({ id, ownerId, kind, q: c.q, r: c.r, tired: false, revealed: { q: c.q, r: c.r } });
const endManeuver = (s, players) => players.reduce((acc, p) => act(acc, p, { type: 'end_phase' }).state, s);

// ---------- 1. старт ----------
let s = fresh(['a', 'b']);
assert.equal(s.phase, 'maneuver');
assert.deepEqual(s.stock.a, { food: 4, wood: 2, iron: 4, marble: 4 });
assert.deepEqual(s.shownStock.b, s.stock.b);
assert.deepEqual(s.ready, []);
console.log('1. старт: фаза манёвра, стартовый запас 4/2/4/4 — ок');

// ---------- 2. полный ход ----------
s = endManeuver(s, ['a', 'b']);
assert.equal(s.phase, 'harvest', 'снабжение оплатилось само и фаза пропущена');
assert.deepEqual(s.stock.a, { food: 1, wood: 2, iron: 2, marble: 4 }, 'колония 1 еда + 2 юнита по (1 еда, 1 железо)');
assert.deepEqual(s.shownStock.a, s.stock.a, 'после фазы запасы видны всем');
const homeType = hexAt(s, colony(s, 'a')).type;
const harvested = act(s, 'a', { type: 'harvest', colonyId: colony(s, 'a').id }, () => 0.999);
assert.equal(harvested.events[0].amount, 3);
assert.equal(harvested.state.stock.a[homeType], s.stock.a[homeType] + 3);
assert.deepEqual(G.viewFor(harvested.state, 'a').stock, harvested.state.stock.a, 'свой запас — актуальный');
assert.deepEqual(G.viewFor(harvested.state, 'b').rivals.a, s.stock.a, 'чужой запас обновится только после фазы');
assert.ok(harvested.state.ready.includes('a'), 'добывать больше нечем — игрок готов сам');
const finished = act(harvested.state, 'b', { type: 'end_phase' }, () => 0.5);
assert.equal(finished.events.length, 1, '«Завершить ход» добыл остаток автоматически');
assert.equal(finished.state.turn, 2);
assert.equal(finished.state.phase, 'maneuver');
assert.deepEqual(finished.state.ready, []);
assert.deepEqual(G.viewFor(finished.state, 'b').rivals.a, finished.state.stock.a, 'после фазы запас соперника обновился');
assert.ok(finished.state.units.every((u) => !u.tired));
console.log('2. цепочка фаз, авто-снабжение, авто-добыча, публичные запасы после фазы — ок');

// ---------- 3. нехватка ресурсов ----------
s = fresh(['a', 'b']);
s = { ...s, stock: { ...s.stock, a: { food: 1, wood: 0, iron: 0, marble: 0 } } };
s = endManeuver(s, ['a', 'b']);
assert.equal(s.phase, 'supply');
assert.deepEqual(s.ready, ['b'], 'готов только тот, кому хватило');
assert.ok(bad(s, 'a', { type: 'end_phase' }).includes('Не хватает'));
const [u1, u2] = soldiers(s, 'a'); const c = colony(s, 'a');
for (const [ids, why] of [[[], 'пусто'], [[u1.id], 'мало'], [[u1.id, u2.id, c.id], 'лишняя колония'], [[u1.id, u1.id], 'дубль'], [['нет'], 'чужой id']]) {
  assert.ok(!G.applyAction(s, 'a', { type: 'drop_unsupplied', unitIds: ids }).ok, `выбор отклонён: ${why}`);
}
const dropped = act(s, 'a', { type: 'drop_unsupplied', unitIds: [u1.id, u2.id] });
assert.equal(dropped.state.units.filter((u) => u.ownerId === 'a').length, 1, 'остаётся только колония');
assert.equal(dropped.state.stock.a.food, 0, 'оставшимся оплачено');
assert.equal(dropped.state.phase, 'harvest');
assert.deepEqual(dropped.reports.map((r) => [r.data.type, r.audience, r.data.units]), [['unsupplied', ['a'], 2]]);
let broke = fresh(['a', 'b']);
broke = { ...broke, stock: { ...broke.stock, a: { food: 0, wood: 0, iron: 0, marble: 0 } } };
broke = endManeuver(broke, ['a', 'b']);
const all = act(broke, 'a', { type: 'drop_unsupplied', unitIds: broke.units.filter((u) => u.ownerId === 'a').map((u) => u.id) });
assert.equal(all.state.winnerId, 'b', 'у a не осталось ничего — побеждает b');
console.log('3. снабжение: выбор допустим только минимальный, удаление, отчёт только игроку, поражение без сущностей — ок');

// ---------- 4. захват колонии ----------
s = endManeuver(fresh(['a', 'b'], 3), ['a', 'b']);
assert.equal(s.phase, 'harvest');
const aHome = { q: colony(s, 'a').q, r: colony(s, 'a').r };
const raided = place(s, soldiers(s, 'b')[0].id, aHome);
assert.ok(bad(raided, 'a', { type: 'harvest', colonyId: colony(s, 'a').id }).includes('захвачена'));
const aDone = act(raided, 'a', { type: 'end_phase' });
assert.equal(aDone.events.length, 0, 'захваченная колония не добывает даже автоматически');
const bDone = act(aDone.state, 'b', { type: 'end_phase' }, () => 0.9);
assert.ok(bDone.reports.some((r) => r.data.type === 'battle' && r.data.winnerId === null), 'на захваченной локации прошёл бой (ничья 6:6)');
assert.equal(bDone.state.turn, 2);
console.log('4. захват: колония с чужим юнитом не добывает, на фазе 4 — бой — ок');

// ---------- 5. бои напрямую ----------
const H = { q: 0, r: 0 };
const battleState = (units) => ({ ...fresh(['a', 'b', 'c']), units });
const near = { q: 1, r: 0 };
let r = resolveBattles(battleState([unit('a1', 'a', 'unit', H), unit('a2', 'a', 'unit', H), unit('b1', 'b', 'unit', H)]), script(die(3), die(5), die(4)));
assert.deepEqual(r.state.units.map((u) => u.id), ['a1', 'a2']);
assert.deepEqual([r.reports[0].data.winnerId, r.reports[0].data.rolls, r.reports[0].data.destroyed], ['a', { a: [3, 5], b: [4] }, 1]);
r = resolveBattles(battleState([unit('a1', 'a', 'unit', H), unit('b1', 'b', 'unit', H)]), script(die(6), die(6)));
assert.equal(r.state.units.length, 2); assert.equal(r.reports[0].data.winnerId, null);
r = resolveBattles(battleState([unit('a1', 'a', 'unit', H), unit('a2', 'a', 'unit', H), unit('b1', 'b', 'unit', H), unit('c1', 'c', 'unit', H)]), script(die(6), die(2), die(6), die(3)));
assert.equal(r.state.units.length, 4); assert.equal(r.reports[0].data.winnerId, null);
r = resolveBattles(battleState([unit('a1', 'a', 'unit', H), unit('b1', 'b', 'unit', H), unit('c1', 'c', 'unit', H)]), script(die(6), die(2), die(3)));
assert.deepEqual(r.state.units.map((u) => u.id), ['a1']);
r = resolveBattles(battleState([unit('a1', 'a', 'unit', H), unit('bc', 'b', 'colony', H)]), script(die(3), 0));
assert.deepEqual(r.state.units.map((u) => u.id), ['bc']);
assert.deepEqual([r.reports[0].data.type, r.reports[0].data.destroyed, r.reports[0].data.rolls], ['siege', false, [3]]);
r = resolveBattles(battleState([unit('a1', 'a', 'unit', H), unit('a2', 'a', 'unit', H), unit('bc', 'b', 'colony', H)]), script(die(2), die(4)));
assert.deepEqual(r.state.units.map((u) => u.id), ['a1', 'a2']); assert.equal(r.reports[0].data.destroyed, true);
r = resolveBattles(battleState([unit('ac', 'a', 'colony', H), unit('a1', 'a', 'unit', H), unit('b1', 'b', 'unit', H)]), script(die(2), die(5)));
assert.deepEqual(r.state.units.map((u) => u.id).sort(), ['ac', 'b1']); assert.equal(r.reports.length, 1);
r = resolveBattles(battleState([unit('ac', 'a', 'colony', H), unit('bc', 'b', 'colony', H)]), script(0.5));
assert.equal(r.reports.length, 0); assert.equal(r.state.units.length, 2);
const base5 = fresh(['a', 'b', 'c']);
const far = base5.hexes.find((h) => G.distance(h, H) >= 4) ?? base5.hexes.at(-1);
r = resolveBattles(battleState([unit('a1', 'a', 'unit', H), unit('b1', 'b', 'unit', H), unit('c1', 'c', 'unit', near)]), script(die(4), die(2)));
assert.deepEqual(r.reports[0].audience, ['a', 'b', 'c'], 'c стоит рядом и видит бой');
r = resolveBattles(battleState([unit('a1', 'a', 'unit', H), unit('b1', 'b', 'unit', H), unit('c1', 'c', 'unit', far)]), script(die(4), die(2)));
assert.deepEqual(r.reports[0].audience, ['a', 'b'], 'c далеко и не узнаёт о бое');
console.log('5. бой: победа, ничья, трое, победитель против всех, осада (успех/провал), постройки без кубика, аудитория — ок');

// ---------- 6. разъезд ----------
s = fresh(['a', 'b'], 7);
const X = s.hexes.find((h) => h.type !== 'sea' && G.neighbors(h).some((n) => hexAt(s, n) && hexAt(s, n).type !== 'sea'));
const Y = G.neighbors(X).find((n) => hexAt(s, n) && hexAt(s, n).type !== 'sea');
const [a1, a2] = soldiers(s, 'a'); const [b1] = soldiers(s, 'b');
const sw = place(place(s, a1.id, X), b1.id, Y);
const meet = (rngValue) => {
  let t = act(sw, 'a', { type: 'move', unitId: a1.id, to: Y }).state;
  t = act(t, 'b', { type: 'move', unitId: b1.id, to: X }).state;
  t = act(t, 'a', { type: 'end_phase' }).state;
  return act(t, 'b', { type: 'end_phase' }, () => rngValue).state;
};
const lowRoll = meet(0.1), highRoll = meet(0.9);
for (const t of [lowRoll, highRoll]) {
  const ua = t.units.find((u) => u.id === a1.id), ub = t.units.find((u) => u.id === b1.id);
  assert.ok(G.sameCell(ua, ub), 'столкнулись в одной локации');
  assert.ok(G.sameCell(ua, X) || G.sameCell(ua, Y), 'в одной из стартовых');
}
assert.ok(!G.sameCell(lowRoll.units.find((u) => u.id === a1.id), highRoll.units.find((u) => u.id === a1.id)), 'место встречи выбирается случайно');
let own = place(place(s, a1.id, X), a2.id, Y);
own = act(own, 'a', { type: 'move', unitId: a1.id, to: Y }).state;
own = act(own, 'a', { type: 'move', unitId: a2.id, to: X }).state;
own = act(own, 'b', { type: 'end_phase' }, () => 0.1).state;
assert.ok(G.sameCell(own.units.find((u) => u.id === a1.id), Y) && G.sameCell(own.units.find((u) => u.id === a2.id), X), 'свои проходят друг сквозь друга');
console.log('6. разъезд: чужие юниты встречаются в одной из стартовых локаций (случайно), свои — нет — ок');

// ---------- 7. авто-завершение манёвра ----------
s = fresh(['a', 'b']);
const [m1, m2] = soldiers(s, 'a');
const step = (u) => G.neighbors(u).find((n) => hexAt(s, n) && hexAt(s, n).type !== 'sea');
let m = act(s, 'a', { type: 'move', unitId: m1.id, to: step(m1) }).state;
assert.ok(!m.ready.includes('a'), 'ходить ещё есть кому');
m = act(m, 'a', { type: 'move', unitId: m2.id, to: step(m2) }).state;
assert.ok(m.ready.includes('a'), 'последний юнит походил — манёвр завершён автоматически');
console.log('7. манёвр завершается сам, когда ходить некому — ок');

// ---------- 8. фазы разделены ----------
s = fresh(['a', 'b']);
assert.ok(bad(s, 'a', { type: 'harvest', colonyId: colony(s, 'a').id }).includes('фазе добычи'));
const h = endManeuver(s, ['a', 'b']);
assert.ok(bad(h, 'a', { type: 'move', unitId: soldiers(h, 'a')[0].id, to: step(soldiers(h, 'a')[0]) }).includes('манёвра'));
console.log('8. действия доступны только в своей фазе — ок');

// ---------- 9. приватность ----------
s = fresh(['a', 'b'], 11);
const base = JSON.stringify(G.viewFor(s, 'b'));
const moved = act(s, 'a', { type: 'move', unitId: soldiers(s, 'a')[0].id, to: step(soldiers(s, 'a')[0]) }).state;
assert.equal(JSON.stringify(G.viewFor(moved, 'b')), base, 'ход a не виден b до раскрытия');
assert.deepEqual(G.viewFor(s, 'a').supply, { food: 3, wood: 0, iron: 2, marble: 0 });
console.log('9. приватность манёвра и расчёт нужд снабжения — ок');

// ---------- 10. выход игрока ----------
s = fresh(['a', 'b', 'c']);
s = endManeuver(s, ['a', 'b']);
assert.equal(s.phase, 'maneuver');
const left = G.removePlayer(s, 'c', lcg(1));
assert.equal(left.state.phase, 'harvest', 'ушёл последний, кого ждали: фазы пошли дальше');
assert.deepEqual(Object.keys(left.state.stock).sort(), ['a', 'b']);
console.log('10. выход игрока не подвешивает фазу — ок');

// ---------- 11. одиночная игра и заглушка победы ----------
s = fresh(['a']);
s = { ...s, stock: { a: { food: 99, wood: 99, iron: 99, marble: 99 } } };
for (let turn = 1; turn < G.WIN_TURN; turn++) {
  s = act(s, 'a', { type: 'end_phase' }).state;
  s = act(s, 'a', { type: 'end_phase' }).state;
}
assert.equal(s.winnerId, 'a'); assert.equal(s.turn, G.WIN_TURN);
console.log('11. соло-игра проходит ходы и заканчивается на WIN_TURN — ок');

// ---------- 12. массовая проверка устойчивости ----------
for (let seed = 1; seed <= 150; seed++) {
  const players = ['a', 'b', 'c', 'd'].slice(0, 1 + (seed % 4));
  const rng = lcg(seed * 13);
  let g = G.createGame(players, { mapSize: 5 + (seed % 31), mapStyle: G.MAP_STYLES[seed % 3] }, rng);
  for (let i = 0; i < 40 && !g.winnerId; i++) {
    for (const p of players) {
      if (g.winnerId || g.ready.includes(p)) continue;
      const mine = g.units.filter((u) => u.ownerId === p);
      let action = { type: 'end_phase' };
      if (g.phase === 'maneuver') {
        const mover = mine.find((u) => !u.tired && G.UNIT_KINDS[u.kind].mobile);
        const to = mover && G.neighbors(mover).find((n) => g.hexes.some((x) => G.sameCell(x, n) && x.type !== 'sea'));
        if (mover && to && rng() < 0.7) action = { type: 'move', unitId: mover.id, to };
      } else if (g.phase === 'supply') {
        const stock = g.stock[p];
        const keep = [...mine]; const ids = [];
        while (!G.covers(stock, G.supplyNeeds(keep)) && keep.length) ids.push(keep.pop().id);
        for (const id of [...ids]) {
          const back = keep.concat(mine.filter((u) => u.id === id));
          if (G.covers(stock, G.supplyNeeds(back))) { keep.push(mine.find((u) => u.id === id)); ids.splice(ids.indexOf(id), 1); }
        }
        action = { type: 'drop_unsupplied', unitIds: ids };
      }
      const res = G.applyAction(g, p, action, rng);
      assert.ok(res.ok, `seed ${seed} ${g.phase} ${p} ${action.type}: ${res.error}`);
      g = res.value.state;
      assert.ok(Object.values(g.stock).every((s2) => Object.values(s2).every((n) => n >= 0 && Number.isInteger(n))), 'запасы неотрицательны');
    }
  }
}
console.log('12. 150 случайных партий (1–4 игрока, все режимы карты): ходы, снабжение, бои, победа — без ошибок');
