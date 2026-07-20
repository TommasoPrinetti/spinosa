<script lang="ts">
	import { page } from '$app/stores';
	import DocArticle from '$lib/docs/DocArticle.svelte';
</script>

<DocArticle doc={$page.data.doc} />
