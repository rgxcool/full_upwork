import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import StaffPermissionsTab from "@/views/Teacher/Tabs/StaffPermissionsTab.vue";
import client from "@/api/client.js";
import { buildStore } from "../../helpers/render.js";

vi.mock("@/api/client.js", () => ({
    default: {
        get: vi.fn(),
        put: vi.fn(),
        post: vi.fn(),
        delete: vi.fn(),
    },
}));

const PermissionMatrixEditorStub = {
    name: "PermissionMatrixEditor",
    props: ["user"],
    template: '<div class="permission-matrix-editor-stub" />',
};

const teacher = { _id: "teacher-1", user: { _id: "user-1" } };

const mountTab = (roles = ["admin"]) => {
    const store = buildStore({ getters: { userRoles: roles } });
    return mount(StaffPermissionsTab, {
        props: { teacher },
        global: {
            plugins: [store],
            stubs: { PermissionMatrixEditor: PermissionMatrixEditorStub },
        },
    });
};

describe("StaffPermissionsTab", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        client.get.mockResolvedValue({
            data: { _id: "user-1", roles: ["teacher"], permissions: {} },
        });
    });

    it("loads the staff user and renders the permission editor for admins", async () => {
        const wrapper = mountTab(["admin"]);
        await flushPromises();

        expect(client.get).toHaveBeenCalledWith("/users/user-1");
        const editor = wrapper.findComponent(PermissionMatrixEditorStub);
        expect(editor.exists()).toBe(true);
        expect(editor.props("user")).toMatchObject({ _id: "user-1" });
    });

    it("shows a warning instead of fetching for non-admins", async () => {
        const wrapper = mountTab(["teacher"]);
        await flushPromises();

        expect(client.get).not.toHaveBeenCalled();
        expect(wrapper.text()).toContain("Du har inte behörighet");
        expect(wrapper.findComponent(PermissionMatrixEditorStub).exists()).toBe(false);
    });

    it("shows an error state when the user cannot be loaded", async () => {
        client.get.mockRejectedValueOnce(new Error("boom"));

        const wrapper = mountTab(["systemadmin"]);
        await flushPromises();

        expect(wrapper.text()).toContain("Kunde inte hämta behörigheter");
    });
});
