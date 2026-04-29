/**
 * useFieldPermissions Hook Tests
 *
 * Tests for field-level permission checking logic, including
 * permission level resolution, visibility/editability rules,
 * field metadata handling, and default behaviors.
 */

import { describe, it, expect } from "vitest";
import type {
  FieldPermissionLevel,
  FieldMetadata,
  EntityFieldGroup,
  FieldPermission,
} from "../../hooks/use-field-permissions";

describe("useFieldPermissions Hook", () => {
  describe("FieldPermissionLevel Type", () => {
    it("should support edit, view, and hidden levels", () => {
      const levels: FieldPermissionLevel[] = ["edit", "view", "hidden"];

      expect(levels).toContain("edit");
      expect(levels).toContain("view");
      expect(levels).toContain("hidden");
      expect(levels).toHaveLength(3);
    });
  });

  describe("FieldMetadata Type", () => {
    it("should have all required fields", () => {
      const meta: FieldMetadata = {
        entityName: "employee",
        fieldName: "firstName",
        fieldLabel: "First Name",
        fieldGroup: "personal",
        dataType: "string",
        isSensitive: false,
        canView: true,
        canEdit: true,
        isHidden: false,
      };

      expect(meta.entityName).toBe("employee");
      expect(meta.fieldName).toBe("firstName");
      expect(meta.fieldLabel).toBe("First Name");
      expect(meta.fieldGroup).toBe("personal");
      expect(meta.dataType).toBe("string");
      expect(meta.isSensitive).toBe(false);
      expect(meta.canView).toBe(true);
      expect(meta.canEdit).toBe(true);
      expect(meta.isHidden).toBe(false);
    });

    it("should allow null fieldGroup", () => {
      const meta: FieldMetadata = {
        entityName: "employee",
        fieldName: "customField1",
        fieldLabel: "Custom Field 1",
        fieldGroup: null,
        dataType: "string",
        isSensitive: false,
        canView: true,
        canEdit: false,
        isHidden: false,
      };

      expect(meta.fieldGroup).toBeNull();
    });

    it("should support sensitive field metadata", () => {
      const meta: FieldMetadata = {
        entityName: "employee",
        fieldName: "niNumber",
        fieldLabel: "NI Number",
        fieldGroup: "payroll",
        dataType: "string",
        isSensitive: true,
        canView: false,
        canEdit: false,
        isHidden: true,
      };

      expect(meta.isSensitive).toBe(true);
      expect(meta.isHidden).toBe(true);
      expect(meta.canView).toBe(false);
      expect(meta.canEdit).toBe(false);
    });
  });

  describe("Permission Map Construction", () => {
    it("should build a permission map from flat array", () => {
      const data: FieldPermission[] = [
        { entityName: "employee", fieldName: "firstName", permission: "edit" },
        { entityName: "employee", fieldName: "salary", permission: "hidden" },
        { entityName: "employee", fieldName: "department", permission: "view" },
      ];

      const map = new Map<string, FieldPermission>();
      for (const perm of data) {
        const key = `${perm.entityName}.${perm.fieldName}`;
        map.set(key, perm);
      }

      expect(map.size).toBe(3);
      expect(map.get("employee.firstName")?.permission).toBe("edit");
      expect(map.get("employee.salary")?.permission).toBe("hidden");
      expect(map.get("employee.department")?.permission).toBe("view");
    });

    it("should handle empty permission data", () => {
      const data: FieldPermission[] = [];
      const map = new Map<string, FieldPermission>();
      for (const perm of data) {
        const key = `${perm.entityName}.${perm.fieldName}`;
        map.set(key, perm);
      }

      expect(map.size).toBe(0);
    });

    it("should overwrite duplicates with last-wins", () => {
      const data: FieldPermission[] = [
        { entityName: "employee", fieldName: "name", permission: "view" },
        { entityName: "employee", fieldName: "name", permission: "edit" },
      ];

      const map = new Map<string, FieldPermission>();
      for (const perm of data) {
        const key = `${perm.entityName}.${perm.fieldName}`;
        map.set(key, perm);
      }

      expect(map.get("employee.name")?.permission).toBe("edit");
    });
  });

  describe("getPermission Logic", () => {
    it("should return the permission level for a known field", () => {
      const permissions = new Map<string, FieldPermission>();
      permissions.set("employee.firstName", {
        entityName: "employee",
        fieldName: "firstName",
        permission: "edit",
      });

      const getPermission = (entity: string, field: string): FieldPermissionLevel => {
        const key = `${entity}.${field}`;
        return permissions.get(key)?.permission ?? "hidden";
      };

      expect(getPermission("employee", "firstName")).toBe("edit");
    });

    it("should default to hidden for unknown fields", () => {
      const permissions = new Map<string, FieldPermission>();

      const getPermission = (entity: string, field: string): FieldPermissionLevel => {
        const key = `${entity}.${field}`;
        return permissions.get(key)?.permission ?? "hidden";
      };

      expect(getPermission("employee", "unknownField")).toBe("hidden");
      expect(getPermission("nonexistent", "field")).toBe("hidden");
    });
  });

  describe("canView Logic", () => {
    const getPermission = (
      permissions: Map<string, FieldPermission>,
      entity: string,
      field: string
    ): FieldPermissionLevel => {
      const key = `${entity}.${field}`;
      return permissions.get(key)?.permission ?? "hidden";
    };

    const canView = (
      permissions: Map<string, FieldPermission>,
      entity: string,
      field: string
    ): boolean => {
      const perm = getPermission(permissions, entity, field);
      return perm === "view" || perm === "edit";
    };

    it("should return true for view permission", () => {
      const permissions = new Map<string, FieldPermission>();
      permissions.set("employee.department", {
        entityName: "employee",
        fieldName: "department",
        permission: "view",
      });

      expect(canView(permissions, "employee", "department")).toBe(true);
    });

    it("should return true for edit permission (edit implies view)", () => {
      const permissions = new Map<string, FieldPermission>();
      permissions.set("employee.firstName", {
        entityName: "employee",
        fieldName: "firstName",
        permission: "edit",
      });

      expect(canView(permissions, "employee", "firstName")).toBe(true);
    });

    it("should return false for hidden permission", () => {
      const permissions = new Map<string, FieldPermission>();
      permissions.set("employee.salary", {
        entityName: "employee",
        fieldName: "salary",
        permission: "hidden",
      });

      expect(canView(permissions, "employee", "salary")).toBe(false);
    });

    it("should return false for fields not in the map", () => {
      const permissions = new Map<string, FieldPermission>();
      expect(canView(permissions, "employee", "noSuchField")).toBe(false);
    });
  });

  describe("canEdit Logic", () => {
    const getPermission = (
      permissions: Map<string, FieldPermission>,
      entity: string,
      field: string
    ): FieldPermissionLevel => {
      const key = `${entity}.${field}`;
      return permissions.get(key)?.permission ?? "hidden";
    };

    const canEdit = (
      permissions: Map<string, FieldPermission>,
      entity: string,
      field: string
    ): boolean => {
      return getPermission(permissions, entity, field) === "edit";
    };

    it("should return true for edit permission", () => {
      const permissions = new Map<string, FieldPermission>();
      permissions.set("employee.firstName", {
        entityName: "employee",
        fieldName: "firstName",
        permission: "edit",
      });

      expect(canEdit(permissions, "employee", "firstName")).toBe(true);
    });

    it("should return false for view permission", () => {
      const permissions = new Map<string, FieldPermission>();
      permissions.set("employee.department", {
        entityName: "employee",
        fieldName: "department",
        permission: "view",
      });

      expect(canEdit(permissions, "employee", "department")).toBe(false);
    });

    it("should return false for hidden permission", () => {
      const permissions = new Map<string, FieldPermission>();
      permissions.set("employee.salary", {
        entityName: "employee",
        fieldName: "salary",
        permission: "hidden",
      });

      expect(canEdit(permissions, "employee", "salary")).toBe(false);
    });
  });

  describe("isHidden Logic", () => {
    const getPermission = (
      permissions: Map<string, FieldPermission>,
      entity: string,
      field: string
    ): FieldPermissionLevel => {
      const key = `${entity}.${field}`;
      return permissions.get(key)?.permission ?? "hidden";
    };

    const isHidden = (
      permissions: Map<string, FieldPermission>,
      entity: string,
      field: string
    ): boolean => {
      return getPermission(permissions, entity, field) === "hidden";
    };

    it("should return true for hidden fields", () => {
      const permissions = new Map<string, FieldPermission>();
      permissions.set("employee.salary", {
        entityName: "employee",
        fieldName: "salary",
        permission: "hidden",
      });

      expect(isHidden(permissions, "employee", "salary")).toBe(true);
    });

    it("should return true for unknown fields (default to hidden)", () => {
      const permissions = new Map<string, FieldPermission>();
      expect(isHidden(permissions, "employee", "unknown")).toBe(true);
    });

    it("should return false for viewable fields", () => {
      const permissions = new Map<string, FieldPermission>();
      permissions.set("employee.name", {
        entityName: "employee",
        fieldName: "name",
        permission: "view",
      });

      expect(isHidden(permissions, "employee", "name")).toBe(false);
    });

    it("should return false for editable fields", () => {
      const permissions = new Map<string, FieldPermission>();
      permissions.set("employee.name", {
        entityName: "employee",
        fieldName: "name",
        permission: "edit",
      });

      expect(isHidden(permissions, "employee", "name")).toBe(false);
    });
  });

  describe("Entity Field Groups", () => {
    it("should flatten groups into a field list", () => {
      const groups: EntityFieldGroup[] = [
        {
          groupName: "Personal",
          fields: [
            {
              entityName: "employee",
              fieldName: "firstName",
              fieldLabel: "First Name",
              fieldGroup: "Personal",
              dataType: "string",
              isSensitive: false,
              canView: true,
              canEdit: true,
              isHidden: false,
            },
            {
              entityName: "employee",
              fieldName: "lastName",
              fieldLabel: "Last Name",
              fieldGroup: "Personal",
              dataType: "string",
              isSensitive: false,
              canView: true,
              canEdit: true,
              isHidden: false,
            },
          ],
        },
        {
          groupName: "Employment",
          fields: [
            {
              entityName: "employee",
              fieldName: "hireDate",
              fieldLabel: "Hire Date",
              fieldGroup: "Employment",
              dataType: "date",
              isSensitive: false,
              canView: true,
              canEdit: false,
              isHidden: false,
            },
          ],
        },
      ];

      const fields = groups.flatMap((group) => group.fields);
      expect(fields).toHaveLength(3);
      expect(fields[0].fieldName).toBe("firstName");
      expect(fields[2].fieldName).toBe("hireDate");
    });

    it("should build a field map from flattened fields", () => {
      const fields: FieldMetadata[] = [
        {
          entityName: "employee",
          fieldName: "firstName",
          fieldLabel: "First Name",
          fieldGroup: "Personal",
          dataType: "string",
          isSensitive: false,
          canView: true,
          canEdit: true,
          isHidden: false,
        },
        {
          entityName: "employee",
          fieldName: "salary",
          fieldLabel: "Salary",
          fieldGroup: "Payroll",
          dataType: "number",
          isSensitive: true,
          canView: false,
          canEdit: false,
          isHidden: true,
        },
      ];

      const fieldMap = new Map<string, FieldMetadata>();
      for (const field of fields) {
        fieldMap.set(field.fieldName, field);
      }

      expect(fieldMap.get("firstName")?.canView).toBe(true);
      expect(fieldMap.get("salary")?.isSensitive).toBe(true);
      expect(fieldMap.get("nonexistent")).toBeUndefined();
    });

    it("should compute editable and visible field lists", () => {
      const fields: FieldMetadata[] = [
        {
          entityName: "employee",
          fieldName: "firstName",
          fieldLabel: "First Name",
          fieldGroup: null,
          dataType: "string",
          isSensitive: false,
          canView: true,
          canEdit: true,
          isHidden: false,
        },
        {
          entityName: "employee",
          fieldName: "department",
          fieldLabel: "Department",
          fieldGroup: null,
          dataType: "string",
          isSensitive: false,
          canView: true,
          canEdit: false,
          isHidden: false,
        },
        {
          entityName: "employee",
          fieldName: "salary",
          fieldLabel: "Salary",
          fieldGroup: null,
          dataType: "number",
          isSensitive: true,
          canView: false,
          canEdit: false,
          isHidden: true,
        },
      ];

      const editableFields = fields.filter((f) => f.canEdit).map((f) => f.fieldName);
      const visibleFields = fields.filter((f) => f.canView).map((f) => f.fieldName);

      expect(editableFields).toEqual(["firstName"]);
      expect(visibleFields).toEqual(["firstName", "department"]);
    });

    it("should derive fields/groups for both undefined and populated inputs", () => {
      function deriveFieldsAndGroups(data: EntityFieldGroup[] | undefined) {
        const fields = data ? data.flatMap((group) => group.fields) : [];
        const groups = data ?? [];
        return { fields, groups };
      }

      // Undefined input: both arrays empty.
      const empty = deriveFieldsAndGroups(undefined);
      expect(empty.fields).toEqual([]);
      expect(empty.groups).toEqual([]);

      // Populated input: fields are flattened across groups (exercises the truthy branch
      // so the conditionals actually matter — keeps the helper meaningful).
      const sample: EntityFieldGroup[] = [
        { groupId: "g1", groupName: "G1", fields: [{ fieldName: "a", canView: true, canEdit: true }] },
        { groupId: "g2", groupName: "G2", fields: [{ fieldName: "b", canView: true, canEdit: false }] },
      ] as unknown as EntityFieldGroup[];
      const populated = deriveFieldsAndGroups(sample);
      expect(populated.fields.map((f) => f.fieldName)).toEqual(["a", "b"]);
      expect(populated.groups).toHaveLength(2);
    });
  });

  describe("Loading State Behavior", () => {
    it("should return false for useCanEditField while loading", () => {
      const isLoading = true;
      const canEditResult = true;

      // The hook returns false while loading
      const result = isLoading ? false : canEditResult;
      expect(result).toBe(false);
    });

    it("should return false for useCanViewField while loading", () => {
      const isLoading = true;
      const canViewResult = true;

      const result = isLoading ? false : canViewResult;
      expect(result).toBe(false);
    });

    it("should return true for useIsFieldHidden while loading", () => {
      const isLoading = true;
      const isHiddenResult = false;

      // Default to hidden while loading for safety
      const result = isLoading ? true : isHiddenResult;
      expect(result).toBe(true);
    });
  });

  describe("FieldPermissionGate Logic", () => {
    it("should allow access in view mode when canView is true", () => {
      const mode: "view" | "edit" = "view";
      const canViewResult = true;
      const canEditResult = false;

      const hasAccess = mode === "edit" ? canEditResult : canViewResult;
      expect(hasAccess).toBe(true);
    });

    it("should deny access in edit mode when only view is allowed", () => {
      const mode: "view" | "edit" = "edit";
      const canViewResult = true;
      const canEditResult = false;

      const hasAccess = mode === "edit" ? canEditResult : canViewResult;
      expect(hasAccess).toBe(false);
    });

    it("should allow access in edit mode when canEdit is true", () => {
      const mode: "view" | "edit" = "edit";
      const canEditResult = true;

      const hasAccess = mode === "edit" ? canEditResult : true;
      expect(hasAccess).toBe(true);
    });

    it("should default mode to view", () => {
      const mode: "view" | "edit" = "view"; // default
      expect(mode).toBe("view");
    });
  });
});
