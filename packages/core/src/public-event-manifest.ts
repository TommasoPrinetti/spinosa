export * as PublicEventManifest from "./public-event-manifest"

import { Event } from "@spinosa/schema/event"
import { EventManifest } from "@spinosa/schema/event-manifest"

export const Definitions = EventManifest.ServerDefinitions
export const Latest = Event.latest(Definitions)
