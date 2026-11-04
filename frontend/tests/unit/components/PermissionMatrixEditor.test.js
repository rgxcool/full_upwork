import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import PermissionMatrixEditor from "@/components/PermissionMatrixEditor.vue";
import client from "@/api/client.js";

vi.mock("@/api/client.js", () => ({
    default: {
        get: vi.fn(),
        put: vi.fn(),
        post: vi.fn(),
        delete: vi.fn(),
    },
}));

const toast = {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
};

vi.mock("@/composables/useToast.js", () => ({
    useToast: () => toast,
}));

const user = {
    _id: "user-1",
    roles: ["teacher"],
    permissions: {},
};

const catalog = {
    features: [
        { key: "calendar_final_exam", label: "Kalender (slutprov)" },
        { key: "hierarchy_management", label: "Hierarkihantering" },
    ],
    permissionMatrix: {
        calendar_final_exam: { teacher: true, admin: true, student: false },
        hierarchy_management: { teacher: false, admin: true, student: false },
    },
};

const mountEditor = (props = {}) =>
    mount(PermissionMatrixEditor, {
        props: { user, ...props },
    });

describe("PermissionMatrixEditor", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        client.get.mockResolvedValue({ data: catalog });
        client.put.mockResolvedValue({ data: { success: true } });
    });

    it("renders the catalog loaded from the API", async () => {
        const wrapper = mountEditor();
        await flushPromises();

        expect(client.get).toHaveBeenCalledWith("/permissions");
        const labels = wrapper.findAll(".feature-name").map((node) => node.text());
        expect(labels).toEqual([
            "Kalender (slutprov)",
            "Hierarkihantering",
        ]);
    });

    it("derives checkbox state from the role matrix until overridden", async () => {
        const wrapper = mountEditor();
        await flushPromises();

        const boxes = wrapper.findAll('input[type="checkbox"]');
        // Teacher has calendar access by role, but no hierarchy access.
        expect(boxes[0].element.checked).toBe(true);
        expect(boxes[1].element.checked).toBe(false);
    });

    it("respects explicit per-user permissions over the role matrix", async () => {
        const wrapper = mountEditor({
            user: {
                ...user,
                permissions: { calendar_final_exam: false },
            },
        });
        await flushPromises();

        const boxes = wrapper.findAll('input[type="checkbox"]');
        expect(boxes[0].element.checked).toBe(false);
    });

    it("saves the changed permissions for the user", async () => {
        const wrapper = mountEditor();
        await flushPromises();

        const boxes = wrapper.findAll('input[type="checkbox"]');
        // Grant hierarchy management explicitly.
        await boxes[1].setValue(true);
        await flushPromises();

        const saveButton = wrapper
            .findAll("button")
            .find((button) => button.text().includes("Spara behörigheter"));
        expect(saveButton.attributes("disabled")).toBeUndefined();

        await saveButton.trigger("click");
        await flushPromises();

        expect(client.put).toHaveBeenCalledWith("/users/user-1/permissions", {
            permissions: { hierarchy_management: true },
        });
        expect(toast.success).toHaveBeenCalled();
        expect(wrapper.emitted("saved")).toBeTruthy();
    });

    it("falls back to the built-in catalog when the API fails", async () => {
        client.get.mockRejectedValueOnce(new Error("boom"));

        const wrapper = mountEditor();
        await flushPromises();

        const labels = wrapper.findAll(".feature-name").map((node) => node.text());
        expect(labels).toContain("Kalender (slutprov)");
        expect(wrapper.text()).not.toContain("Laddar behörigheter");
    });

    it("does not allow saving when no user is attached", async () => {
        const wrapper = mountEditor({ user: null });
        await flushPromises();

        const boxes = wrapper.findAll('input[type="checkbox"]');
        expect(boxes.every((box) => box.attributes("disabled") !== undefined)).toBe(true);

        const saveButton = wrapper
            .findAll("button")
            .find((button) => button.text().includes("Spara behörigheter"));
        expect(saveButton.attributes("disabled")).toBeDefined();

        await saveButton.trigger("click");

        expect(client.put).not.toHaveBeenCalled();
    });
});
