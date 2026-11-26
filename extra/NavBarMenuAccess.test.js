// Place at: frontend/tests/unit/components/NavBarMenuAccess.test.js
// Place the golden file next to it: menu-access.golden.json
//
// The golden file was generated from the ORIGINAL flat menu (before grouping).
// It proves that grouping did not add, remove or duplicate any link for any role.
import { describe, it, expect } from "vitest";
import * as menuModule from "@/config/menuItems.js";
import { userCanAccess } from "@/store/store.js";
import golden from "./menu-access.golden.json";

const menuItems = menuModule.menuItems ?? menuModule.default;

const USERS = {
    student: ["student"],
    teacher: ["teacher"],
    syv: ["syv"],
    specped: ["specped"],
    coordinator: ["coordinator"],
    admin: ["admin"],
    systemadmin: ["systemadmin"],
    "teacher+student": ["teacher", "student"],
};

const visibleLinks = (roles) => {
    const user = { _id: "u1", role: roles[0], roles };
    return menuItems
        .filter((item) => userCanAccess(user, { role: item.role, feature: item.feature }))
        .map((item) => item.link);
};

describe("menuItems.js keeps the same access as the original menu", () => {
    it("has the same number of items as before", () => {
        expect(menuItems.length).toBe(golden.__totalItems);
    });

    it("has no duplicate links", () => {
        const links = menuItems.map((i) => i.link);
        expect(new Set(links).size).toBe(links.length);
    });

    it.each(Object.keys(USERS))("%s sees exactly the same links as before", (key) => {
        const now = [...new Set(visibleLinks(USERS[key]))].sort();
        expect(now).toEqual(golden[key]);
    });

    it("every item belongs to a group, except the pinned dashboard", () => {
        const missing = menuItems
            .filter((i) => i.link !== "/dashboard" && !i.group)
            .map((i) => i.name);
        // Items without a group fall into "Övrigt" in the UI. Keep this list empty
        // so that nothing relies on the fallback by accident.
        expect(missing).toEqual([]);
    });
});
