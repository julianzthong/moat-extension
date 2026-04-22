import type { ExtensionState } from "./types";
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

function setStatusText(statusText: HTMLDivElement, enabled: boolean): void {
  statusText.textContent = enabled ? "Blocking is active" : "Blocking is off";
}

function renderDomainList(domainList: HTMLUListElement, domains: string[]): void {
  domainList.innerHTML = "";

  if (domains.length === 0) {
    const emptyItem = document.createElement("li");
    emptyItem.className = "domain-empty";
    emptyItem.textContent = "No domains blocked yet.";
    domainList.appendChild(emptyItem);
    return;
  }

  domains.forEach((domain) => {
    const item = document.createElement("li");
    item.className = "domain-item";

    const text = document.createElement("span");
    text.className = "domain-text";
    text.textContent = domain;

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "remove-domain-btn";
    removeBtn.textContent = "✕";

    removeBtn.addEventListener("click", () => {
      const currentDomains = Array.from(domainList.querySelectorAll("li > span")).map((span) =>
        span.textContent?.trim() ?? ""
      );
      const filtered = currentDomains.filter((d) => d !== domain);
      (domainList as any).onChange(filtered);
    });

    item.appendChild(text);
    item.appendChild(removeBtn);
    domainList.appendChild(item);
  });
}

function normalizeDomainEntry(raw: string): string | null {
  const normalized = raw.trim().toLowerCase();
  if (normalized.length === 0) return null;

  // Basic domain validation: no spaces, at least one dot, no leading/trailing dots
  const domainRegex = /^[a-z0-9]+([-.][a-z0-9]+)*\.[a-z]{2,}$/;
  return domainRegex.test(normalized) ? normalized : null;
}

export async function init() {
  const enabledToggle = document.getElementById("enabledToggle") as HTMLInputElement | null;
  const domainInput = document.getElementById("domainInput") as HTMLInputElement | null;
  const addBtn = document.getElementById("addBtn") as HTMLButtonElement | null;
  const domainList = document.getElementById("domainList") as HTMLUListElement | null;
  const statusText = document.getElementById("statusText") as HTMLDivElement | null;

  if (!enabledToggle || !domainInput || !addBtn || !domainList || !statusText) {
    return;
  }

  let currentState = await getBackgroundState();

  enabledToggle.checked = currentState.enabled;
  setStatusText(statusText, currentState.enabled);

  const syncState = async (nextState: ExtensionState): Promise<void> => {
    currentState = nextState;
    domainList.innerHTML = "";
    renderDomainList(domainList, currentState.blockedDomains);
    await updateBackgroundState(currentState);
  };

  (domainList as any).onChange = async (domains: string[]) => {
    await syncState({ ...currentState, blockedDomains: domains });
  };

  renderDomainList(domainList, currentState.blockedDomains);

  enabledToggle.addEventListener("change", async () => {
    currentState = { ...currentState, enabled: enabledToggle.checked };
    setStatusText(statusText, currentState.enabled);
    await updateBackgroundState(currentState);
  });

  addBtn.addEventListener("click", async () => {
    const newDomain = normalizeDomainEntry(domainInput.value);
    if (!newDomain) {
      return;
    }

    if (currentState.blockedDomains.includes(newDomain)) {
      domainInput.value = "";
      return;
    }

    const nextState = {
      ...currentState,
      blockedDomains: [...currentState.blockedDomains, newDomain],
    };

    domainInput.value = "";
    await syncState(nextState);
  });

  domainInput.addEventListener("keydown", async (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addBtn.click();
    }
  });
}

if (typeof document !== "undefined") {
  void init();
}

