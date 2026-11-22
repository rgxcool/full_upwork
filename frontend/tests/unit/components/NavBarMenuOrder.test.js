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
        "lists %s entries in Swedish alphabetical order",
        (role) => {
            const list = names(mountAs([role]));
            expect(list.length).toBeGreaterThan(1);
            expect(list).toEqual(swedishSorted(list));
        }
    );

    it("puts Å/Ä/Ö after Z", () => {
        const list = names(mountAs(["admin"]));
        expect(list.at(-1)).toBe("Översikt");
    });

    it("names the course-card overview 'Kurskort'", () => {
        const items = mountAs(["admin"]).vm.filteredMenuItems;
        const overview = items.find((i) => i.link === "/course-cards/overview");
        expect(overview?.name).toBe("Kurskort");
        expect(items.some((i) => i.name === "Alla kurskort")).toBe(false);
    });
});
