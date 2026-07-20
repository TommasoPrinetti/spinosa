import { p as base } from "./internal.js";
import { H as attr, U as escape_html, a as element, f as html, o as ensure_array_like } from "./dev.js";
import "./paths.js";
//#region src/lib/docs/DocArticle.svelte
function DocArticle($$renderer, $$props) {
	$$renderer.component(($$renderer) => {
		let { doc } = $$props;
		$$renderer.push(`<article class="px-4 md:px-8"><div class="w-full text-neutral-300 text-sm flex flex-row items-center gap-1 whitespace-nowrap [&amp;>*]:my-0"><a${attr("href", base + "/")} class="hover:text-black">Home</a> <span>/</span> <a${attr("href", base + "/docs")} class="hover:text-black">Docs</a> <span>/</span> <span>${escape_html(doc.title)}</span></div> <h1>${escape_html(doc.title)}</h1> `);
		if (doc.description) {
			$$renderer.push("<!--[0-->");
			$$renderer.push(`<p>${escape_html(doc.description)}</p>`);
		} else $$renderer.push("<!--[-1-->");
		$$renderer.push(`<!--]--> `);
		if (doc.intro) {
			$$renderer.push("<!--[0-->");
			$$renderer.push(`<div>${html(doc.intro)}</div>`);
		} else $$renderer.push("<!--[-1-->");
		$$renderer.push(`<!--]--> <!--[-->`);
		const each_array = ensure_array_like(doc.sections ?? []);
		for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
			let section = each_array[$$index];
			element($$renderer, "h" + section.level, () => {
				$$renderer.push(`${attr("id", section.id)}`);
			}, () => {
				$$renderer.push(`${escape_html(section.heading)}`);
			});
			$$renderer.push(` <div>${html(section.content)}</div>`);
		}
		$$renderer.push(`<!--]--></article>`);
	});
}
//#endregion
export { DocArticle as t };
