-- Способ генерации карты выбирает хост; лимит суши поднят с 25 до 35.
alter table rooms add column map_style text not null default 'solid'
  check (map_style in ('classic', 'solid', 'islands'));

-- Прежнее ограничение (до 25) могло получить любое имя: находим и заменяем его.
do $$
declare name text;
begin
  for name in
    select conname from pg_constraint
     where conrelid = 'rooms'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%map_size%'
  loop
    execute format('alter table rooms drop constraint %I', name);
  end loop;
end $$;

alter table rooms add constraint rooms_map_size_check check (map_size between 5 and 35);
