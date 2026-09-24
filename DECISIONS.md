# Decisions

## Aura membership is managed runtime data

An `AuraEmitter` is persistent ECS state attached to any positioned entity. It
defines the spatial source: radius, target relationship, effects, and visual.
The actors currently affected by emitters are derived from positions, teams,
and active emitters. For now, maintain that membership as runtime-managed data
on actors, refreshed by the aura system before other effect consumers run.
This is a managed projection of the current spatial state, not durable or
network-authoritative state. Do not represent it with hierarchy.

`ecs-js` virtuals remain a possible future representation. They offer a clean
derived view, but their per-tick cache requires careful lookup timing and
invalidation when positions or emitters change. Since aura effects are read
for many actors each tick, managed membership is a reasonable fit for the
current system.

Entry/exit behavior needs previous membership to detect transitions. A spatial
index can later optimize membership refresh without changing the domain model.
