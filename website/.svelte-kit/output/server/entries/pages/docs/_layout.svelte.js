import { p as base } from "../../../chunks/internal.js";
import { H as attr, U as escape_html, d as unsubscribe_stores, l as store_get, n as attr_class, o as ensure_array_like, r as attr_style, u as stringify } from "../../../chunks/dev.js";
import "../../../chunks/paths.js";
import { t as afterNavigate } from "../../../chunks/client.js";
import { t as page } from "../../../chunks/stores.js";
import { r as getDocPages, t as getDefaultDoc } from "../../../chunks/docs.js";
import { n as stableInstallCmd, t as github_default } from "../../../chunks/github.js";
//#region src/lib/assets/docs_footer.png
var docs_footer_default = "/spinosa/_app/immutable/assets/docs_footer.CYeMGm3a.png";
//#endregion
//#region src/routes/docs/+layout.svelte
function _layout($$renderer, $$props) {
	$$renderer.component(($$renderer) => {
		var $$store_subs;
		let { children } = $$props;
		afterNavigate(() => {
			window.scrollTo(0, 0);
		});
		const CMD = stableInstallCmd();
		const docPages = getDocPages();
		const defaultSlug = getDefaultDoc()?.slug;
		function normalizePath(pathname) {
			const p = pathname.startsWith(base) ? pathname.slice(base.length) : pathname;
			return p.length > 1 ? p.replace(/\/$/, "") : p;
		}
		function getDocHref(slug) {
			return slug === defaultSlug ? base + "/docs" : base + `/docs/${slug}`;
		}
		function isActiveDoc(pathname, slug) {
			const normalizedPath = normalizePath(pathname);
			const docPath = `/docs/${slug}`;
			if (slug === defaultSlug) return normalizedPath === "/docs" || normalizedPath === docPath;
			return normalizedPath === docPath;
		}
		$$renderer.push(`<header class="bg-white absolute top-0 left-0 right-0 z-20 w-full h-10 border-b border-neutral-200 grid grid-cols-2 md:grid-cols-3 px-4 md:px-8 items-center"><a${attr("href", base + "/")} class="hover:underline underline-offset-2"><p>spinosa</p></a> <div class="relative hidden md:flex items-center justify-self-center"><button class="flex cursor-pointer items-center rounded-md bg-black px-2 py-0.5 text-white" aria-label="Copy install command"><p class="text-[0.65rem] leading-normal text-nowrap">${escape_html(CMD)}</p></button> `);
		$$renderer.push("<!--[-1-->");
		$$renderer.push(`<!--]--></div> <a href="https://github.com/TommasoPrinetti/spinosa" target="_blank" rel="noreferrer" class="justify-self-end w-4 h-4"><img${attr("src", github_default)} alt="GitHub" class="h-full w-full"/></a></header> <section class="grid grid-cols-1 md:grid-cols-[1fr_2fr_1fr] mt-10 h-full min-h-dvh relative"><div class="hidden md:block px-8 py-8 min-w-0"><div class="sticky top-10 flex flex-col gap-1"><!--[-->`);
		const each_array = ensure_array_like(docPages);
		for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
			let docPage = each_array[$$index];
			const active = isActiveDoc(store_get($$store_subs ??= {}, "$page", page).url.pathname, docPage.slug);
			$$renderer.push(`<a${attr("href", getDocHref(docPage.slug))}${attr_class("group flex gap-1 rounded-sm px-2 py-1 text-sm transition-all duration-125 ease-in-out hover:text-black", void 0, {
				"bg-neutral-100": active,
				"text-black": active,
				"text-neutral-300": !active
			})}><span${attr_class("opacity-0 transition-opacity duration-125 group-hover:opacity-100", void 0, { "opacity-100": active })}>→</span> ${escape_html(docPage.title)}</a>`);
		}
		$$renderer.push(`<!--]--></div></div> <div class="pt-8 border-x border-neutral-200 flex flex-col min-h-dvh relative min-w-0">`);
		children($$renderer);
		$$renderer.push(`<!----> <div class="mt-auto w-full"><img${attr("src", docs_footer_default)} alt="" class="w-full"/></div></div> <div class="hidden md:block px-8 py-8 min-w-0"><div class="sticky top-10">`);
		if (store_get($$store_subs ??= {}, "$page", page).data?.doc?.sections?.length) {
			$$renderer.push("<!--[0-->");
			$$renderer.push(`<!--[-->`);
			const each_array_1 = ensure_array_like(store_get($$store_subs ??= {}, "$page", page).data.doc.sections);
			for (let $$index_1 = 0, $$length = each_array_1.length; $$index_1 < $$length; $$index_1++) {
				let section = each_array_1[$$index_1];
				$$renderer.push(`<a${attr("href", `#${stringify(section.id)}`)} class="flex gap-1 py-1.5 text-sm text-neutral-300 hover:text-black! hover:pl-4 hover:underline underline-offset-2 decoration-neutral-300 transition-all duration-125 ease-in-out"${attr_style(`padding-left: ${section.level > 2 ? "1rem" : "0"}`)}><p>${escape_html(section.heading)}</p></a>`);
			}
			$$renderer.push(`<!--]-->`);
		} else {
			$$renderer.push("<!--[-1-->");
			$$renderer.push(`<p class="text-neutral-300 text-sm">Select a page</p>`);
		}
		$$renderer.push(`<!--]--></div></div> <div class="fixed left-6 bottom-6 w-5 aspect-square"><img${attr("src", github_default)} alt=""/></div></section>`);
		if ($$store_subs) unsubscribe_stores($$store_subs);
	});
}
//#endregion
export { _layout as default };
