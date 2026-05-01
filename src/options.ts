import type { ExtensionState } from "./types";

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

function renderScheduleOptions(scheduleOptions: HTMLElement, schedule: ExtensionState['schedule']): void {
  if (!schedule) return;

  const startTime = document.getElementById("startTime") as HTMLInputElement;
  const endTime = document.getElementById("endTime") as HTMLInputElement;
  const dayCheckboxes = scheduleOptions.querySelectorAll('input[type="checkbox"][value]') as NodeListOf<HTMLInputElement>;

  startTime.value = schedule.startTime;
  endTime.value = schedule.endTime;

  dayCheckboxes.forEach((cb) => {
    cb.checked = schedule.daysOfWeek.includes(parseInt(cb.value));
  });
}

function collectScheduleOptions(): ExtensionState['schedule'] {
  const startTime = (document.getElementById("startTime") as HTMLInputElement).value;
  const endTime = (document.getElementById("endTime") as HTMLInputElement).value;
  const dayCheckboxes = document.querySelectorAll('#scheduleOptions input[type="checkbox"][value]') as NodeListOf<HTMLInputElement>;
  const daysOfWeek = Array.from(dayCheckboxes).filter(cb => cb.checked).map(cb => parseInt(cb.value));

  return { startTime, endTime, daysOfWeek };
}

export async function init() {
  const notificationsToggle = document.getElementById("notificationsToggle") as HTMLInputElement;
  const scheduleEnabled = document.getElementById("scheduleEnabled") as HTMLInputElement;
  const scheduleOptions = document.getElementById("scheduleOptions") as HTMLElement;
  const exportBtn = document.getElementById("exportBtn") as HTMLButtonElement;
  const importBtn = document.getElementById("importBtn") as HTMLButtonElement;
  const importFile = document.getElementById("importFile") as HTMLInputElement;

  let currentState = await getBackgroundState();

  // Set initial values
  notificationsToggle.checked = currentState.notificationsEnabled;
  scheduleEnabled.checked = currentState.schedule !== null;
  if (currentState.schedule) {
    renderScheduleOptions(scheduleOptions, currentState.schedule);
  }
  scheduleOptions.style.display = scheduleEnabled.checked ? "block" : "none";

  // Event listeners
  notificationsToggle.addEventListener("change", async () => {
    currentState.notificationsEnabled = notificationsToggle.checked;
    await updateBackgroundState(currentState);
  });

  scheduleEnabled.addEventListener("change", async () => {
    if (scheduleEnabled.checked) {
      scheduleOptions.style.display = "block";
      currentState.schedule = collectScheduleOptions();
    } else {
      scheduleOptions.style.display = "none";
      currentState.schedule = null;
    }
    await updateBackgroundState(currentState);
  });

  // Update schedule on changes
  scheduleOptions.addEventListener("change", async () => {
    if (scheduleEnabled.checked) {
      currentState.schedule = collectScheduleOptions();
      await updateBackgroundState(currentState);
    }
  });

  // Export
  exportBtn.addEventListener("click", () => {
    const data = JSON.stringify({ blockedDomains: currentState.blockedDomains }, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "blocked-domains.json";
    a.click();
    URL.revokeObjectURL(url);
  });

  // Import
  importBtn.addEventListener("click", () => {
    importFile.click();
  });

  importFile.addEventListener("change", async (event) => {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;

    const text = await file.text();
    try {
      const data = JSON.parse(text);
      if (Array.isArray(data.blockedDomains)) {
        currentState.blockedDomains = data.blockedDomains;
        await updateBackgroundState(currentState);
        alert("Imported successfully!");
      } else {
        alert("Invalid file format.");
      }
    } catch {
      alert("Failed to parse file.");
    }
  });
}

if (typeof document !== "undefined") {
  void init();
}