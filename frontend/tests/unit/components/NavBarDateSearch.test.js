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
});
