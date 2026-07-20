import { n as fetchReleases, r as latestPrereleaseInstallUrl } from "../../../../chunks/github-releases.js";
import { error, redirect } from "@sveltejs/kit";
//#region src/routes/install/dev/+page.ts
var prerender = true;
var load = async () => {
	let releases;
	try {
		releases = await fetchReleases(fetch);
	} catch {
		throw error(502, "Could not reach GitHub releases API");
	}
	const url = latestPrereleaseInstallUrl(releases);
	if (!url) throw error(404, "No dev (prerelease) release published yet");
	redirect(302, url);
};
//#endregion
export { load, prerender };
