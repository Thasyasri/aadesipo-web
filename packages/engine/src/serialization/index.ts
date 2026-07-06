import type { GameState } from "../core/types.js";

/**
 * Bump this whenever GameState's shape changes in a way that breaks old
 * saves. `deserializeState` is the one place a future migration function
 * gets inserted. Nothing else in the engine needs to know saves can be old.
 */
export const STATE_SCHEMA_VERSION = 1;

interface StateEnvelope {
  readonly version: number;
  readonly state: GameState;
}

export function serializeState(state: GameState): string {
  const envelope: StateEnvelope = { version: STATE_SCHEMA_VERSION, state };
  return JSON.stringify(envelope);
}

export function deserializeState(json: string): GameState {
  const envelope = JSON.parse(json) as StateEnvelope;

  if (envelope.version !== STATE_SCHEMA_VERSION) {
    throw new Error(
      `deserializeState: envelope version ${envelope.version} does not match current ` +
        `${STATE_SCHEMA_VERSION}. Add a migration here once the schema actually changes ` +
        "— there's nothing to migrate from yet.",
    );
  }

  return envelope.state;
}
