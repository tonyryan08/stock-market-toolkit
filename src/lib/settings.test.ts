import { describe, it, expect } from "vitest";
import { intSetting } from "./settings";

describe("intSetting (Phase 3 review N3)", () => {
  it('"0" is a value, not the default', () => {
    expect(intSetting("0", 60)).toBe(0);
    expect(intSetting(" 0 ", 20)).toBe(0);
  });
  it("digits parse; unset, blank, words, negatives and decimals fall back", () => {
    expect(intSetting("4", 20)).toBe(4);
    expect(intSetting("18", 20)).toBe(18);
    expect(intSetting(undefined, 60)).toBe(60);
    expect(intSetting(null, 60)).toBe(60);
    expect(intSetting("", 60)).toBe(60);
    expect(intSetting("abc", 3)).toBe(3);
    expect(intSetting("-5", 3)).toBe(3);
    expect(intSetting("2.5", 3)).toBe(3);
  });
});
