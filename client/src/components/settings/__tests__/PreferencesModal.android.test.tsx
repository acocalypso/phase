import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

it("renders the native-engine preference only behind desktop platform proof", () => {
  const source = readFileSync(resolve("src/components/settings/PreferencesModal.tsx"), "utf8");
  expect(source).toContain("{isDesktopTauri() && (");
  expect(source).not.toContain("{isTauri() && (");
});
