import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

it("renders process-exit only behind desktop platform proof", () => {
  const source = readFileSync(resolve("src/pages/MenuPage.tsx"), "utf8");
  expect(source).toContain("{isDesktopTauri() && (");
  expect(source).toContain('import("@tauri-apps/plugin-process")');
  expect(source).not.toContain("{isTauri() && (");
});
