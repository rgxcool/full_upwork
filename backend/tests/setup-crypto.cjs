const crypto = require("node:crypto");

if (
    crypto.webcrypto &&
    typeof crypto.getRandomValues !== "function" &&
    typeof crypto.webcrypto.getRandomValues === "function"
) {
    crypto.getRandomValues = crypto.webcrypto.getRandomValues.bind(
        crypto.webcrypto
    );
}

if (
    crypto.webcrypto &&
    (!globalThis.crypto ||
        typeof globalThis.crypto.getRandomValues !== "function")
) {
    globalThis.crypto = crypto.webcrypto;
}
