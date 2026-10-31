import type { BuildingType, Resource, UnitKind } from '@atlantis/shared';
import { reactive } from 'vue';

/** Ключ спрайта — путь внутри `assets/sprites` без расширения. */
export type SpriteKey =
  | `tiles/${Resource | 'sea' | 'unexplored' | 'fog'}`
  | `resources/${Resource}`
  | `units/${UnitKind}`
  | `buildings/${BuildingType}`;

const files = import.meta.glob<string>('../assets/sprites/**/*.{png,svg}', {
  query: '?url',
  import: 'default',
  eager: true,
});

/** Спрайты, которые удалось загрузить. Пустые, битые и отсутствующие файлы сюда не попадают. */
const loaded = reactive<Record<string, string>>({});

for (const [path, url] of Object.entries(files)) {
  const key = path.replace(/^.*\/sprites\//, '').replace(/\.(png|svg)$/, '');
  const image = new Image();
  image.onload = () => {
    loaded[key] = url;
  };
  image.src = url;
}
console.log(loaded);

/** Адрес спрайта, если он нарисован и загрузился; иначе `undefined`: тогда рисуем запасной вариант. */
export const spriteUrl = (key: SpriteKey): string | undefined => loaded[key];
