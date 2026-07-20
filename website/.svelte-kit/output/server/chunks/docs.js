//#region src/lib/docs/docs.ts
var docRegistry = [
	{
		title: "Welcome",
		slug: "welcome",
		description: "Turn your documents into a searchable workspace where AI agents find evidence, write reports, and verify every claim against your original files.",
		sourcePath: "get-started/welcome.md",
		groupId: "get-started",
		groupTitle: "Get Started",
		groupOrder: 10,
		pageOrder: 10,
		isDefault: true
	},
	{
		title: "Tour",
		slug: "tour",
		description: "A 10-minute walkthrough from install to your first verified report. No technical background needed.",
		sourcePath: "get-started/tour.md",
		groupId: "get-started",
		groupTitle: "Get Started",
		groupOrder: 10,
		pageOrder: 20
	},
	{
		title: "Agents & Pipeline",
		slug: "agents",
		description: "How the 7 specialized sub-agents work and how the orchestrator dispatches them.",
		sourcePath: "concepts/agents.md",
		groupId: "concepts",
		groupTitle: "Concepts",
		groupOrder: 20,
		pageOrder: 10
	},
	{
		title: "Corpus Structure",
		slug: "corpus",
		description: "Workspace layout, configuration settings, and the startup protocol.",
		sourcePath: "concepts/corpus.md",
		groupId: "concepts",
		groupTitle: "Concepts",
		groupOrder: 20,
		pageOrder: 20
	},
	{
		title: "Reports & Charts",
		slug: "reports",
		description: "Report format, verification badges, and how to read Unicode charts.",
		sourcePath: "concepts/reports.md",
		groupId: "concepts",
		groupTitle: "Concepts",
		groupOrder: 20,
		pageOrder: 30
	},
	{
		title: "CLI Reference",
		slug: "cli-reference",
		description: "Complete command reference for every spinosa subcommand and flag.",
		sourcePath: "reference/cli-reference.md",
		groupId: "reference",
		groupTitle: "Reference",
		groupOrder: 30,
		pageOrder: 10
	},
	{
		title: "Glossary",
		slug: "glossary",
		description: "Plain-English definitions of terms you'll encounter in Spinosa.",
		sourcePath: "reference/glossary.md",
		groupId: "reference",
		groupTitle: "Reference",
		groupOrder: 30,
		pageOrder: 20
	},
	{
		title: "FAQ",
		slug: "faq",
		description: "Common questions about setup, usage, reports, and troubleshooting.",
		sourcePath: "support/faq.md",
		groupId: "support",
		groupTitle: "Support",
		groupOrder: 40,
		pageOrder: 10
	}
];
var collator = new Intl.Collator("en", { numeric: true });
var docsByPageOrder = [...docRegistry].sort((left, right) => {
	if (left.groupOrder !== right.groupOrder) return left.groupOrder - right.groupOrder;
	if (left.pageOrder !== right.pageOrder) return left.pageOrder - right.pageOrder;
	return collator.compare(left.title, right.title);
});
var docBySlug = /* @__PURE__ */ new Map();
var docBySourcePath = /* @__PURE__ */ new Map();
var groupDefinitions = /* @__PURE__ */ new Map();
var defaultDocPage = null;
for (const page of docsByPageOrder) {
	const groupDefinition = groupDefinitions.get(page.groupId);
	if (groupDefinition) {
		if (groupDefinition.title !== page.groupTitle || groupDefinition.order !== page.groupOrder) throw new Error(`Doc group "${page.groupId}" has conflicting manifest metadata`);
	} else groupDefinitions.set(page.groupId, {
		title: page.groupTitle,
		order: page.groupOrder
	});
	if (docBySlug.has(page.slug)) throw new Error(`Duplicate doc slug "${page.slug}" in docs registry`);
	if (docBySourcePath.has(page.sourcePath)) throw new Error(`Duplicate doc sourcePath "${page.sourcePath}" in docs registry`);
	docBySlug.set(page.slug, page);
	docBySourcePath.set(page.sourcePath, page);
	if (page.isDefault) {
		if (defaultDocPage) throw new Error(`Multiple docs are marked as the default page`);
		defaultDocPage = page;
	}
}
if (!defaultDocPage) throw new Error(`No doc is marked as the default page`);
Array.from(docsByPageOrder.reduce((groups, page) => {
	const group = groups.get(page.groupId);
	if (group) {
		group.pages.push(page);
		return groups;
	}
	groups.set(page.groupId, {
		id: page.groupId,
		title: page.groupTitle,
		pages: [page]
	});
	return groups;
}, /* @__PURE__ */ new Map())).map(([, group]) => group);
function getDocBySlug(slug) {
	return docBySlug.get(slug);
}
function getDefaultDoc() {
	return defaultDocPage;
}
function getDocPages() {
	return docsByPageOrder;
}
//#endregion
export { getDocBySlug as n, getDocPages as r, getDefaultDoc as t };
