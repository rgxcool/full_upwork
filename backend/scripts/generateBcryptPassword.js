import bcrypt from "bcrypt";
import readline from "readline";

const rounds = 10;

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

rl.question("Enter password to hash: ", async (password) => {
    try {
        const hash = await bcrypt.hash(password, rounds);
        console.log("bcrypt hash:", hash);
    } catch (err) {
        console.error("Error hashing password:", err);
    } finally {
        rl.close();
    }
});
