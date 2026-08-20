import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ desktop: vi.fn(), invoke: vi.fn(), listen: vi.fn() }));
vi.mock("../platform", () => ({ isDesktopTauri: mocks.desktop }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen: mocks.listen }));

import {
  canAttemptNativeEngine,
  getNativeEngineProgress,
  subscribeNativeEngineProgress,
} from "../nativeEngine";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("native engine platform routing", () => {
  it("never selects, invokes, or listens on Android", async () => {
    mocks.desktop.mockReturnValue(false);
    expect(canAttemptNativeEngine(true)).toBe(false);
    expect(await getNativeEngineProgress()).toBeNull();
    expect(typeof (await subscribeNativeEngineProgress(() => {}))).toBe("function");
    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(mocks.listen).not.toHaveBeenCalled();
  });

  it("retains the desktop command and event paths", async () => {
    mocks.desktop.mockReturnValue(true);
    mocks.invoke.mockResolvedValue(null);
    mocks.listen.mockResolvedValue(() => {});
    await getNativeEngineProgress();
    await subscribeNativeEngineProgress(() => {});
    expect(mocks.invoke).toHaveBeenCalledWith("native_engine_progress");
    expect(mocks.listen).toHaveBeenCalledWith("native-engine-progress", expect.any(Function));
  });
});
