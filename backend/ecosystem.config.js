export default {
    apps: [
        {
            name: "md-backend",
            script: "npm",
            args: "start",
            env: {
                MONGO_URI: "mongodb://localhost:27017/mindful_learning",
                JWT_SECRET: "jwt_mindful",
                GOOGLE_PWD: "adyf munl feof bwgj",
            },
        },
    ],
};
