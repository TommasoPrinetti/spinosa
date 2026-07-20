//#region src/lib/github-releases.ts
var GITHUB_REPO = "TommasoPrinetti/spinosa";
async function fetchReleases(fetchFn = fetch) {
	const res = await fetchFn(`https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=30`, { headers: { Accept: "application/vnd.github+json" } });
	if (!res.ok) throw new Error(`GitHub releases API returned ${res.status}`);
	return await res.json();
}
function installScriptUrl(tag) {
	return `https://github.com/${GITHUB_REPO}/releases/download/${tag.startsWith("v") ? tag : `v${tag}`}/install.sh`;
}
var STABLE_INSTALL_REDIRECT = `https://github.com/${GITHUB_REPO}/releases/latest/download/install.sh`;
function latestPrereleaseInstallUrl(releases) {
	const hit = releases.find((r) => r.prerelease && !r.draft);
	return hit ? installScriptUrl(hit.tag_name) : null;
}
//#endregion
export { fetchReleases as n, latestPrereleaseInstallUrl as r, STABLE_INSTALL_REDIRECT as t };
