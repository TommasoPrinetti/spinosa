import { BoxRenderable, InputRenderable, TextRenderable } from "@opentui/core";
import type { TuiAgentAdapter } from "../types";

const adapter: TuiAgentAdapter = {
  name: "portable-example",
  launch({ setup }) {
    const box = new BoxRenderable(setup.renderer, {
      id: "portable-app",
      width: "100%",
      height: "100%",
      flexDirection: "column",
    });
    const title = new TextRenderable(setup.renderer, {
      id: "portable-title",
      content: "Portable TUI",
      height: 1,
    });
    const input = new InputRenderable(setup.renderer, {
      id: "portable-input",
      placeholder: "Type here",
      width: "100%",
    });
    box.add(title);
    box.add(input);
    setup.renderer.root.add(box);
    input.focus();
    return {
      inspect: () => ({
        route: "demo",
        dialog: { open: false, depth: 0, size: "medium" },
        state: { ready: true, sessionCount: 0 },
      }),
      dispose() {},
    };
  },
};

export default adapter;
