import express from "express";
import User from "../models/User.js";
import nodemailer from "nodemailer";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

const router = express.Router();

const transporter = nodemailer.createTransport({
    service: "Gmail",
    auth: {
        user: "newmindful.development@gmail.com",
        pass: process.env.GOOGLE_PWD,
    },
});

router.post("/register", async (req, res) => {
    try {
        const { email, password, name } = req.body;

        if (!email || !password || !name) {
            return res
                .status(400)
                .send({ message: "Alla fält är obligatoriska!" });
        }

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(409).send({
                message: "Emailadressen finns redan, var vänlig att logga in!",
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ name, email, password: hashedPassword });
        await newUser.save();

        return res.status(201).send({ message: "Användare registrerad!" });
    } catch (error) {
        console.error("Error during registration:", error);
        return res
            .status(500)
            .send({ message: "Ett fel uppstod vid registrering." });
    }
});

router.post("/reset-password", async (req, res) => {
    try {
        const { token, newPassword } = req.body;

        if (!token || !newPassword) {
            return res
                .status(400)
                .send({ message: "Token och nytt lösenord krävs" });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        await User.findByIdAndUpdate(decoded.id, {
            password: hashedPassword,
        });

        return res.send({ message: "Lösenordet har ändrats!" });
    } catch (error) {
        console.error("Error during password reset:", error);
        if (error.name === "TokenExpiredError") {
            return res.status(401).send({ message: "Token har löpt ut." });
        }
        return res
            .status(500)
            .send({ message: "Ett fel uppstod vid lösenordsändring." });
    }
});

export default router;
