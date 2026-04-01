/* @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { init } from "./popup";
import type { ExtensionState } from "./types";

type RuntimeMessage =
  | { type: "focusBlocker:getState" }
  | { type: "focusBlocker:updateState"; payload: ExtensionState };

const baseState: ExtensionState = {
  enabled: false,
  blockedDomains: ["twitter.com"],
};

function setPopupDom(): void {
  document.body.innerHTML = `
    <div>
      <input type="checkbox" id="enabledToggle" />
      <input type="text" id="domainInput" />
      <button id="addBtn">Add</button>
      <ul id="domainList"></ul>
      <div id="statusText"></div>
    </div>
  `;
}

function installChromeRuntimeMock(initialState: ExtensionState) {
  const sent: RuntimeMessage[] = [];
  let currentState = initialState;

  const sendMessage = vi.fn((message: RuntimeMessage, cb?: (response: unknown) => void) => {
    sent.push(message);
    if (message.type === "focusBlocker:getState") {
      cb?.(currentState);
      return;
    }
    currentState = message.payload;
    cb?.({ ok: true });
  });

  (globalThis as { chrome?: unknown }).chrome = { runtime: { sendMessage } };

  return { sent, sendMessage };
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("popup", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    setPopupDom();
  });

  it("initializes controls from background state", async () => {
    installChromeRuntimeMock({
      enabled: true,
      blockedDomains: ["reddit.com", "youtube.com"],
    });

    await init();

    const enabledToggle = document.getElementById("enabledToggle") as HTMLInputElement;
    const statusText = document.getElementById("statusText") as HTMLDivElement;
    const domainItems = Array.from(document.querySelectorAll("#domainList li span")).map((el) => el.textContent);

    expect(enabledToggle.checked).toBe(true);
    expect(statusText.textContent).toBe("Blocking is active");
    expect(domainItems).toEqual(["reddit.com", "youtube.com"]);
  });

  it("sends update when toggle changes", async () => {
    const { sent } = installChromeRuntimeMock(baseState);
    await init();

    const enabledToggle = document.getElementById("enabledToggle") as HTMLInputElement;
    enabledToggle.checked = true;
    enabledToggle.dispatchEvent(new Event("change"));
    await flush();

    const update = sent.find((msg) => msg.type === "focusBlocker:updateState");
    expect(update).toEqual({
      type: "focusBlocker:updateState",
      payload: { enabled: true, blockedDomains: ["twitter.com"] },
    });
  });

  it("sends update when remove x is clicked", async () => {
    const { sent } = installChromeRuntimeMock({ enabled: false, blockedDomains: ["reddit.com", "youtube.com"] });
    await init();

    const removeButton = document.querySelector("#domainList li button") as HTMLButtonElement;
    removeButton.click();
    await flush();

    const update = sent.find((msg) => msg.type === "focusBlocker:updateState");
    expect(update).toEqual({
      type: "focusBlocker:updateState",
      payload: { enabled: false, blockedDomains: ["youtube.com"] },
    });
  });

  it("sends update when add button is clicked", async () => {
    const { sent } = installChromeRuntimeMock(baseState);
    await init();

    const domainInput = document.getElementById("domainInput") as HTMLInputElement;
    const addBtn = document.getElementById("addBtn") as HTMLButtonElement;

    domainInput.value = "  Reddit.com ";
    addBtn.click();
    await flush();

    const update = sent.find((msg) => msg.type === "focusBlocker:updateState");
    expect(update).toEqual({
      type: "focusBlocker:updateState",
      payload: { enabled: false, blockedDomains: ["twitter.com", "reddit.com"] },
    });
  });
});

