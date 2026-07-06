-- Online parity: let a room carry the full house-rules config alongside its
-- mode. `mode` (text) already exists on rooms; house_rules is the JSON blob of
-- the engine's HouseRules object. Null means "engine defaults" (classic rules).
alter table rooms add column if not exists house_rules jsonb;
