import mongoose from "mongoose";

const buildMongoUri = () => {
    const baseUri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017";
    const dbName =
        process.env.MONGO_TEST_DB ||
        `mindful_test_${process.pid}_${Math.random().toString(16).slice(2)}`;

    try {
        const url = new URL(baseUri);
        url.pathname = `/${dbName}`;
        return url.toString();
    } catch {
        return `${baseUri.replace(/\/+$/, "")}/${dbName}`;
    }
};

export const getTestMongoUri = () => buildMongoUri();

export const connectTestDatabase = async () => {
    const uri = buildMongoUri();
    await mongoose.connect(uri);
    return uri;
};

export const disconnectTestDatabase = async () => {
    if (mongoose.connection.readyState !== 0) {
        await mongoose.connection.dropDatabase();
        await mongoose.disconnect();
    }
};
