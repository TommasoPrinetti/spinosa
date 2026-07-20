import { p as base } from "../../../../chunks/internal.js";
import "../../../../chunks/paths.js";
import { n as getDocBySlug, r as getDocPages } from "../../../../chunks/docs.js";
import { t as getDocContent } from "../../../../chunks/loader.js";
import { error } from "@sveltejs/kit";
//#region src/routes/docs/[slug]/+page.server.ts
function fixLinks(html) {
	return html.replace(/href="\/docs\//g, `href="${base}/docs/`);
}
var entries = (() => {
	return getDocPages().map((doc) => ({ slug: doc.slug }));
});
var load = ({ params }) => {
	const page = getDocBySlug(params.slug);
	if (!page) error(404, `Unknown doc slug "${params.slug}"`);
	const content = getDocContent(page);
	return { doc: {
		...page,
		intro: fixLinks(content.intro),
		sections: content.sections.map((s) => ({
			...s,
			content: fixLinks(s.content)
		}))
	} };
};
//#endregion
export { entries, load };
