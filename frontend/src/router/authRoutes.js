import LoginPage from "@/pages/Login.vue";
import Register from "@/pages/Auth/Register.vue";
import ResetPassword from "@/pages/Auth/ResetPassword.vue";

export default [
    {
        path: "/login",
        name: "login",
        component: LoginPage,
        meta: { title: "Login - Mindful Learning" },
    },
    { path: "/register", name: "Register", component: Register },
    { path: "/reset-password", component: ResetPassword },
];
