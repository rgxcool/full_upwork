export default {
    apps: [
        {
            name: "md-backend",
            script: "npm",
            args: "start",
            env: {
                MONGO_URI: "mongodb://localhost:27017/mindfullearning",
                JWT_SECRET: "jwt_mindful",
                GOOGLE_PWD: "adyf munl feof bwgj",
            },
        },
    ],
};
