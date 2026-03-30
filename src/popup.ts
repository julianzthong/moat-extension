import type { ExtensionState } from "./types";
import { parseDomains } from "./domainRules";
import "./popup.css";

function getBackgroundState(): Promise<ExtensionState> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "focusBlocker:getState" }, (response) => {
      resolve(response as ExtensionState);
    });
  });
}

function updateBackgroundState(state: ExtensionState): Promise<void> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: "focusBlocker:updateState", payload: state },
      () => resolve()
    );
  });
}

function domainsToText(domains: string[]): string {
  return domains.join("\n");
}

export async function init() {
  const enabledToggle = document.getElementById("enabledToggle") as HTMLInputElement | null;
  const domainsInput = document.getElementById("domainsInput") as HTMLTextAreaElement | null;
  const saveBtn = document.getElementById("saveBtn") as HTMLButtonElement | null;
  const statusText = document.getElementById("statusText") as HTMLDivElement | null;

  if (!enabledToggle || !domainsInput || !saveBtn || !statusText) {
    return;
  }

  let currentState = await getBackgroundState();

  enabledToggle.checked = currentState.enabled;
  domainsInput.value = domainsToText(currentState.blockedDomains);
  statusText.textContent = currentState.enabled ? "Blocking is active" : "Blocking is off";

  enabledToggle.addEventListener("change", async () => {
    currentState = {
      ...currentState,
      enabled: enabledToggle.checked,
    };
    statusText.textContent = currentState.enabled ? "Blocking is active" : "Blocking is off";
    saveBtn.disabled = true;
    await updateBackgroundState(currentState);
    saveBtn.disabled = false;
  });

  saveBtn.addEventListener("click", async () => {
    currentState = {
      ...currentState,
      blockedDomains: parseDomains(domainsInput.value),
    };
    saveBtn.disabled = true;
    await updateBackgroundState(currentState);
    saveBtn.disabled = false;
  });
}

if (typeof document !== "undefined") {
  void init();
}

