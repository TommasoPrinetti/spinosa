# spinosa-website

A SvelteKit project for the Spinosa documentation and landing page. Built with SvelteKit 5, Tailwind CSS v4, and the static adapter.

## Setup

```sh
bun install
```

## Development

```sh
bun dev          # Start the dev server
```

## Build

```sh
bun build        # Build for production -> website/build/
bun run preview  # Preview the production build
```

## Quality checks

```sh
bun run lint     # Check code style with prettier
bun run check    # Typecheck with svelte-check
```

Run `lint` before `check`.

## Deployment

The site deploys to GitHub Pages when you push to `beta` or `main`.

Site URL: `https://medialab.github.io/spinosa/`
