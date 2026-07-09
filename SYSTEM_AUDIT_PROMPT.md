# Spinosa — system audit

~/spinosa — you optimize

## The setup

A framework + TUI in one repo. Two branches (beta, main). Ships `install.sh` → `curl | bash`.

| what | how | lines |
|------|-----|-------|
| `install.sh` | self-contained bash installer | 1482 |
| `workspace-template/.bin/spinosa` | launcher (TUI, upgrade, uninstall) | 148 |
| `packages/tui/src/` | TUI (SolidJS + OpenTUI) | ~15k |
| `packages/tui/src/spinosa-core/` | framework logic (upgrade, update, discovery) | ~2k |
| `packages/opencode/src/` | forked TUI engine | ~lots |
| `script/release.sh` | GitHub release publisher | 92 |

Everything works. Nothing is clean.

## The ask

Read the whole repo below. Then tell me:

1. **What dies first.** Dead args, dead branches, dead code paths. Every line that runs but does nothing.
2. **What's too much.** A 1482-line installer. A launcher that forks a TUI to check the version. Abstractions that abstract nothing.
3. **What breaks silently.** Error paths that log to a file nobody reads. Catch blocks that return `undefined` and pretend nothing happened.
4. **What's wrong.** The SolidJS anti-patterns we already found — plus the ones we didn't.
5. **What's over-engineered.** A five-phase update workflow for a template manifest. Checksum tracking. Copy-on-write semantics for config files that never change.
6. **What's duplicated.** The same logic across install.sh, spinosa-core/commands/upgrade.ts, and the TUI home page — three ways to check a version.
7. **What the standard lib does.** Platform APIs we reimplemented. `cp` we scripted. JSON we parsed by hand.
8. **Where one line replaces fifty.** The candidate.

## The rules

- Stdlib over code.
- Native over dep.
- One line over ten.
- If it compiles without it, it doesn't go in.
- If you've never seen the error, the handler is noise.
- A comment explaining what the code does = the code should say it.
- A function nobody calls = a line you delete.

## The tone

Be wrong less. Be short first. Ponytail it.

## The target

Output: a flat list, file:line:issue, sorted by impact. Header for each file. No essays.
