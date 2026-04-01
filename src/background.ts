import type { ExtensionState } from "./types";
import { buildDynamicRules } from "./domainRules";

const STORAGE_KEY = "focusBlockerState";

const DEFAULT_STATE: ExtensionState = {
  enabled: false,
  blockedDomains: [],
};

export async function getState(): Promise<ExtensionState> {
  return new Promise((resolve) => {
    chrome.storage.sync.get(STORAGE_KEY, (result) => {
      const state = (result[STORAGE_KEY] as ExtensionState | undefined) ?? DEFAULT_STATE;
      resolve(state);
    });
  });
}

export async function setState(next: ExtensionState): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.sync.set({ [STORAGE_KEY]: next }, () => resolve());
  });
}

const MAX_DYNAMIC_RULES = 100;

export async function updateRulesFromState(state: ExtensionState): Promise<void> {
  const removeRuleIds = Array.from({ length: MAX_DYNAMIC_RULES }, (_, idx) => idx + 1);
  const addRules = buildDynamicRules(state);

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds,
    addRules: state.enabled ? addRules : [],
  });
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
