import type { ExtensionState } from "./types";
import { buildDynamicRules } from "./blocking";

const STORAGE_KEY = "focusBlockerState";

const DEFAULT_STATE: ExtensionState = {
  enabled: false,
  blockedDomains: [],
};

async function getState(): Promise<ExtensionState> {
  return new Promise((resolve) => {
    chrome.storage.sync.get(STORAGE_KEY, (result) => {
      const state = (result[STORAGE_KEY] as ExtensionState | undefined) ?? DEFAULT_STATE;
      resolve(state);
    });
  });
}

async function setState(next: ExtensionState): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.sync.set({ [STORAGE_KEY]: next }, () => resolve());
  });
}

async function updateRulesFromState(state: ExtensionState): Promise<void> {
  const ruleIds = state.blockedDomains.map((_, idx) => idx + 1);
  const addRules = buildDynamicRules(state);

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: ruleIds,
    addRules: state.enabled ? addRules : [],
  });
}

chrome.runtime.onInstalled.addListener(async () => {
  const state = await getState();
  await updateRulesFromState(state);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    if (message?.type === "focusBlocker:getState") {
      const state = await getState();
      sendResponse(state);
      return;
    }

    if (message?.type === "focusBlocker:updateState") {
      const nextState = message.payload as ExtensionState;
      await setState(nextState);
      await updateRulesFromState(nextState);
      sendResponse({ ok: true });
      return;
    }
  })();

  return true;
});

