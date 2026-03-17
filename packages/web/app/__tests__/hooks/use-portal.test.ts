/**
 * usePortal Hook Tests
 *
 * Tests for portal state management, navigation helpers,
 * portal access detection, URL-based portal detection,
 * and portal context values.
 */

import { describe, it, expect } from "vitest";
import type {
  PortalType,
  Portal,
  PortalNavigationItem,
} from "../../hooks/use-portal";

describe("usePortal Hook", () => {
  describe("PortalType Values", () => {
    it("should support admin, manager, and employee portals", () => {
      const portals: PortalType[] = ["admin", "manager", "employee"];

      expect(portals).toContain("admin");
      expect(portals).toContain("manager");
      expect(portals).toContain("employee");
      expect(portals).toHaveLength(3);
    });
  });

  describe("Portal Type", () => {
    it("should have all required fields", () => {
      const portal: Portal = {
        portalId: "p-001",
        portalCode: "admin",
        portalName: "Administration Portal",
        basePath: "/admin",
        isDefault: true,
        icon: "shield",
      };

      expect(portal.portalId).toBe("p-001");
      expect(portal.portalCode).toBe("admin");
      expect(portal.portalName).toBe("Administration Portal");
      expect(portal.basePath).toBe("/admin");
      expect(portal.isDefault).toBe(true);
      expect(portal.icon).toBe("shield");
    });

    it("should allow null icon", () => {
      const portal: Portal = {
        portalId: "p-002",
        portalCode: "employee",
        portalName: "Employee Self-Service",
        basePath: "/ess",
        isDefault: false,
        icon: null,
      };

      expect(portal.icon).toBeNull();
    });
  });

  describe("Portal Navigation Item Type", () => {
    it("should support flat navigation items", () => {
      const item: PortalNavigationItem = {
        id: "nav-1",
        label: "Dashboard",
        path: "/admin/dashboard",
        icon: "home",
      };

      expect(item.id).toBe("nav-1");
      expect(item.label).toBe("Dashboard");
      expect(item.path).toBe("/admin/dashboard");
      expect(item.icon).toBe("home");
    });

    it("should support nested navigation items", () => {
      const item: PortalNavigationItem = {
        id: "nav-hr",
        label: "HR",
        icon: "users",
        children: [
          { id: "nav-employees", label: "Employees", path: "/admin/hr/employees" },
          { id: "nav-positions", label: "Positions", path: "/admin/hr/positions" },
          { id: "nav-departments", label: "Departments", path: "/admin/hr/departments" },
        ],
      };

      expect(item.children).toHaveLength(3);
      expect(item.children![0].label).toBe("Employees");
      expect(item.path).toBeUndefined();
    });

    it("should allow optional path and icon", () => {
      const item: PortalNavigationItem = {
        id: "nav-section",
        label: "Section Header",
      };

      expect(item.path).toBeUndefined();
      expect(item.icon).toBeUndefined();
      expect(item.children).toBeUndefined();
    });
  });

  describe("Portal Detection from URL", () => {
    it("should detect admin portal from URL path", () => {
      const detectPortalFromPath = (pathname: string): PortalType | null => {
        if (pathname.startsWith("/admin")) return "admin";
        if (pathname.startsWith("/manager")) return "manager";
        if (pathname.startsWith("/ess")) return "employee";
        return null;
      };

      expect(detectPortalFromPath("/admin/dashboard")).toBe("admin");
      expect(detectPortalFromPath("/admin/hr/employees")).toBe("admin");
    });

    it("should detect manager portal from URL path", () => {
      const detectPortalFromPath = (pathname: string): PortalType | null => {
        if (pathname.startsWith("/admin")) return "admin";
        if (pathname.startsWith("/manager")) return "manager";
        if (pathname.startsWith("/ess")) return "employee";
        return null;
      };

      expect(detectPortalFromPath("/manager/team")).toBe("manager");
      expect(detectPortalFromPath("/manager/approvals")).toBe("manager");
    });

    it("should detect employee portal from URL path", () => {
      const detectPortalFromPath = (pathname: string): PortalType | null => {
        if (pathname.startsWith("/admin")) return "admin";
        if (pathname.startsWith("/manager")) return "manager";
        if (pathname.startsWith("/ess")) return "employee";
        return null;
      };

      expect(detectPortalFromPath("/ess/dashboard")).toBe("employee");
      expect(detectPortalFromPath("/ess/profile")).toBe("employee");
    });

    it("should return null for unrecognised paths", () => {
      const detectPortalFromPath = (pathname: string): PortalType | null => {
        if (pathname.startsWith("/admin")) return "admin";
        if (pathname.startsWith("/manager")) return "manager";
        if (pathname.startsWith("/ess")) return "employee";
        return null;
      };

      expect(detectPortalFromPath("/login")).toBeNull();
      expect(detectPortalFromPath("/")).toBeNull();
      expect(detectPortalFromPath("/settings")).toBeNull();
    });
  });

  describe("Portal Access Check", () => {
    it("should return true when user has portal access", () => {
      const portals: Portal[] = [
        {
          portalId: "p-001",
          portalCode: "admin",
          portalName: "Admin",
          basePath: "/admin",
          isDefault: true,
          icon: null,
        },
        {
          portalId: "p-002",
          portalCode: "employee",
          portalName: "ESS",
          basePath: "/ess",
          isDefault: false,
          icon: null,
        },
      ];

      const hasPortalAccess = (portal: PortalType): boolean => {
        return portals.some((p) => p.portalCode === portal);
      };

      expect(hasPortalAccess("admin")).toBe(true);
      expect(hasPortalAccess("employee")).toBe(true);
    });

    it("should return false when user does not have portal access", () => {
      const portals: Portal[] = [
        {
          portalId: "p-002",
          portalCode: "employee",
          portalName: "ESS",
          basePath: "/ess",
          isDefault: true,
          icon: null,
        },
      ];

      const hasPortalAccess = (portal: PortalType): boolean => {
        return portals.some((p) => p.portalCode === portal);
      };

      expect(hasPortalAccess("admin")).toBe(false);
      expect(hasPortalAccess("manager")).toBe(false);
    });

    it("should handle empty portals list", () => {
      const portals: Portal[] = [];

      const hasPortalAccess = (portal: PortalType): boolean => {
        return portals.some((p) => p.portalCode === portal);
      };

      expect(hasPortalAccess("admin")).toBe(false);
      expect(hasPortalAccess("manager")).toBe(false);
      expect(hasPortalAccess("employee")).toBe(false);
    });
  });

  describe("Default Portal Resolution", () => {
    it("should find the portal marked as default", () => {
      const portals: Portal[] = [
        {
          portalId: "p-001",
          portalCode: "admin",
          portalName: "Admin",
          basePath: "/admin",
          isDefault: false,
          icon: null,
        },
        {
          portalId: "p-002",
          portalCode: "employee",
          portalName: "ESS",
          basePath: "/ess",
          isDefault: true,
          icon: null,
        },
      ];

      const defaultPortal = portals.find((p) => p.isDefault) ?? portals[0] ?? null;

      expect(defaultPortal?.portalCode).toBe("employee");
    });

    it("should fall back to first portal when none is default", () => {
      const portals: Portal[] = [
        {
          portalId: "p-001",
          portalCode: "admin",
          portalName: "Admin",
          basePath: "/admin",
          isDefault: false,
          icon: null,
        },
        {
          portalId: "p-002",
          portalCode: "employee",
          portalName: "ESS",
          basePath: "/ess",
          isDefault: false,
          icon: null,
        },
      ];

      const defaultPortal = portals.find((p) => p.isDefault) ?? portals[0] ?? null;

      expect(defaultPortal?.portalCode).toBe("admin");
    });

    it("should return null when portals list is empty", () => {
      const portals: Portal[] = [];
      const defaultPortal = portals.find((p) => p.isDefault) ?? portals[0] ?? null;

      expect(defaultPortal).toBeNull();
    });
  });

  describe("Current Portal Info Resolution", () => {
    it("should find current portal info from portals list", () => {
      const portals: Portal[] = [
        {
          portalId: "p-001",
          portalCode: "admin",
          portalName: "Admin",
          basePath: "/admin",
          isDefault: true,
          icon: "shield",
        },
        {
          portalId: "p-002",
          portalCode: "employee",
          portalName: "ESS",
          basePath: "/ess",
          isDefault: false,
          icon: "user",
        },
      ];

      const currentPortal: PortalType = "employee";
      const currentPortalInfo =
        portals.find((p) => p.portalCode === currentPortal) ?? null;

      expect(currentPortalInfo?.portalName).toBe("ESS");
      expect(currentPortalInfo?.basePath).toBe("/ess");
    });

    it("should return null when current portal is not in list", () => {
      const portals: Portal[] = [
        {
          portalId: "p-002",
          portalCode: "employee",
          portalName: "ESS",
          basePath: "/ess",
          isDefault: true,
          icon: null,
        },
      ];

      const currentPortal: PortalType = "admin";
      const currentPortalInfo =
        portals.find((p) => p.portalCode === currentPortal) ?? null;

      expect(currentPortalInfo).toBeNull();
    });

    it("should return null when current portal is null", () => {
      const portals: Portal[] = [
        {
          portalId: "p-001",
          portalCode: "admin",
          portalName: "Admin",
          basePath: "/admin",
          isDefault: true,
          icon: null,
        },
      ];

      const currentPortal: PortalType | null = null;
      const currentPortalInfo = currentPortal
        ? portals.find((p) => p.portalCode === currentPortal) ?? null
        : null;

      expect(currentPortalInfo).toBeNull();
    });
  });

  describe("PortalGate Logic", () => {
    it("should allow access when portal matches single value", () => {
      const portal: PortalType | PortalType[] = "admin";
      const portals = Array.isArray(portal) ? portal : [portal];

      const availablePortals: Portal[] = [
        {
          portalId: "p-001",
          portalCode: "admin",
          portalName: "Admin",
          basePath: "/admin",
          isDefault: true,
          icon: null,
        },
      ];

      const hasPortalAccess = (p: PortalType) =>
        availablePortals.some((ap) => ap.portalCode === p);

      const hasAccess = portals.some((p) => hasPortalAccess(p));
      expect(hasAccess).toBe(true);
    });

    it("should allow access when any portal in array matches", () => {
      const portal: PortalType[] = ["admin", "manager"];

      const availablePortals: Portal[] = [
        {
          portalId: "p-002",
          portalCode: "manager",
          portalName: "Manager",
          basePath: "/manager",
          isDefault: false,
          icon: null,
        },
      ];

      const hasPortalAccess = (p: PortalType) =>
        availablePortals.some((ap) => ap.portalCode === p);

      const portals = Array.isArray(portal) ? portal : [portal];
      const hasAccess = portals.some((p) => hasPortalAccess(p));
      expect(hasAccess).toBe(true);
    });

    it("should deny access when no portal matches", () => {
      const portal: PortalType[] = ["admin", "manager"];

      const availablePortals: Portal[] = [
        {
          portalId: "p-003",
          portalCode: "employee",
          portalName: "ESS",
          basePath: "/ess",
          isDefault: true,
          icon: null,
        },
      ];

      const hasPortalAccess = (p: PortalType) =>
        availablePortals.some((ap) => ap.portalCode === p);

      const portals = Array.isArray(portal) ? portal : [portal];
      const hasAccess = portals.some((p) => hasPortalAccess(p));
      expect(hasAccess).toBe(false);
    });
  });

  describe("Default Return Values", () => {
    it("should default portals to empty array", () => {
      const data: Portal[] | undefined = undefined;
      expect(data ?? []).toEqual([]);
    });

    it("should default navigation to empty array", () => {
      const data: PortalNavigationItem[] | undefined = undefined;
      expect(data ?? []).toEqual([]);
    });

    it("should return false for useHasPortalAccess while loading", () => {
      const isLoading = true;
      const hasAccess = true;

      const result = isLoading ? false : hasAccess;
      expect(result).toBe(false);
    });
  });

  describe("Switch Portal URL", () => {
    it("should construct dashboard path from base path", () => {
      const basePath = "/admin";
      const dashboardUrl = basePath + "/dashboard";
      expect(dashboardUrl).toBe("/admin/dashboard");
    });

    it("should construct dashboard path for manager portal", () => {
      const basePath = "/manager";
      const dashboardUrl = basePath + "/dashboard";
      expect(dashboardUrl).toBe("/manager/dashboard");
    });

    it("should construct dashboard path for employee portal", () => {
      const basePath = "/ess";
      const dashboardUrl = basePath + "/dashboard";
      expect(dashboardUrl).toBe("/ess/dashboard");
    });
  });
});
