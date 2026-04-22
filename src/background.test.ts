import { beforeEach, describe, expect, it, vi } from "vitest";
import { getState, handleRuntimeMessage, setState, updateRulesFromState } from "./background";
import type { ExtensionState } from "./types";

const STORAGE_KEY = "focusBlockerState";

type ChromeMock = {
  storage: {
    sync: {
      get: ReturnType<typeof vi.fn>;
      set: ReturnType<typeof vi.fn>;
    };
  };
  runtime: {
    lastError?: unknown;
  };
  declarativeNetRequest: {
    updateDynamicRules: ReturnType<typeof vi.fn>;
  };
  browsingData: {
    remove: ReturnType<typeof vi.fn>;
  };
};

function installChromeMock(stateInStorage?: ExtensionState): ChromeMock {
  const storageState = stateInStorage ? { [STORAGE_KEY]: stateInStorage } : {};

  const chromeMock: ChromeMock = {
    storage: {
      sync: {
        get: vi.fn((_key: string, cb: (result: unknown) => void) => cb(storageState)),
        set: vi.fn((_value: unknown, cb: () => void) => cb()),
      },
    },
    runtime: {
      lastError: undefined,
    },
    declarativeNetRequest: {
      updateDynamicRules: vi.fn(async () => undefined),
    },
    browsingData: {
      remove: vi.fn((_, __, cb: () => void) => cb()),
    },
  };

  (globalThis as { chrome?: unknown }).chrome = chromeMock;
  return chromeMock;
}

describe("background state functions", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns default state when storage is empty", async () => {
    installChromeMock();
    await expect(getState()).resolves.toEqual({ enabled: false, blockedDomains: [] });
  });

  it("persists state in storage", async () => {
    const chromeMock = installChromeMock();
    const nextState: ExtensionState = { enabled: true, blockedDomains: ["reddit.com"] };

    await setState(nextState);

    expect(chromeMock.storage.sync.set).toHaveBeenCalledWith(
      { [STORAGE_KEY]: nextState },
      expect.any(Function)
    );
    expect(chromeMock.browsingData.remove).toHaveBeenCalledWith(
      { origins: ["https://reddit.com"] },
      { cache: true, cacheStorage: true },
      expect.any(Function)
    );
  });
});

describe("background message handling", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("handles getState message", async () => {
    const storedState: ExtensionState = { enabled: true, blockedDomains: ["youtube.com"] };
    installChromeMock(storedState);

    await expect(handleRuntimeMessage({ type: "focusBlocker:getState" })).resolves.toEqual(
      storedState
    );
  });

  it("handles updateState message and updates rules", async () => {
    const chromeMock = installChromeMock();

    const nextState: ExtensionState = {
      enabled: true,
      blockedDomains: ["twitter.com", "reddit.com"],
    };

    await expect(
      handleRuntimeMessage({ type: "focusBlocker:updateState", payload: nextState })
    ).resolves.toEqual({ ok: true });

    expect(chromeMock.storage.sync.set).toHaveBeenCalled();
    expect(chromeMock.declarativeNetRequest.updateDynamicRules).toHaveBeenCalledWith({
      removeRuleIds: Array.from({ length: 100 }, (_, idx) => idx + 1),
      addRules: expect.arrayContaining([
        expect.objectContaining({ id: 1, condition: expect.objectContaining({ urlFilter: "||twitter.com" }) }),
        expect.objectContaining({ id: 2, condition: expect.objectContaining({ urlFilter: "||reddit.com" }) }),
      ]),
    });
    expect(chromeMock.browsingData.remove).toHaveBeenCalledWith(
      { origins: ["https://twitter.com", "https://reddit.com"] },
      { cache: true, cacheStorage: true },
      expect.any(Function)
    );
  });

  it("does not add rules when blocking is disabled", async () => {
    const chromeMock = installChromeMock();
    const state: ExtensionState = { enabled: false, blockedDomains: ["news.ycombinator.com"] };

    await updateRulesFromState(state);

    expect(chromeMock.declarativeNetRequest.updateDynamicRules).toHaveBeenCalledWith({
      removeRuleIds: Array.from({ length: 100 }, (_, idx) => idx + 1),
      addRules: [],
    });
  });
});

