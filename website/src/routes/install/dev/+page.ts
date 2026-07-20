import { error, redirect } from '@sveltejs/kit';
import { fetchReleases, latestPrereleaseInstallUrl } from '$lib/github-releases';

export const prerender = true;

export const load = async () => {
	let releases;
	try {
		releases = await fetchReleases(fetch);
	} catch {
		throw error(502, 'Could not reach GitHub releases API');
	}

	const url = latestPrereleaseInstallUrl(releases);
	if (!url) {
		throw error(404, 'No dev (prerelease) release published yet');
	}

	redirect(302, url);
};
