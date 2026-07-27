import { AgentV2 } from "@spinosa/kernel-core/agent"
import { AISDK } from "@spinosa/kernel-core/aisdk"
import { Catalog } from "@spinosa/kernel-core/catalog"
import { CommandV2 } from "@spinosa/kernel-core/command"
import { Credential } from "@spinosa/kernel-core/credential"
import { AppNodeBuilder } from "@spinosa/kernel-core/effect/app-node-builder"
import { LayerNodePlatform } from "@spinosa/kernel-core/effect/app-node-platform"
import { LayerNode } from "@spinosa/kernel-core/effect/layer-node"
import { EventV2 } from "@spinosa/kernel-core/event"
import { FileSystem } from "@spinosa/kernel-core/filesystem"
import { FSUtil } from "@spinosa/kernel-core/fs-util"
import { Integration } from "@spinosa/kernel-core/integration"
import { Location } from "@spinosa/kernel-core/location"
import { Npm } from "@spinosa/kernel-core/npm"
import { PluginV2 } from "@spinosa/kernel-core/plugin"
import { Reference } from "@spinosa/kernel-core/reference"
import { SkillV2 } from "@spinosa/kernel-core/skill"
import { Effect, Layer } from "effect"
import { tempLocationLayer } from "../fixture/location"

const npmLayer = Layer.succeed(
  Npm.Service,
  Npm.Service.of({
    add: () => Effect.succeed({ directory: "", entrypoint: undefined }),
    install: () => Effect.void,
    which: () => Effect.succeed(undefined),
  }),
)

export const PluginTestLayer = AppNodeBuilder.build(
  LayerNode.group([
    FileSystem.node,
    FSUtil.node,
    Location.node,
    Npm.node,
    Credential.node,
    EventV2.node,
    LayerNodePlatform.httpClient,
    PluginV2.node,
    AgentV2.node,
    AISDK.node,
    Catalog.node,
    CommandV2.node,
    Integration.node,
    Reference.node,
    SkillV2.node,
  ]),
  [
    [Location.node, tempLocationLayer],
    [Npm.node, npmLayer],
  ],
)
