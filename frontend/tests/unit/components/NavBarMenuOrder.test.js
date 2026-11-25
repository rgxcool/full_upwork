import { describe, it, expect, vi } from "vitest";
import { shallowMount } from "@vue/test-utils";
import NavBar from "@/components/NavBar.vue";
import { userCanAccess } from "@/store/store.js";
import { buildRouter, buildStore } from "../../helpers/render.js";

vi.mock("@/api/client.js", () => ({
    default: {
        get: vi.fn(() => Promise.resolve({ data: [] })),
        post: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
    },
}));

const mountAs = (roles) => {
    const user = { _id: "u1", name: "Test User", role: roles[0], roles };
    const store = buildStore({
        state: { user, role: roles[0] },
        getters: {
            isLoggedIn: true,
            userRole: roles[0],
            userRoles: roles,
            userId: "u1",
            isAdmin: roles.includes("admin"),
            canAccess: (state) => (meta) => userCanAccess(state.user, meta),
        },
    });
    return shallowMount(NavBar, {
        global: { plugins: [store, buildRouter()] },
    });
};

describe("NavBar hamburger menu", () => {
    it.each([["admin"], ["teacher"]])(
        "pins Översikt on top and lists the other %s entries (grouped or flat)",
        (role) => {
            const wrapper = mountAs([role]);
            const first = wrapper.vm.filteredMenuItems[0].name;
            expect(first).toBe("Översikt");
            const rest = wrapper.vm.filteredMenuItems.slice(1);
            expect(rest.length).toBeGreaterThan(1);
            // Verify Swedish alphabetical order
            expect(rest).toEqual([...rest].sort((a, b) => a.name.localeCompare(b.name, "sv")));
        }
    );

    it("student gets flat list with Översikt on top", () => {
        const wrapper = mountAs(["student"]);
        const first = wrapper.vm.filteredMenuItems[0].name;
        expect(first).toBe("Översikt");
        const rest = wrapper.vm.filteredMenuItems.slice(1);
        expect(rest.length).toBeGreaterThan(1);
        // Student items should be sorted in Swedish
        expect(rest).toEqual([...rest].sort((a, b) => a.name.localeCompare(b.name, "sv")));
    });

    it("shows Prövningar to students in the main menu", () => {
        const wrapper = mountAs(["student"]);
        const item = wrapper.vm.filteredMenuItems.find(
            (i) => i.link === "/examform"
        );
        expect(item?.name).toBe("Prövningar");
        expect(wrapper.vm.secretMenuItems).toHaveLength(0);
    });

    it("names the course-card overview 'Kurskort'", () => {
        const items = mountAs(["admin"]).vm.filteredMenuItems;
        const overview = items.find((i) => i.link === "/course-cards/overview");
        expect(overview?.name).toBe("Kurskort");
        expect(items.some((i) => i.name === "Alla kurskort")).toBe(false);
    });
});