import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router";
import { portalApi, PortalApiError } from "~/lib/portal-api";

export type PortalRole =
  | "super_admin"
  | "admin"
  | "support_agent"
  | "client";

export interface PortalUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: PortalRole;
  avatarUrl?: string;
  tenantId: string;
}

interface PortalAuthContextValue {
  user: PortalUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (
    email: string,
    password: string,
    rememberMe?: boolean,
  ) => Promise<void>;
  logout: () => Promise<void>;
}

const PortalAuthContext = createContext<PortalAuthContextValue | null>(null);

export function PortalAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PortalUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  // Check session on mount
  useEffect(() => {
    let cancelled = false;

    async function checkSession() {
      try {
        const data = (await portalApi.auth.me()) as { user: PortalUser };
        if (!cancelled) {
          setUser(data.user);
        }
      } catch (err) {
        if (!cancelled) {
          setUser(null);
          // Only redirect on 401 (unauthorized), not on network errors
          if (err instanceof PortalApiError && err.status === 401) {
            navigate("/login", { replace: true });
          }
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    checkSession();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const login = useCallback(
    async (email: string, password: string, rememberMe?: boolean) => {
      const data = (await portalApi.auth.login({
        email,
        password,
        rememberMe,
      })) as { user: PortalUser };
      setUser(data.user);
      navigate("/portal/dashboard", { replace: true });
    },
    [navigate],
  );

  const logout = useCallback(async () => {
    try {
      await portalApi.auth.logout();
    } finally {
      setUser(null);
      navigate("/login", { replace: true });
    }
  }, [navigate]);

  return (
    <PortalAuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: user !== null,
        login,
        logout,
      }}
    >
      {children}
    </PortalAuthContext.Provider>
  );
}

export function usePortalAuth(): PortalAuthContextValue {
  const ctx = useContext(PortalAuthContext);
  if (!ctx) {
    throw new Error("usePortalAuth must be used within a PortalAuthProvider");
  }
  return ctx;
}
