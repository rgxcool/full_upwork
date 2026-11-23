import { describe, it, expect, vi, beforeEach } from "vitest";
import { shallowMount, flushPromises } from "@vue/test-utils";
import NavBar from "@/components/NavBar.vue";
import client from "@/api/client.js";
import { buildRouter, buildStore } from "../../helpers/render.js";

vi.mock("@/api/client.js", () => ({
    default: {
        get: vi.fn(),
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

const DatePickerStub = {
    name: "DatePicker",
    props: ["modelValue", "format", "placeholder"],
    emits: ["update:modelValue", "change"],
    template: '<div class="date-picker-stub" />',
};

const searchCalls = () =>
    client.get.mock.calls
        .map(([url]) => url)
        .filter((url) => url.startsWith("/search"));

const mountNavBar = () => {
    const store = buildStore({
        getters: {
            isLoggedIn: true,
            userRole: "teacher",
            userRoles: ["teacher"],
            userId: "user-1",
            isAdmin: false,
            hasPermission: (roles) =>
                Array.isArray(roles)
                    ? roles.includes("teacher")
                    : roles === "teacher",
        },
    });

    return shallowMount(NavBar, {
        global: {
            plugins: [store, buildRouter()],
            stubs: { DatePicker: DatePickerStub },
        },
    });
};

describe("NavBar date search", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        client.get.mockImplementation((url) => {
            if (url === "/notifications") {
                return Promise.resolve({ data: [] });
            }
            if (url.startsWith("/search")) {
                return Promise.resolve({ data: [] });
            }
            return Promise.resolve({ data: [] });
        });
    });

    it("sends the calendar date selected in the picker, not the UTC date", async () => {
        const wrapper = mountNavBar();

        wrapper.vm.selectSearchType("Datum");
        await flushPromises();

        const picker = wrapper.findComponent(DatePickerStub);
        expect(picker.exists()).toBe(true);

        await picker.vm.$emit("update:modelValue", new Date(2026, 2, 15));
        await flushPromises();

        expect(searchCalls()).toContain("/search?type=Datum&date=2026-03-15");
        expect(searchCalls().some((url) => url.includes("2026-03-14"))).toBe(
            false
        );
    });

    it("normalizes a typed Swedish date in 'Alla' mode", async () => {
        const wrapper = mountNavBar();

        wrapper.vm.searchQuery = "17/11/2026";
        await wrapper.vm.handleSearch();
        await flushPromises();

        expect(searchCalls()).toContain("/search?type=Datum&date=2026-11-17");
    });

    it("shows an error for a partial date typed in 'Alla' mode", async () => {
        const wrapper = mountNavBar();

        wrapper.vm.searchQuery = "2026-11";
        await wrapper.vm.handleSearch();
        await flushPromises();

        expect(wrapper.text()).toContain("Använd ett fullständigt datum");
        expect(searchCalls()).toHaveLength(0);
    });

    it("shows an error instead of searching when the date is invalid", async () => {
        const wrapper = mountNavBar();

        wrapper.vm.selectSearchType("Datum");
        await flushPromises();

        const picker = wrapper.findComponent(DatePickerStub);
        await picker.vm.$emit("update:modelValue", "not-a-date");
        await flushPromises();

        expect(wrapper.text()).toContain("Ogiltigt datum");
        expect(searchCalls()).toHaveLength(0);
    });

    it("shows the backend error message when the search request fails", async () => {
        const wrapper = mountNavBar();

        client.get.mockImplementation((url) => {
            if (url === "/notifications") {
                return Promise.resolve({ data: [] });
            }
            return Promise.reject({
                response: { data: { message: "Ogiltigt datum" } },
            });
        });

        wrapper.vm.selectSearchType("Datum");
        await flushPromises();

        const picker = wrapper.findComponent(DatePickerStub);
        await picker.vm.$emit("update:modelValue", new Date(2026, 2, 15));
        await flushPromises();

        expect(wrapper.text()).toContain("Ogiltigt datum");
    });

    it("searches text after at least three characters", async () => {
        const wrapper = mountNavBar();

        wrapper.vm.selectSearchType("Elev");
        wrapper.vm.searchQuery = "Anna";
        await wrapper.vm.handleSearch();
        await flushPromises();

        expect(searchCalls()).toContain("/search?type=Elev&q=Anna");
    });

    it("does not search text shorter than three characters", async () => {
        const wrapper = mountNavBar();

        wrapper.vm.selectSearchType("Elev");
        wrapper.vm.searchQuery = "An";
        await wrapper.vm.handleSearch();

        expect(searchCalls()).toHaveLength(0);
    });

    it("clears the current search and closes search results", async () => {
        const wrapper = mountNavBar();

        wrapper.vm.searchQuery = "Anna";
        wrapper.vm.searchResults = [{ id: "1" }];
        wrapper.vm.showSearchResults = true;
        wrapper.vm.clearSearch();
        await flushPromises();

        expect(wrapper.vm.searchQuery).toBe("");
        expect(wrapper.vm.searchResults).toEqual([]);
        expect(wrapper.vm.showResults).toBe(false);
    });

    it("toggles dropdowns and handles escape to close them", async () => {
        const wrapper = mountNavBar();

        wrapper.vm.toggleSearchTypeDropdown();
        expect(wrapper.vm.showSearchTypeDropdown).toBe(true);
        wrapper.vm.handleEscapeKey({ preventDefault: vi.fn() });
        expect(wrapper.vm.showSearchTypeDropdown).toBe(false);
        expect(wrapper.vm.showResults).toBe(false);
    });

    it("toggles notifications and profile menus", async () => {
        const wrapper = mountNavBar();

        wrapper.vm.toggleNotificationPanel({ stopPropagation: vi.fn() });
        expect(wrapper.vm.showNotisPanel).toBe(true);
        wrapper.vm.toggleProfileMenu({
            preventDefault: vi.fn(),
            stopPropagation: vi.fn(),
        });
        expect(wrapper.vm.showProfileMenu).toBe(true);
    });

    it("handles focus and outside-click cleanup", async () => {
        const wrapper = mountNavBar();

        wrapper.vm.searchQuery = "Anna";
        wrapper.vm.handleInputFocus();
        expect(wrapper.vm.showResults).toBe(true);
    });
});
