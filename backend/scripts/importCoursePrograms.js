import dotenv from "dotenv";
dotenv.config(); // Ensure this runs before using process.env
console.log("process.env:", process.env);

import mongoose from "mongoose";
import ExcelJS from "exceljs";
import Program from "../src/models/Program.js";
import Course from "../src/models/Course.js";

console.log("process.env.MONGO_URI:", process.env.MONGO_URI);

mongoose.connect(process.env.MONGO_URI);

const importData = async () => {
    try {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile("./EducationData.xlsx");
        const worksheet = workbook.worksheets[0]; // Adjust sheet if needed

        const data = [];
        worksheet.eachRow((row, rowNumber) => {
            if (rowNumber === 1) return; // Skip header row
            const rowData = {
                Kurs: row.getCell(1).value, // Adjust column indexes as needed
                Kurskod: row.getCell(2).value,
                Omfattning: row.getCell(3).value,
                Program: row.getCell(4).value,
            };
            data.push(rowData);
        });

        for (const row of data) {
            console.log("Row data:", row); // Debug log

            if (!row.Omfattning) {
                console.warn(`Skipping row due to missing 'Omfattning':`, row);
                continue;
            }

            const course = await Course.create({
                courseName: row.Kurs,
                courseCode: row.Kurskod,
                omfattning: String(row.Omfattning)
                    .split(",")
                    .map((value) => {
                        const num = parseFloat(value.trim());
                        if (isNaN(num)) {
                            console.warn(
                                `Invalid number in 'Omfattning': ${value}`
                            );
                            return null;
                        }
                        return num;
                    })
                    .filter((num) => num !== null),
            });

            let program = await Program.findOne({ programName: row.Program });
            if (!program) {
                program = await Program.create({
                    programName: row.Program,
                    courses: [],
                });
            }
            if (!program.courses.includes(course._id)) {
                program.courses.push(course._id);
                await program.save();
            }
        }

        console.log("Data imported successfully!");
        mongoose.connection.close();
    } catch (error) {
        console.error("Error importing data:", error);
        mongoose.connection.close();
    }
};

importData();
