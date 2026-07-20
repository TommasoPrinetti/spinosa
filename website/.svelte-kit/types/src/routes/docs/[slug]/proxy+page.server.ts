// @ts-nocheck
import { base } from '$app/paths';
import { error } from '@sveltejs/kit';
import { getDocBySlug, getDocPages } from '$lib/docs/docs';
import { getDocContent } from '$lib/docs/loader';
import type { PageServerLoad } from './$types';

function fixLinks(html: string): string {
	return html.replace(/href="\/docs\//g, `href="${base}/docs/`);
}

export const entries = (() => {
	return getDocPages().map((doc) => ({ slug: doc.slug }));
}) satisfies () => Array<{ slug: string }>;

export const load = ({ params }: Parameters<PageServerLoad>[0]) => {
	const page = getDocBySlug(params.slug);

	if (!page) {
		error(404, `Unknown doc slug "${params.slug}"`);
	}

	const content = getDocContent(page);

	return {
		doc: {
			...page,
			intro: fixLinks(content.intro),
			sections: content.sections.map((s) => ({ ...s, content: fixLinks(s.content) }))
		}
	};
};
