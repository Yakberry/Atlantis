import type { Resource, UnitKind } from './model';

export const RESOURCE_LABELS: Record<Resource, string> = {
  food: 'Продовольствие',
  wood: 'Лес',
  marble: 'Мрамор',
  copper: 'Медь',
};

/** Названия видов для интерфейса и чата. */
export const UNIT_LABELS: Record<UnitKind, string> = {
  unit: 'Фаланга',
  rider: 'Кавалерия',
  archer: 'Стрелки',
  scout: 'Разведчики',
  catapult: 'Катапульта',
  fleet: 'Флот',
  guild: 'Гильдия',
  market: 'Рыночная площадь',
  barracks: 'Казармы',
  colony: 'Колония',
  fortified_colony: 'Укреплённая колония',
};
