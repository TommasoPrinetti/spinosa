import { redirect } from '@sveltejs/kit';
import { BETA_INSTALL_REDIRECT } from '$lib/github-releases';

export const prerender = true;

// No stable cut exists yet (see docs/release/stable-promotion-gates.md);
// point users at the live beta channel until the first stable release.
export const load = () => redirect(302, BETA_INSTALL_REDIRECT);
