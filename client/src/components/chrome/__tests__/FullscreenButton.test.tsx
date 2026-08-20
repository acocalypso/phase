import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentWindow: vi.fn(),
  desktop: vi.fn(),
  mobile: vi.fn(),
}));

vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: mocks.getCurrentWindow }));
vi.mock("../../../services/platform", () => ({
  isDesktopTauri: mocks.desktop,
  isMobileTauri: mocks.mobile,
}));

import { FullscreenButton } from "../FullscreenButton";

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("FullscreenButton host routing", () => {
  it("uses the Tauri window API on desktop", async () => {
    const setFullscreen = vi.fn().mockResolvedValue(undefined);
    mocks.desktop.mockReturnValue(true);
    mocks.mobile.mockReturnValue(false);
    mocks.getCurrentWindow.mockReturnValue({
      isFullscreen: vi.fn().mockResolvedValue(false),
      setFullscreen,
      onResized: vi.fn().mockResolvedValue(() => {}),
    });
    render(<FullscreenButton variant="chrome" />);
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: /enter fullscreen/i }));
    await vi.waitFor(() => expect(setFullscreen).toHaveBeenCalledWith(true));
  });

  it("renders no control and never touches the window API on Android", () => {
    mocks.desktop.mockReturnValue(false);
    mocks.mobile.mockReturnValue(true);
    render(<FullscreenButton variant="chrome" />);
    expect(screen.queryByRole("button", { name: /fullscreen/i })).not.toBeInTheDocument();
    expect(mocks.getCurrentWindow).not.toHaveBeenCalled();
  });

  it("unlistens when a desktop resize listener resolves after unmount", async () => {
    let resolveListener: ((unlisten: () => void) => void) | undefined;
    const unlisten = vi.fn();
    mocks.desktop.mockReturnValue(true);
    mocks.mobile.mockReturnValue(false);
    mocks.getCurrentWindow.mockReturnValue({
      isFullscreen: vi.fn().mockResolvedValue(false),
      onResized: vi.fn(() => new Promise((resolve) => { resolveListener = resolve; })),
    });
    const view = render(<FullscreenButton variant="chrome" />);
    await act(async () => {});
    view.unmount();
    await act(async () => { resolveListener?.(unlisten); });
    expect(unlisten).toHaveBeenCalledOnce();
  });
});
