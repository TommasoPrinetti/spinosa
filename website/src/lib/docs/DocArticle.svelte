<script lang="ts">
	import { base } from '$app/paths';
	import type { DocPageData } from '$lib/docs/docs';

	let { doc }: { doc: DocPageData } = $props();
</script>

<article class="px-4 md:px-8">
	<div
		class="w-full text-neutral-300 text-sm flex flex-row items-center gap-1 whitespace-nowrap [&>*]:my-0"
	>
		<a href={base + '/'} class="hover:text-black">Home</a>
		<span>/</span>
		<a href={base + '/docs'} class="hover:text-black">Docs</a>
		<span>/</span>
		<span>{doc.title}</span>
	</div>
	<h1>{doc.title}</h1>
	{#if doc.description}
		<p>{doc.description}</p>
	{/if}
	{#if doc.intro}
		<div>{@html doc.intro}</div>
	{/if}
	{#each doc.sections ?? [] as section (section.id)}
		<svelte:element this={'h' + section.level} id={section.id}>
			{section.heading}
		</svelte:element>
		<div>{@html section.content}</div>
	{/each}
</article>
