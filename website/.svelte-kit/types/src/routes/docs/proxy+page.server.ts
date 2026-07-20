// @ts-nocheck
import { base } from '$app/paths';
import { getDefaultDoc } from '$lib/docs/docs';
import { getDocContent } from '$lib/docs/loader';
import type { PageServerLoad } from './$types';

function fixLinks(html: string): string {
	return html.replace(/href="\/docs\//g, `href="${base}/docs/`);
}

export const load = () => {
	const page = getDefaultDoc();
	const content = getDocContent(page);

	return {
		doc: {
			...page,
			intro: fixLinks(content.intro),
			sections: content.sections.map((s) => ({ ...s, content: fixLinks(s.content) }))
		}
	};
};
;null as any as PageServerLoad;