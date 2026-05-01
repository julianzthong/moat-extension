import type { ExtensionState } from "./types";
import { buildDynamicRules } from "./domainRules";
import { getStorageValue, setStorageValue } from "./storage";

const STORAGE_KEY = "focusBlockerState";

const DEFAULT_STATE: ExtensionState = {
  enabled: false,
  blockedDomains: [],
  notificationsEnabled: false,
  schedule: null,
};

const MAX_DYNAMIC_RULES = 100;

export async function getState(): Promise<ExtensionState> {
  const state = await getStorageValue<ExtensionState>(STORAGE_KEY);
  return state ?? DEFAULT_STATE;
}

export async function setState(next: ExtensionState): Promise<void> {
  try {
    await setStorageValue(STORAGE_KEY, next);

    if (next.enabled) {
      await clearCacheForDomains(next.blockedDomains);
    }
  } catch (error) {
    console.error("Failed to set state:", error);
    throw error;
  }
}

export async function updateRulesFromState(state: ExtensionState): Promise<void> {
  try {
    const removeRuleIds = Array.from({ length: MAX_DYNAMIC_RULES }, (_, idx) => idx + 1);
    const addRules = buildDynamicRules(state);

    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds,
      addRules: state.enabled ? addRules : [],
    });
  } catch (error) {
    console.error("Failed to update dynamic rules:", error);
    throw error;
  }
}

async function clearCacheForDomains(domains: string[]): Promise<void> {
  if (domains.length === 0) return;

  try {
    const origins = domains.map((d) => `https://${d}`) as [string, ...string[]];

    // Clear cache by origin for each domain
    await new Promise<void>((resolve, reject) => {
      chrome.browsingData.remove(
        { origins },
        { cache: true, cacheStorage: true },
        () => {
          const error = chrome.runtime.lastError;
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        }
      );
    });
  } catch (error) {
    console.error("Failed to clear cache for domains:", error);
    // Don't throw here - this is a secondary operation, let the primary operation succeed
  }
}

function isWithinSchedule(schedule: ExtensionState['schedule']): boolean {
  if (!schedule) return false;

  const now = new Date();
  const currentDay = now.getDay(); // 0=Sun
  const currentTime = now.toTimeString().slice(0, 5); // HH:MM

  if (!schedule.daysOfWeek.includes(currentDay)) return false;

  return currentTime >= schedule.startTime && currentTime <= schedule.endTime;
}

async function enforceSchedule(state: ExtensionState): Promise<void> {
  if (!state.schedule) return;

  const shouldBeEnabled = isWithinSchedule(state.schedule);
  if (state.enabled !== shouldBeEnabled) {
    const updatedState = { ...state, enabled: shouldBeEnabled };
    await setState(updatedState);
    await updateRulesFromState(updatedState);
  }
}

type RuntimeMessage =
  | { type: "focusBlocker:getState" }
  | { type: "focusBlocker:updateState"; payload: ExtensionState };

export async function handleRuntimeMessage(message: RuntimeMessage | unknown): Promise<unknown> {
  try {
    if ((message as RuntimeMessage)?.type === "focusBlocker:getState") {
      return await getState();
    }

    if ((message as RuntimeMessage)?.type === "focusBlocker:updateState") {
      const nextState = (message as RuntimeMessage & { payload: ExtensionState }).payload;
      await setState(nextState);
      await updateRulesFromState(nextState);
      await enforceSchedule(nextState);
      return { ok: true };
    }

    return null;
  } catch (error) {
    console.error("Error handling runtime message:", error);
    return { ok: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export function registerBackgroundListeners(): void {
  const syncState = async () => {
    try {
      const state = await getState();
      await updateRulesFromState(state);
      await enforceSchedule(state);
    } catch (error) {
      console.error("Error syncing state on extension event:", error);
    }
  };

  chrome.runtime.onInstalled.addListener(syncState);
  chrome.runtime.onStartup.addListener(syncState);

  chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === "scheduleCheck") {
      try {
        const state = await getState();
        await enforceSchedule(state);
      } catch (error) {
        console.error("Error checking schedule:", error);
      }
    }
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    void (async () => {
      try {
        const response = await handleRuntimeMessage(message);
        if (response !== null) {
          sendResponse(response);
        }
      } catch (error) {
        console.error("Error in message listener:", error);
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    })();

    return true;
  });
}

if (typeof chrome !== "undefined" && chrome.runtime?.id) {
  registerBackgroundListeners();
  void (async () => {
    try {
      const state = await getState();
      await updateRulesFromState(state);
      await enforceSchedule(state);

      // Set up periodic schedule check
      chrome.alarms.create("scheduleCheck", { periodInMinutes: 1 });
    } catch (error) {
      console.error("Error initializing background service worker:", error);
    }
  })();
}

/*
  Keep this file as a module even if tree-shaking changes in the future.
*/
export {};
