# spinosa-website

SvelteKit 5 + Tailwind CSS v4 + static adapter (GitHub Pages).

## Commands

```sh
bun dev          # dev server (vite dev)
bun build        # production build (vite build) -> website/build/
bun run preview  # preview production build
bun run check    # typecheck (svelte-check) — run after lint, before commit
bun run lint     # prettier --check .
bun run format   # prettier --write .
bun run prepare  # auto-runs svelte-kit sync (postinstall hook)
```

Order: `lint` then `check`. No test framework.

## Architecture

- **Adapter config** is in `svelte.config.js` (static adapter, base path `/spinosa`)
- **Vite config** is in `vite.config.ts`
- **Runes mode** is forced in vite config (`runes: true` for project files, not node_modules)
- **`$lib`** maps to `src/lib/`
- **Tailwind CSS v4** uses `@tailwindcss/vite` plugin + `@import 'tailwindcss'` in `layout.css`
- **Custom theme tokens** are in `layout.css` `@theme`: `washed-clay`, `warm-limestone`, `basalt`, `olive-grove`, `sun-cured-terracotta`
- **Inter Tight** is loaded from Google Fonts in `app.html`

## Deployment

Auto-deployed to GitHub Pages on push to `beta` or `main`. The workflow file is `.github/workflows/deploy-website.yml`.

Site URL: `https://medialab.github.io/spinosa/`
