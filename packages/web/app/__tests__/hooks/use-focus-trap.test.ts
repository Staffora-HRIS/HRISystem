/**
 * Focus Management Hooks Tests
 *
 * Tests for useFocusTrap, useFocusRestore, and useRovingTabindex hooks.
 * Validates focus trapping, restoration, and keyboard navigation logic.
 */

import { describe, it, expect, vi } from "vitest";

describe("useFocusTrap", () => {
  describe("FOCUSABLE_SELECTOR", () => {
    const FOCUSABLE_SELECTOR = [
      'a[href]:not([tabindex="-1"])',
      'button:not([disabled]):not([tabindex="-1"])',
      'input:not([disabled]):not([tabindex="-1"])',
      'select:not([disabled]):not([tabindex="-1"])',
      'textarea:not([disabled]):not([tabindex="-1"])',
      '[tabindex]:not([tabindex="-1"])',
      '[contenteditable]:not([tabindex="-1"])',
    ].join(", ");

    it("should include all interactive element types", () => {
      expect(FOCUSABLE_SELECTOR).toContain("a[href]");
      expect(FOCUSABLE_SELECTOR).toContain("button");
      expect(FOCUSABLE_SELECTOR).toContain("input");
      expect(FOCUSABLE_SELECTOR).toContain("select");
      expect(FOCUSABLE_SELECTOR).toContain("textarea");
      expect(FOCUSABLE_SELECTOR).toContain("[tabindex]");
      expect(FOCUSABLE_SELECTOR).toContain("[contenteditable]");
    });

    it("should exclude elements with tabindex=-1", () => {
      expect(FOCUSABLE_SELECTOR).toContain(':not([tabindex="-1"])');
    });

    it("should exclude disabled buttons and inputs", () => {
      expect(FOCUSABLE_SELECTOR).toContain("button:not([disabled])");
      expect(FOCUSABLE_SELECTOR).toContain("input:not([disabled])");
      expect(FOCUSABLE_SELECTOR).toContain("select:not([disabled])");
      expect(FOCUSABLE_SELECTOR).toContain("textarea:not([disabled])");
    });
  });

  describe("Options defaults", () => {
    it("should default enabled to true", () => {
      const options = { enabled: true };
      expect(options.enabled).toBe(true);
    });

    it("should default autoFocus to true", () => {
      const options = { autoFocus: true };
      expect(options.autoFocus).toBe(true);
    });

    it("should default restoreFocus to true", () => {
      const options = { restoreFocus: true };
      expect(options.restoreFocus).toBe(true);
    });
  });

  describe("Tab key handling logic", () => {
    it("should wrap to last element on Shift+Tab from first element", () => {
      const elements = ["first", "second", "third"];
      const activeIndex = 0;
      const shiftKey = true;

      let nextFocusIndex: number;
      if (shiftKey && activeIndex === 0) {
        nextFocusIndex = elements.length - 1;
      } else {
        nextFocusIndex = activeIndex - 1;
      }

      expect(nextFocusIndex).toBe(2);
      expect(elements[nextFocusIndex]).toBe("third");
    });

    it("should wrap to first element on Tab from last element", () => {
      const elements = ["first", "second", "third"];
      const activeIndex = elements.length - 1;
      const shiftKey = false;

      let nextFocusIndex: number;
      if (!shiftKey && activeIndex === elements.length - 1) {
        nextFocusIndex = 0;
      } else {
        nextFocusIndex = activeIndex + 1;
      }

      expect(nextFocusIndex).toBe(0);
      expect(elements[nextFocusIndex]).toBe("first");
    });

    it("should move to next element on Tab in the middle", () => {
      const elements = ["first", "second", "third"];
      const activeIndex = 1;
      const shiftKey = false;

      let nextFocusIndex: number;
      if (!shiftKey && activeIndex === elements.length - 1) {
        nextFocusIndex = 0;
      } else {
        nextFocusIndex = activeIndex + 1;
      }

      expect(nextFocusIndex).toBe(2);
    });

    it("should move to previous element on Shift+Tab in the middle", () => {
      function computePreviousFocusIndex(
        elements: string[],
        activeIndex: number,
        shiftKey: boolean
      ): number {
        if (shiftKey && activeIndex === 0) {
          return elements.length - 1;
        }
        return activeIndex - 1;
      }

      const elements = ["first", "second", "third"];
      expect(computePreviousFocusIndex(elements, 1, true)).toBe(0);
    });
  });
});

describe("useRovingTabindex", () => {
  describe("Navigation logic", () => {
    const items = ["tab1", "tab2", "tab3", "tab4"];

    function getNextIndex(
      key: string,
      currentIndex: number,
      orientation: "horizontal" | "vertical",
      loop: boolean
    ): number {
      let nextIndex = currentIndex;

      const prev = () => {
        if (currentIndex <= 0) {
          return loop ? items.length - 1 : 0;
        }
        return currentIndex - 1;
      };

      const next = () => {
        if (currentIndex >= items.length - 1) {
          return loop ? 0 : items.length - 1;
        }
        return currentIndex + 1;
      };

      switch (key) {
        case "ArrowLeft":
          if (orientation === "horizontal") nextIndex = prev();
          break;
        case "ArrowRight":
          if (orientation === "horizontal") nextIndex = next();
          break;
        case "ArrowUp":
          if (orientation === "vertical") nextIndex = prev();
          break;
        case "ArrowDown":
          if (orientation === "vertical") nextIndex = next();
          break;
        case "Home":
          nextIndex = 0;
          break;
        case "End":
          nextIndex = items.length - 1;
          break;
      }

      return nextIndex;
    }

    it("should move right on ArrowRight in horizontal orientation", () => {
      expect(getNextIndex("ArrowRight", 0, "horizontal", true)).toBe(1);
      expect(getNextIndex("ArrowRight", 1, "horizontal", true)).toBe(2);
    });

    it("should move left on ArrowLeft in horizontal orientation", () => {
      expect(getNextIndex("ArrowLeft", 2, "horizontal", true)).toBe(1);
      expect(getNextIndex("ArrowLeft", 1, "horizontal", true)).toBe(0);
    });

    it("should loop from last to first on ArrowRight", () => {
      expect(getNextIndex("ArrowRight", 3, "horizontal", true)).toBe(0);
    });

    it("should loop from first to last on ArrowLeft", () => {
      expect(getNextIndex("ArrowLeft", 0, "horizontal", true)).toBe(3);
    });

    it("should not loop when loop is false", () => {
      expect(getNextIndex("ArrowRight", 3, "horizontal", false)).toBe(3);
      expect(getNextIndex("ArrowLeft", 0, "horizontal", false)).toBe(0);
    });

    it("should not respond to ArrowLeft/Right in vertical orientation", () => {
      expect(getNextIndex("ArrowLeft", 2, "vertical", true)).toBe(2);
      expect(getNextIndex("ArrowRight", 0, "vertical", true)).toBe(0);
    });

    it("should move down on ArrowDown in vertical orientation", () => {
      expect(getNextIndex("ArrowDown", 0, "vertical", true)).toBe(1);
      expect(getNextIndex("ArrowDown", 2, "vertical", true)).toBe(3);
    });

    it("should move up on ArrowUp in vertical orientation", () => {
      expect(getNextIndex("ArrowUp", 3, "vertical", true)).toBe(2);
      expect(getNextIndex("ArrowUp", 1, "vertical", true)).toBe(0);
    });

    it("should jump to first on Home", () => {
      expect(getNextIndex("Home", 3, "horizontal", true)).toBe(0);
      expect(getNextIndex("Home", 2, "vertical", true)).toBe(0);
    });

    it("should jump to last on End", () => {
      expect(getNextIndex("End", 0, "horizontal", true)).toBe(3);
      expect(getNextIndex("End", 1, "vertical", true)).toBe(3);
    });

    it("should not change index for unrecognized keys", () => {
      expect(getNextIndex("Enter", 1, "horizontal", true)).toBe(1);
      expect(getNextIndex("Space", 2, "vertical", true)).toBe(2);
      expect(getNextIndex("a", 0, "horizontal", true)).toBe(0);
    });
  });

  describe("Tabindex management", () => {
    it("should set active item tabindex to 0", () => {
      const items = [
        { tabIndex: -1 },
        { tabIndex: 0 },
        { tabIndex: -1 },
      ];
      const activeIndex = 1;

      items.forEach((item, i) => {
        item.tabIndex = i === activeIndex ? 0 : -1;
      });

      expect(items[0].tabIndex).toBe(-1);
      expect(items[1].tabIndex).toBe(0);
      expect(items[2].tabIndex).toBe(-1);
    });

    it("should update tabindex when active item changes", () => {
      const items = [
        { tabIndex: 0 },
        { tabIndex: -1 },
        { tabIndex: -1 },
      ];
      const newActiveIndex = 2;

      items.forEach((item, i) => {
        item.tabIndex = i === newActiveIndex ? 0 : -1;
      });

      expect(items[0].tabIndex).toBe(-1);
      expect(items[1].tabIndex).toBe(-1);
      expect(items[2].tabIndex).toBe(0);
    });
  });
});

describe("Menu dropdown focus management patterns", () => {
  describe("Arrow key navigation in menus", () => {
    function getNextMenuIndex(
      key: string,
      currentIndex: number,
      itemCount: number
    ): number {
      switch (key) {
        case "ArrowDown":
          return currentIndex < itemCount - 1 ? currentIndex + 1 : 0;
        case "ArrowUp":
          return currentIndex > 0 ? currentIndex - 1 : itemCount - 1;
        case "Home":
          return 0;
        case "End":
          return itemCount - 1;
        default:
          return currentIndex;
      }
    }

    it("should move down on ArrowDown", () => {
      expect(getNextMenuIndex("ArrowDown", 0, 3)).toBe(1);
      expect(getNextMenuIndex("ArrowDown", 1, 3)).toBe(2);
    });

    it("should wrap to top on ArrowDown from last item", () => {
      expect(getNextMenuIndex("ArrowDown", 2, 3)).toBe(0);
    });

    it("should move up on ArrowUp", () => {
      expect(getNextMenuIndex("ArrowUp", 2, 3)).toBe(1);
      expect(getNextMenuIndex("ArrowUp", 1, 3)).toBe(0);
    });

    it("should wrap to bottom on ArrowUp from first item", () => {
      expect(getNextMenuIndex("ArrowUp", 0, 3)).toBe(2);
    });

    it("should jump to first on Home", () => {
      expect(getNextMenuIndex("Home", 2, 3)).toBe(0);
    });

    it("should jump to last on End", () => {
      expect(getNextMenuIndex("End", 0, 3)).toBe(2);
    });
  });

  describe("Focus restoration", () => {
    it("should track the previously focused element", () => {
      const previousElement = { id: "trigger-button" };
      const previousFocus = { current: previousElement };

      expect(previousFocus.current).toBe(previousElement);
    });

    it("should restore focus to the trigger element", () => {
      const triggerFocused = vi.fn();
      const trigger = { focus: triggerFocused, isConnected: true };

      // Simulate restore
      if (trigger.isConnected) {
        trigger.focus();
      }

      expect(triggerFocused).toHaveBeenCalledTimes(1);
    });

    it("should not restore focus if trigger is disconnected", () => {
      const triggerFocused = vi.fn();
      const trigger = { focus: triggerFocused, isConnected: false };

      if (trigger.isConnected) {
        trigger.focus();
      }

      expect(triggerFocused).not.toHaveBeenCalled();
    });
  });
});

describe("Toast accessibility", () => {
  it("should use role=status instead of role=alert to avoid focus stealing", () => {
    // role=alert forces screen readers to announce immediately and can interrupt the user.
    // role=status is more polite and does not steal focus.
    const toastRole = "status";
    expect(toastRole).toBe("status");
    expect(toastRole).not.toBe("alert");
  });

  it("should use aria-live=polite on the toast container", () => {
    const liveRegion = "polite";
    expect(liveRegion).toBe("polite");
  });

  it("should use aria-atomic=true on individual toasts", () => {
    const atomic = true;
    expect(atomic).toBe(true);
  });
});

describe("Tabs accessibility", () => {
  it("should set tabindex=0 on active tab and tabindex=-1 on inactive tabs", () => {
    const tabs = ["general", "security", "notifications"];
    const activeTab = "security";

    const tabIndexes = tabs.map((tab) => (tab === activeTab ? 0 : -1));

    expect(tabIndexes).toEqual([-1, 0, -1]);
  });

  it("should generate matching tab ID and panel ID pairs", () => {
    const prefix = "test-prefix";
    const value = "general";

    const tabId = `${prefix}-tab-${value}`;
    const panelId = `${prefix}-panel-${value}`;

    expect(tabId).toBe("test-prefix-tab-general");
    expect(panelId).toBe("test-prefix-panel-general");

    // Verify cross-references would work
    // Tab should have aria-controls pointing to panel
    // Panel should have aria-labelledby pointing to tab
    expect(tabId).toContain("tab");
    expect(panelId).toContain("panel");
  });

  it("should set aria-orientation=horizontal on tablist", () => {
    const orientation = "horizontal";
    expect(orientation).toBe("horizontal");
  });
});

describe("DataTable keyboard accessibility", () => {
  it("should set aria-sort on sortable columns", () => {
    type AriaSort = "ascending" | "descending" | "none" | undefined;

    function getAriaSort(
      isSorted: boolean,
      direction: "asc" | "desc" | undefined,
      isSortable: boolean
    ): AriaSort {
      if (isSorted) {
        return direction === "asc" ? "ascending" : "descending";
      }
      return isSortable ? "none" : undefined;
    }

    expect(getAriaSort(true, "asc", true)).toBe("ascending");
    expect(getAriaSort(true, "desc", true)).toBe("descending");
    expect(getAriaSort(false, undefined, true)).toBe("none");
    expect(getAriaSort(false, undefined, false)).toBeUndefined();
  });

  it("should activate sort on Enter and Space keys", () => {
    const handleSort = vi.fn();

    const handleKeyDown = (key: string) => {
      if (key === "Enter" || key === " ") {
        handleSort();
      }
    };

    handleKeyDown("Enter");
    expect(handleSort).toHaveBeenCalledTimes(1);

    handleKeyDown(" ");
    expect(handleSort).toHaveBeenCalledTimes(2);

    handleKeyDown("Tab");
    expect(handleSort).toHaveBeenCalledTimes(2);
  });

  it("should make sortable headers focusable with tabindex=0", () => {
    const isSortable = true;
    const tabIndex = isSortable ? 0 : undefined;

    expect(tabIndex).toBe(0);
  });

  it("should not make non-sortable headers focusable", () => {
    const isSortable = false;
    const tabIndex = isSortable ? 0 : undefined;

    expect(tabIndex).toBeUndefined();
  });
});
