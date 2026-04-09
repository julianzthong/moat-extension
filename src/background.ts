import type { ExtensionState } from "./types";
import { buildDynamicRules } from "./domainRules";
import { getStorageValue, setStorageValue } from "./storage";

const STORAGE_KEY = "focusBlockerState";

const DEFAULT_STATE: ExtensionState = {
  enabled: false,
  blockedDomains: [],
};

const MAX_DYNAMIC_RULES = 100;

export async function getState(): Promise<ExtensionState> {
  const state = await getStorageValue<ExtensionState>(STORAGE_KEY);
  return state ?? DEFAULT_STATE;
}

export async function setState(next: ExtensionState): Promise<void> {
  await setStorageValue(STORAGE_KEY, next);

  if (next.enabled) {
    await clearCacheForDomains(next.blockedDomains);
  }
}

export async function updateRulesFromState(state: ExtensionState): Promise<void> {
  const removeRuleIds = Array.from({ length: MAX_DYNAMIC_RULES }, (_, idx) => idx + 1);
  const addRules = buildDynamicRules(state);

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds,
    addRules: state.enabled ? addRules : [],
  });
}

async function clearCacheForDomains(domains: string[]): Promise<void> {
  if (domains.length === 0) return;

  const origins = domains.map((d) => `https://${d}`) as [string, ...string[]];

  // Clear cache by origin for each domain
  chrome.browsingData.remove(
    { origins },
    { cache: true, cacheStorage: true }
  );
}

type RuntimeMessage =
  | { type: "focusBlocker:getState" }
  | { type: "focusBlocker:updateState"; payload: ExtensionState };

export async function handleRuntimeMessage(message: RuntimeMessage | unknown): Promise<unknown> {
  if ((message as RuntimeMessage)?.type === "focusBlocker:getState") {
    return getState();
  }

  if ((message as RuntimeMessage)?.type === "focusBlocker:updateState") {
    const nextState = (message as RuntimeMessage & { payload: ExtensionState }).payload;
    await setState(nextState);
    await updateRulesFromState(nextState);
    return { ok: true };
  }

  return null;
}

export function registerBackgroundListeners(): void {
  const syncState = async () => {
    const state = await getState();
    await updateRulesFromState(state);
  };

  chrome.runtime.onInstalled.addListener(syncState);
  chrome.runtime.onStartup.addListener(syncState);

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    void (async () => {
      const response = await handleRuntimeMessage(message);
      if (response !== null) {
        sendResponse(response);
      }
    })();

    return true;
  });
}

if (typeof chrome !== "undefined" && chrome.runtime?.id) {
  registerBackgroundListeners();
  void (async () => {
    const state = await getState();
    await updateRulesFromState(state);
  })();
}

/*
  Keep this file as a module even if tree-shaking changes in the future.
*/
export {};
