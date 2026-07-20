interface Particle {
	ox: number;
	oy: number;
}

export class ParticleSystem {
	private readonly canvas: HTMLCanvasElement;
	private readonly ctx: CanvasRenderingContext2D;
	private bgCanvas: HTMLCanvasElement | null = null;
	private particles: Particle[] = [];
	private mx = -10000;
	private my = -10000;
	private rafId = 0;
	private scaleX = 1;
	private scaleY = 1;
	private svgW = 0;
	private svgH = 0;
	private running = false;

	private readonly RADIUS = 120;
	private readonly MAX_SCALE = 4;
	private readonly STRIDE = 3;

	constructor(canvas: HTMLCanvasElement) {
		this.canvas = canvas;
		this.ctx = canvas.getContext('2d')!;
	}

	async init(url: string) {
		const img = await new Promise<HTMLImageElement>((resolve, reject) => {
			const i = new Image();
			i.onload = () => resolve(i);
			i.onerror = reject;
			i.src = url;
		});

		this.svgW = img.naturalWidth;
		this.svgH = img.naturalHeight;

		// Pre-render SVG to an offscreen canvas at high quality
		const renderW = 1920;
		const renderH = Math.round((renderW / this.svgW) * this.svgH);
		this.bgCanvas = document.createElement('canvas');
		this.bgCanvas.width = renderW;
		this.bgCanvas.height = renderH;
		const bgCtx = this.bgCanvas.getContext('2d')!;
		bgCtx.drawImage(img, 0, 0, renderW, renderH);

		// Scan for dot positions
		const scanW = Math.round(this.svgW * 0.25);
		const scanH = Math.round(this.svgH * 0.25);
		const off = document.createElement('canvas');
		off.width = scanW;
		off.height = scanH;
		const octx = off.getContext('2d')!;
		octx.drawImage(img, 0, 0, scanW, scanH);

		const data = octx.getImageData(0, 0, scanW, scanH).data;

		for (let y = 0; y < scanH; y += this.STRIDE) {
			for (let x = 0; x < scanW; x += this.STRIDE) {
				const i = (y * scanW + x) * 4;
				if (data[i] < 80) {
					this.particles.push({
						ox: (x / scanW) * this.svgW,
						oy: (y / scanH) * this.svgH
					});
				}
			}
		}

		this.resize();
		this.start();
	}

	resize() {
		this.canvas.width = window.innerWidth;
		this.canvas.height = window.innerHeight;
		this.scaleX = this.canvas.width / this.svgW;
		this.scaleY = this.canvas.height / this.svgH;
	}

	move(x: number, y: number) {
		this.mx = x;
		this.my = y;
	}

	leave() {
		this.mx = -10000;
		this.my = -10000;
	}

	start() {
		if (this.running) return;
		this.running = true;
		this.tick();
	}

	stop() {
		this.running = false;
		if (this.rafId) cancelAnimationFrame(this.rafId);
	}

	get particleCount() {
		return this.particles.length;
	}

	private tick = () => {
		if (!this.running) return;
		this.render();
		this.rafId = requestAnimationFrame(this.tick);
	};

	private render() {
		const ctx = this.ctx;
		const { width, height } = this.canvas;
		const mx = this.mx;
		const my = this.my;

		ctx.clearRect(0, 0, width, height);

		// White background
		ctx.fillStyle = '#fff';
		ctx.fillRect(0, 0, width, height);

		// Draw cached SVG as crisp background
		if (this.bgCanvas) {
			ctx.imageSmoothingEnabled = false;
			ctx.drawImage(this.bgCanvas, 0, 0, width, height);
			ctx.imageSmoothingEnabled = true;
		}

		// Scale up dots near the mouse
		const sx = this.scaleX;
		const sy = this.scaleY;
		const baseW = Math.max(1, Math.round(sx * 2));
		const baseH = Math.max(1, Math.round(sy * 2));
		const r2 = this.RADIUS * this.RADIUS;
		const maxScale = this.MAX_SCALE;

		ctx.fillStyle = '#000';

		for (const p of this.particles) {
			const px = p.ox * sx;
			const py = p.oy * sy;
			const dx = px - mx;
			const dy = py - my;

			if (dx * dx + dy * dy < r2) {
				const dist = Math.sqrt(dx * dx + dy * dy);
				const t = 1 - dist / this.RADIUS;
				const scale = 1 + t * (maxScale - 1);

				const dotW = Math.round(baseW * scale);
				const dotH = Math.round(baseH * scale);

				// Erase original with white
				ctx.fillStyle = '#fff';
				ctx.fillRect(Math.round(px) - 1, Math.round(py) - 1, baseW + 2, baseH + 2);

				// Draw enlarged dot centered on original position
				const cx = Math.round(px - dotW / 2);
				const cy = Math.round(py - dotH / 2);
				ctx.fillStyle = '#000';
				ctx.fillRect(cx, cy, dotW, dotH);
			}
		}
	}
}
