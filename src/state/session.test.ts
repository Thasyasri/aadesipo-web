import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The bug this file exists to prevent:
 *
 * `init()` was not idempotent, and StrictMode invokes mount effects twice. Two
 * calls meant two `signInAnonymously()` calls and two different anonymous users.
 * One of them claimed the room seat; the other owned the surviving session. RLS
 * then correctly refused to show that user a game they weren't seated in, and
 * the guest was stranded on "This room doesn't have an active game." The host
 * hit the mirror image: `isHost` compared the surviving user against a host_id
 * recorded for the discarded one, so they could never start their own room.
 */

const authListeners: Array<(e: string, s: unknown) => void> = [];
const signInAnonymously = vi.fn(async () => ({ error: null }));
const getSession = vi.fn(async () => ({ data: { session: null } }));
const onAuthStateChange = vi.fn((cb: (e: string, s: unknown) => void) => {
  authListeners.push(cb);
  return { data: { subscription: { unsubscribe: vi.fn() } } };
});
const upsert = vi.fn(async () => ({ error: null as Error | null }));
const maybeSingle = vi.fn(async () => ({ data: { display_name: "Ravi" } }));

vi.mock("@/services/supabase", () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: { onAuthStateChange, getSession, signInAnonymously },
    from: () => ({ upsert, select: () => ({ eq: () => ({ maybeSingle }) }) }),
  },
}));
vi.mock("@/services/stats", () => ({ syncUnsyncedResults: vi.fn() }));

const anonUser = { id: "anon-1", is_anonymous: true };

/** `initOnce` is module-level by design, so each test needs its own module. */
async function freshSession() {
  vi.resetModules();
  const mod = await import("./session");
  return mod.useSession;
}

beforeEach(() => {
  vi.clearAllMocks();
  authListeners.length = 0;
  upsert.mockImplementation(async () => ({ error: null }));
  maybeSingle.mockImplementation(async () => ({ data: { display_name: "Ravi" } }));
});

describe("session init", () => {
  it("signs a guest in exactly once, however many times init() is called", async () => {
    const useSession = await freshSession();

    // Two synchronous calls — precisely what StrictMode's double-invoked mount
    // effect does. Both must share one run, or we mint two anonymous users.
    await Promise.all([useSession.getState().init(), useSession.getState().init()]);
    await useSession.getState().init(); // and a third, later

    expect(signInAnonymously).toHaveBeenCalledTimes(1);
    expect(onAuthStateChange).toHaveBeenCalledTimes(1); // no leaked listener either
  });

  it("publishes the user identity immediately, without waiting for the profile", async () => {
    const useSession = await freshSession();
    // ensureProfile hangs. The user must still be usable: LobbyScreen's isHost
    // and every online seat check key on user.id, and the Supabase client
    // already holds a valid session by this point.
    maybeSingle.mockImplementation(() => new Promise(() => {}));

    await useSession.getState().init();
    authListeners.forEach((cb) => cb("SIGNED_IN", { user: anonUser }));

    expect(useSession.getState().user?.id).toBe("anon-1");
    expect(useSession.getState().status).toBe("guest");
    expect(useSession.getState().profile).toBeNull(); // still in flight — fine
  });

  it("keeps the user signed in when the profile lookup fails outright", async () => {
    const useSession = await freshSession();
    upsert.mockImplementation(async () => ({ error: new Error("profiles down") }));

    await useSession.getState().init();
    authListeners.forEach((cb) => cb("SIGNED_IN", { user: anonUser }));
    await vi.waitFor(() => expect(useSession.getState().error).toBeTruthy());

    // The identity survives the profile's failure. It used to be wiped, which
    // left the host of a room permanently unable to start it.
    expect(useSession.getState().user?.id).toBe("anon-1");
    expect(useSession.getState().status).toBe("guest");
  });
});
