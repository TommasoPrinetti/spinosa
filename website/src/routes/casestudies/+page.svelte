<script lang="ts">
	import spinosaVisual1 from '$lib/assets/Spinosa/Spinosa_Visuals_02.png';
	import spinosaVisual2 from '$lib/assets/Spinosa/Spinosa_Visuals_04.png';
</script>

<div class="w-full bg-white">
	<section
		class="relative min-h-screen bg-white px-6 py-12 md:px-10 md:py-16 grid grid-cols-1 content-stretch md:grid-cols-3 md:gap-10"
	>
		<div class="flex flex-col justify-center gap-3">
			<div class="inline-block bg-white px-1 py-0.5">
				<h3 class="text-[1.5rem] font-normal leading-[1.2] tracking-[-0.01em] text-basalt">
					Evidence mapping and reconstruction
				</h3>
			</div>
			<div class="inline-block bg-white px-1 py-0.5">
				<p class="text-[0.875rem] leading-[1.5] text-basalt/60">
					From abstract concepts to precise quotes
				</p>
			</div>
			<div class="inline-block bg-white px-1 py-0.5">
				<!--a
					href="/case-studies/evidence-mapping"
					class="mt-1 text-[0.875rem] font-medium text-sun-cured-terracotta transition-opacity hover:opacity-70"
				>
					View case study &rarr;
				</a-->
			</div>
		</div>
		<div class="col-span-2 flex items-center justify-center overflow-hidden rounded-[6px] bg-white">
			<img src={spinosaVisual1} alt="Spinosa visuals" class="h-full w-full object-cover" />
		</div>
	</section>

	<section
		class="relative min-h-screen bg-white px-6 py-12 md:px-10 md:py-16 grid grid-cols-1 content-stretch md:grid-cols-3 md:gap-10"
	>
		<div class="col-span-2 flex items-center justify-center overflow-hidden rounded-[6px] bg-white">
			<img src={spinosaVisual2} alt="Spinosa visuals" class="h-full w-full object-cover" />
		</div>
		<div class="flex flex-col justify-center gap-3">
			<div class="inline-block bg-white px-1 py-0.5">
				<h3 class="text-[1.5rem] font-normal leading-[1.2] tracking-[-0.01em] text-basalt">
					From abstract concepts to precise quotes
				</h3>
			</div>
			<div class="inline-block bg-white px-1 py-0.5">
				<p class="text-[0.875rem] leading-[1.5] text-basalt/60">
					Automated extraction and verification of cited sources across research literature.
				</p>
			</div>
			<div class="inline-block bg-white px-1 py-0.5">
				<!--a
					href="/case-studies/abstract-to-precise"
					class="mt-1 text-[0.875rem] font-medium text-sun-cured-terracotta transition-opacity hover:opacity-70"
				>
					View case study &rarr;
				</a-->
			</div>
		</div>
	</section>

	<footer
		class="relative z-10 w-full border-t border-neutral-200 bg-white flex items-center justify-center px-4 md:px-8 py-4"
	>
		<p class="text-[0.75rem] text-neutral-400 text-center leading-normal">
			spinosa is an open-source project developed at medialab sciencespo
		</p>
	</footer>
</div>
