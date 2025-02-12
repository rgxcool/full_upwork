require("dotenv").config();
import mongoose from "mongoose";

import Program from "../models/Program.js"; // Adjust path

dotenv.config();

console.log("process.env.MONG_URI:", process.env.MONG_URI);

mongoose.connect(process.env.MONG_URI);

// Read Excel File
const workbook = xlsx.readFile("./EducationData.xlsx");
const data = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]); // Adjust sheet if needed

const importData = async () => {
    try {
        for (const row of data) {
            console.log("Row data:", row); // Debug log

            // Ensure that 'Omfattning' exists in the row
            if (!row["Omfattning"]) {
                console.warn(`Skipping row due to missing 'Omfattning':`, row);
                continue; // Skip this row
            }

            //Add course
            const course = await Course.create({
                courseName: row["Kurs"],
                courseCode: row["Kurskod"],
                omfattning: row["Omfattning"]
                    ? String(row["Omfattning"]) // Ensure it's a string
                          .split(",")
                          .map((value) => {
                              const num = parseFloat(value.trim());
                              if (isNaN(num)) {
                                  console.warn(
                                      `Invalid number in 'Omfattning': ${value}`
                                  );
                                  return null; // Handle invalid values as needed
                              }
                              return num;
                          })
                          .filter((num) => num !== null) // Remove invalid entries
                    : [], // Default to an empty array if 'Omfattning' is missing
            });

            // Add to program
            let program = await Program.findOne({
                programName: row["Program"],
            });
            if (!program) {
                program = await Program.create({
                    programName: row["Program"],
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
