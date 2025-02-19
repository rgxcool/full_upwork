import bcrypt from "bcrypt";

const storedHash =
    "$2b$10$.Olw7fJSp/IQ71tv09CBIulfUjnnLD/wgAHElCIifl9N.vcj8dKiW";
const inputPassword = "mindful"; // This should be the correct password

bcrypt.compare(inputPassword, storedHash).then((match) => {
    console.log(match ? "✅ Passwords match!" : "❌ Passwords do not match!");
});
