import { expect } from "bun:test"
import { LayerNode } from "@spinosa/kernel-core/effect/layer-node"
import { FSUtil } from "@spinosa/kernel-core/fs-util"
import { Effect } from "effect"
import { testEffect } from "../lib/effect"
import { ProviderV2 } from "@spinosa/kernel-core/provider"
import { Auth } from "@/auth"
import { Config } from "@/config/config"
import { Env } from "@/env"
import { Plugin } from "@/plugin"
import { Provider } from "@/provider/provider"
import { ModelsDev } from "@spinosa/kernel-core/models-dev"
import { RuntimeFlags } from "@/effect/runtime-flags"

const it = testEffect(
  LayerNode.compile(
    LayerNode.group([Provider.node, FSUtil.node, Env.node, Config.node, Auth.node, Plugin.node, ModelsDev.node, RuntimeFlags.node]),
    [[RuntimeFlags.node, RuntimeFlags.layer({})]],
  ),
)

it.effect("reloads without an active workspace", () => Provider.use.reload())

it.instance("reloads providers after credentials are added", () =>
  Effect.gen(function* () {
    const previous = process.env.SPINOSA_AUTH_CONTENT
    const providerID = ProviderV2.ID.make("opencode-go")
    const provider = yield* Provider.Service

    try {
      process.env.SPINOSA_AUTH_CONTENT = "{}"
      expect((yield* provider.list())[providerID]).toBeUndefined()

      process.env.SPINOSA_AUTH_CONTENT = JSON.stringify({ "opencode-go": { type: "api", key: "test-key" } })
      yield* provider.reload()

      const active = (yield* provider.list())[providerID]
      expect(active).toBeDefined()
      expect(active.models["deepseek-v4-flash"]).toBeDefined()
    } finally {
      if (previous === undefined) delete process.env.SPINOSA_AUTH_CONTENT
      else process.env.SPINOSA_AUTH_CONTENT = previous
    }
  }),
)
