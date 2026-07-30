import { redirect } from '@sveltejs/kit';
import { BETA_INSTALL_REDIRECT } from '$lib/github-releases';

export const prerender = true;

export const load = () => redirect(302, BETA_INSTALL_REDIRECT);
