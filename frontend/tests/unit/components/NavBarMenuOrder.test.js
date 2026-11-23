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

vi.mock("@/composables/useToast.js", () => ({
    useToast: () => ({
        success: vi.fn(),
        error: vi.fn(),
        warning: vi.fn(),
        info: vi.fn(),
    }),
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

const names = (wrapper) => wrapper.vm.filteredMenuItems.map((i) => i.name);
const swedishSorted = (list) =>
    [...list].sort((a, b) => a.localeCompare(b, "sv"));

describe("NavBar hamburger menu", () => {
    it.each([["admin"], ["teacher"], ["student"]])(
        "pins Översikt on top and lists the other %s entries in Swedish alphabetical order",
        (role) => {
            const [first, ...rest] = names(mountAs([role]));
            expect(first).toBe("Översikt");
            expect(rest.length).toBeGreaterThan(1);
            expect(rest).toEqual(swedishSorted(rest));
        }
    );

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
