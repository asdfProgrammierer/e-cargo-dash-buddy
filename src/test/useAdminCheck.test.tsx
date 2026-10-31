import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { useAdminCheck } from "@/hooks/useAdminCheck";

const mocks = vi.hoisted(() => ({
  auth: { user: { id: "admin-a", last_sign_in_at: "session-a" } as { id: string; last_sign_in_at: string } | null, loading: false },
  lookup: vi.fn(),
}));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => mocks.auth }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: mocks.lookup }) }) }) }) },
}));

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { wrapper, client };
}

describe("cached server admin checks", () => {
  beforeEach(() => {
    mocks.auth = { user: { id: "admin-a", last_sign_in_at: "session-a" }, loading: false };
    mocks.lookup.mockReset().mockResolvedValue({ data: { role: "admin" }, error: null });
  });

  it("reuses the server result across navigation without returning a loading state", async () => {
    const { wrapper } = setup();
    const first = renderHook(() => useAdminCheck(), { wrapper });
    await waitFor(() => expect(first.result.current).toBe(true));
    first.unmount();
    const next = renderHook(() => useAdminCheck(), { wrapper });
    expect(next.result.current).toBe(true);
    expect(mocks.lookup).toHaveBeenCalledTimes(1);
  });

  it("does not give a different user the cached admin result", async () => {
    const { wrapper } = setup();
    const hook = renderHook(() => useAdminCheck(), { wrapper });
    await waitFor(() => expect(hook.result.current).toBe(true));
    mocks.lookup.mockResolvedValue({ data: null, error: null });
    mocks.auth.user = { id: "merchant-b", last_sign_in_at: "session-b" };
    hook.rerender();
    expect(hook.result.current).toBe(null);
    await waitFor(() => expect(hook.result.current).toBe(false));
  });

  it("ignores an old admin response after switching to a merchant", async () => {
    let resolveOld: ((value: { data: { role: string }; error: null }) => void) | undefined;
    mocks.lookup.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }));
    const { wrapper } = setup();
    const hook = renderHook(() => useAdminCheck(), { wrapper });
    await waitFor(() => expect(mocks.lookup).toHaveBeenCalledTimes(1));
    mocks.lookup.mockResolvedValue({ data: null, error: null });
    mocks.auth.user = { id: "merchant-b", last_sign_in_at: "session-b" };
    hook.rerender();
    await waitFor(() => expect(hook.result.current).toBe(false));
    await act(async () => { resolveOld?.({ data: { role: "admin" }, error: null }); });
    expect(hook.result.current).toBe(false);
  });

  it("denies navigation on a failed server check", async () => {
    mocks.lookup.mockResolvedValue({ data: null, error: new Error("denied") });
    const { wrapper } = setup();
    const hook = renderHook(() => useAdminCheck(), { wrapper });
    await waitFor(() => expect(hook.result.current).toBe(false));
  });
});