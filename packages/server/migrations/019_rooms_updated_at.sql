-- Время последней активности комнаты: по нему удаляются давно не использовавшиеся комнаты (см. maintenance.ts).
alter table rooms add column updated_at timestamptz not null default now();
create index rooms_updated_at_idx on rooms (updated_at);
