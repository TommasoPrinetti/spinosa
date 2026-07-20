const GITHUB_REPO = 'TommasoPrinetti/spinosa';

export type GhRelease = {
	tag_name: string;
	prerelease: boolean;
	draft: boolean;
};

export async function fetchReleases(fetchFn: typeof fetch = fetch): Promise<GhRelease[]> {
	const res = await fetchFn(`https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=30`, {
		headers: { Accept: 'application/vnd.github+json' }
	});
	if (!res.ok) {
		throw new Error(`GitHub releases API returned ${res.status}`);
	}
	return (await res.json()) as GhRelease[];
}

export function installScriptUrl(tag: string): string {
	const normalized = tag.startsWith('v') ? tag : `v${tag}`;
	return `https://github.com/${GITHUB_REPO}/releases/download/${normalized}/install.sh`;
}

export const STABLE_INSTALL_REDIRECT = `https://github.com/${GITHUB_REPO}/releases/latest/download/install.sh`;

export function latestPrereleaseInstallUrl(releases: GhRelease[]): string | null {
	const hit = releases.find((r) => r.prerelease && !r.draft);
	return hit ? installScriptUrl(hit.tag_name) : null;
}
