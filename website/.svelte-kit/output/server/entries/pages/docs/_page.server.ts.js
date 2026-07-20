import { p as base } from "../../../chunks/internal.js";
import "../../../chunks/paths.js";
import { t as getDefaultDoc } from "../../../chunks/docs.js";
import { t as getDocContent } from "../../../chunks/loader.js";
//#region src/routes/docs/+page.server.ts
function fixLinks(html) {
	return html.replace(/href="\/docs\//g, `href="${base}/docs/`);
}
var load = () => {
	const page = getDefaultDoc();
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
export { load };
