import type { ExtensionState } from "./types";

const BLOCK_ACTION_TYPE = "block" as chrome.declarativeNetRequest.RuleActionType;
const MAIN_FRAME_RESOURCE_TYPE = "main_frame" as chrome.declarativeNetRequest.ResourceType;

export function parseDomains(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim().toLowerCase())
    .filter((line) => line.length > 0);
}

export function buildDynamicRules(state: ExtensionState): chrome.declarativeNetRequest.Rule[] {
  return state.blockedDomains.map((domain, index) => ({
    id: index + 1,
    priority: 1,
    action: {
      type: BLOCK_ACTION_TYPE,
    },
    condition: {
      urlFilter: `||${domain}`,
      resourceTypes: [MAIN_FRAME_RESOURCE_TYPE],
    },
  }));
}

