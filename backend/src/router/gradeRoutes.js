import { Router } from "express";
const router = Router();
import Student from "../models/Student.js";

router.get("/betygsattning", async (req, res) => {
    try {
        const idag = new Date();
        idag.setHours(0, 0, 0, 0); // Nollställ tid för dagens datum

        // Hämta alla elever med betyg null
        const allaElever = await Student.find({ "betyg.grade": null });

        // Konvertera slutDatum från sträng till Date och jämför
        const elever = allaElever.filter((elev) => {
            if (!elev.slutDatum) return false; // Säkerställ att slutDatum finns
            const slutDatum = new Date(elev.slutDatum); // Konvertera sträng till Date
            slutDatum.setHours(0, 0, 0, 0); // Nollställ tid för slutdatumet
            return slutDatum <= idag; // Jämför om slutDatum är mindre än eller lika med idag
        });

        res.json(elever); // Skicka de filtrerade eleverna
    } catch (error) {
        console.error("Error fetching students:", error);
        res.status(500).send("Server error");
    }
});

router.post("/betygsattning", async (req, res) => {
    try {
        console.log("Mottagen data:", req.body); // Logga inkommande data

        const { elever } = req.body;
        for (const elev of elever) {
            await Student.updateOne(
                { _id: elev._id },
                {
                    $set: {
                        "betyg.grade": elev.betyg.grade,
                        "betyg.comments": elev.betyg.comments,
                        "betyg.locked": elev.betyg.locked,
                    },
                }
            );
        }

        res.send("Betygen har sparats!");
    } catch (error) {
        console.error("Error saving grades:", error);
        res.status(500).send("Server error");
    }
});

router.get("/eleverMedBetyg", async (req, res) => {
    try {
        const elever = await Student.find({
            "betyg.grade": { $ne: null },
            "betyg.locked": false,
        });
        res.json(elever);
    } catch (error) {
        console.error("Error fetching students with grades:", error);
        res.status(500).send("Server error");
    }
});

router.post("/lasaBetyg", async (req, res) => {
    try {
        const { _id } = req.body;
        await Student.updateOne({ _id }, { $set: { "betyg.locked": true } });
        res.send("Betyget är låst!");
    } catch (error) {
        console.error("Error locking grade:", error);
        res.status(500).send("Server error");
    }
});

router.get("/lastaBetyg", async (req, res) => {
    try {
        const elever = await Student.find({ "betyg.locked": true });
        res.json(elever);
    } catch (error) {
        console.error("Error fetching locked grades:", error);
        res.status(500).send("Server error");
    }
});

export default router;
