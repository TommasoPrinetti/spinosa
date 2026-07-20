import { marked } from 'marked';
import type { DocPage, DocPageData, DocSection } from './docs';

const mdModules = import.meta.glob('./content/**/*.md', {
	query: '?raw',
	import: 'default',
	eager: true
}) as Record<string, string>;

export function getDocContent(page: DocPage): Pick<DocPageData, 'intro' | 'sections'> {
	const key = getMarkdownModuleKey(page.sourcePath);
	const raw = mdModules[key];

	if (!raw) {
		throw new Error(
			`Missing docs markdown for "${page.slug}" at "src/lib/docs/content/${normalizeSourcePath(page.sourcePath)}"`
		);
	}

	return parseMarkdown(raw);
}

function getMarkdownModuleKey(sourcePath: string) {
	return `./content/${normalizeSourcePath(sourcePath)}`;
}

function normalizeSourcePath(sourcePath: string) {
	return sourcePath.replace(/^\.?\//, '').replace(/^content\//, '');
}

function parseMarkdown(md: string): Pick<DocPageData, 'intro' | 'sections'> {
	const tokens = marked.lexer(md);
	const introTokens: string[] = [];
	const sections: DocSection[] = [];
	const sectionSlugCounts = new Map<string, number>();

	let currentHeading: string | null = null;
	let currentLevel = 2;
	let currentContent: string[] = [];

	function flushSection() {
		if (!currentHeading) {
			return;
		}

		sections.push({
			id: createSectionId(currentHeading, sectionSlugCounts),
			heading: currentHeading,
			level: currentLevel,
			content: marked.parse(currentContent.join('\n')) as string
		});

		currentHeading = null;
		currentContent = [];
	}

	for (const token of tokens) {
		if (token.type === 'space') {
			continue;
		}

		if (token.type === 'heading') {
			if (token.depth === 1) {
				continue;
			}

			flushSection();
			currentHeading = token.text;
			currentLevel = token.depth;
			currentContent = [];
			continue;
		}

		if (currentHeading) {
			currentContent.push(token.raw);
			continue;
		}

		introTokens.push(token.raw);
	}

	flushSection();

	return {
		intro: marked.parse(introTokens.join('\n')) as string,
		sections
	};
}

function createSectionId(heading: string, sectionSlugCounts: Map<string, number>) {
	const baseId =
		heading
			.toLowerCase()
			.replace(/[^\p{L}\p{N}]+/gu, '-')
			.replace(/^-+|-+$/g, '') || 'section';
	const count = (sectionSlugCounts.get(baseId) ?? 0) + 1;

	sectionSlugCounts.set(baseId, count);

	return count === 1 ? baseId : `${baseId}-${count}`;
}
