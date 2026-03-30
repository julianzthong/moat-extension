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
      <textarea id="domainsInput"></textarea>
      <button id="saveBtn">Save</button>
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
    const domainsInput = document.getElementById("domainsInput") as HTMLTextAreaElement;
    const statusText = document.getElementById("statusText") as HTMLDivElement;

    expect(enabledToggle.checked).toBe(true);
    expect(domainsInput.value).toBe("reddit.com\nyoutube.com");
    expect(statusText.textContent).toBe("Blocking is active");
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

  it("sends parsed domains when save is clicked", async () => {
    const { sent } = installChromeRuntimeMock(baseState);
    await init();

    const domainsInput = document.getElementById("domainsInput") as HTMLTextAreaElement;
    const saveBtn = document.getElementById("saveBtn") as HTMLButtonElement;

    domainsInput.value = "  Reddit.com \n\nYOUTUBE.com";
    saveBtn.click();
    await flush();

    const updates = sent.filter((msg) => msg.type === "focusBlocker:updateState");
    expect(updates.at(-1)).toEqual({
      type: "focusBlocker:updateState",
      payload: { enabled: false, blockedDomains: ["reddit.com", "youtube.com"] },
    });
  });
});

