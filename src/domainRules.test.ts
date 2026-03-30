import { describe, expect, it } from "vitest";
import { buildDynamicRules, parseDomains } from "./domainRules";
import type { ExtensionState } from "./types";

describe("parseDomains", () => {
  it("trims, lowercases, and removes empty lines", () => {
    const input = " Twitter.com  \n\nREDDIT.com\n youtube.com ";
    expect(parseDomains(input)).toEqual(["twitter.com", "reddit.com", "youtube.com"]);
  });
});

describe("buildDynamicRules", () => {
  it("creates one main_frame block rule per domain", () => {
    const state: ExtensionState = {
      enabled: true,
      blockedDomains: ["twitter.com", "reddit.com"],
    };

    const rules = buildDynamicRules(state);

    expect(rules).toHaveLength(2);
    expect(rules[0]).toMatchObject({
      id: 1,
      priority: 1,
      action: { type: "block" },
      condition: { urlFilter: "||twitter.com" },
    });
    expect(rules[1]).toMatchObject({
      id: 2,
      condition: { urlFilter: "||reddit.com" },
    });
  });
});

