# Prompt Routing Split

Map the prompt to one route.

| Route | When |
|---|---|
| `fast_path` | Operational answer, no source search or orchestrated artifact chain |
| `non-fast-path` | Any source-grounded, verification, maintenance, cleanup, indexing, or synthesis request that needs an orchestrated artifact chain |
