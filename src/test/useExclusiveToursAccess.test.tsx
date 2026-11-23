import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { useExclusiveToursAccess } from "@/hooks/useExclusiveToursAccess";

const mocks = vi.hoisted(() => ({
  auth: { user: { id: "merchant-a", last_sign_in_at: "session-a" }, ownerUserId: "merchant-a" },
  rpc: vi.fn(),
}));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => mocks.auth }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc } }));

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("admin-controlled exclusive tour access", () => {
  beforeEach(() => {
    mocks.auth = { user: { id: "merchant-a", last_sign_in_at: "session-a" }, ownerUserId: "merchant-a" };
    mocks.rpc.mockReset();
  });
  it("keeps a merchant without activation disabled", async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    const hook = renderHook(() => useExclusiveToursAccess(), { wrapper: setup() });
    await waitFor(() => expect(hook.result.current.data).toBe(false));
  });
  it("allows access only after the server confirms activation", async () => {
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    const hook = renderHook(() => useExclusiveToursAccess(), { wrapper: setup() });
    await waitFor(() => expect(hook.result.current.data).toBe(true));
    expect(mocks.rpc).toHaveBeenCalledWith("merchant_exclusive_tours_enabled");
  });
  it("does not reuse another merchant's activation", async () => {
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    const hook = renderHook(() => useExclusiveToursAccess(), { wrapper: setup() });
    await waitFor(() => expect(hook.result.current.data).toBe(true));
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    mocks.auth = { user: { id: "merchant-b", last_sign_in_at: "session-b" }, ownerUserId: "merchant-b" };
    hook.rerender();
    expect(hook.result.current.data).toBeUndefined();
    await waitFor(() => expect(hook.result.current.data).toBe(false));
  });
  it("never grants access when the permission check fails", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: new Error("denied") });
    const hook = renderHook(() => useExclusiveToursAccess(), { wrapper: setup() });
    await waitFor(() => expect(hook.result.current.isError).toBe(true));
    expect(hook.result.current.data).toBeUndefined();
  });
});