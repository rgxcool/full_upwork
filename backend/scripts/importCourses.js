require("dotenv").config();
const mongoose = require("mongoose");
const xlsx = require("xlsx");
const {
    Program,
    CoursePackage,
    Course,
} = require("../src/models/educationSchema"); // Adjust path
const MONGO_URI =
    "mongodb://mindful_admin:newmindful1337@localhost:27017/mindful"; // Adjust URI

console.log("MONGO_URI:", MONGO_URI);

mongoose.connect(MONGO_URI);

// Read Excel File
const workbook = xlsx.readFile("./Kurser och kurspaket.xlsx");
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

            /* Adding only courses for now and coursepackages later.
      // Add to course package
      let coursePackage = await CoursePackage.findOne({ packageName: row["Kurspaket"] });
      if (!coursePackage) {
        coursePackage = await CoursePackage.create({ packageName: row["Kurspaket"], courses: [] });
      }
      coursePackage.courses.push(course._id);
      await coursePackage.save();
      */

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
