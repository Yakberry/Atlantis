-- Служебные сообщения игры (бои, потери без снабжения) не принадлежат игроку и видны не всем:
-- `audience` — список игроков, которым положено их видеть (null — всем).
alter table messages alter column player_id drop not null;
alter table messages add column audience uuid[];
