alter table rooms add column map_size integer not null default 7 check (map_size between 5 and 25);
