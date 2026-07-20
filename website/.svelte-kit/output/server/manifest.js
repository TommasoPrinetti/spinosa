export const manifest = (() => {
function __memo(fn) {
	let value;
	return () => value ??= (value = fn());
}

return {
	appDir: "_app",
	appPath: "spinosa/_app",
	assets: new Set(["favicon.ico","og-image.jpg","robots.txt"]),
	mimeTypes: {".jpg":"image/jpeg",".txt":"text/plain"},
	_: {
		client: {start:"_app/immutable/entry/start.DzzqHN9m.js",app:"_app/immutable/entry/app.DE3wEOA5.js",imports:["_app/immutable/entry/start.DzzqHN9m.js","_app/immutable/chunks/CwF_PFZf.js","_app/immutable/chunks/CymRgjIC.js","_app/immutable/chunks/B0JiTRQd.js","_app/immutable/chunks/DK3Fl9T5.js","_app/immutable/entry/app.DE3wEOA5.js","_app/immutable/chunks/kNaey6uv.js","_app/immutable/chunks/B0JiTRQd.js","_app/immutable/chunks/DK3Fl9T5.js","_app/immutable/chunks/xihTtKlq.js"],stylesheets:[],fonts:[],uses_env_dynamic_public:false},
		nodes: [
			__memo(() => import('./nodes/0.js')),
			__memo(() => import('./nodes/1.js'))
		],
		remotes: {
			
		},
		routes: [
			
		],
		prerendered_routes: new Set(["/spinosa/","/spinosa/casestudies","/spinosa/docs","/spinosa/docs/__data.json","/spinosa/install","/spinosa/install/dev","/spinosa/docs/welcome","/spinosa/docs/welcome/__data.json","/spinosa/docs/tour","/spinosa/docs/tour/__data.json","/spinosa/docs/agents","/spinosa/docs/agents/__data.json","/spinosa/docs/corpus","/spinosa/docs/corpus/__data.json","/spinosa/docs/reports","/spinosa/docs/reports/__data.json","/spinosa/docs/cli-reference","/spinosa/docs/cli-reference/__data.json","/spinosa/docs/glossary","/spinosa/docs/glossary/__data.json","/spinosa/docs/faq","/spinosa/docs/faq/__data.json"]),
		matchers: async () => {
			
			return {  };
		},
		server_assets: {}
	}
}
})();
