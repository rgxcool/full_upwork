module.exports = {
    apps: [
        {
            name: "ML-Backend",
            script: "./index.js",
            instances: "max",
            exec_mode: "cluster",
            env: {
                NODE_ENV: "development",
                PORT: 5001,
            },
            env_production: {
                NODE_ENV: "production",
                PORT: 5001,
                MONGO_URI: "mongodb://localhost:27017/mindfullearning",
                JWT_SECRET: "jwt_mindful",
                GOOGLE_PWD: "adyf munl feof bwgj",
                CLIENT_URL: "https://mindfullearning.se",
            },
        },
    ],
};
