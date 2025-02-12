// Import dependencies using ESM
import { Router } from "express";
import Student from "../models/Student.js";
import Education from "../models/Education.js";
import { uploadXlsx } from "../controllers/studentController.js";
import upload from "../middleware/uploadMiddleware.js"; // ✅ Ensure .js extension

const router = Router(); // ✅ Create router instance

// Get all students
router.get("/", async (req, res) => {
    try {
        const students = await Student.find().populate(
            "courses.courseId",
            "courseName courseCode" // ✅ Explicitly fetch courseCode
        );

        res.status(200).json(students);
    } catch (error) {
        console.error("Error fetching students:", error);
        res.status(500).send("Server error");
    }
});

// Add a single student
router.post("/", async (req, res) => {
    try {
        const student = new Student(req.body); // Create a new student document
        const savedStudent = await student.save(); // Save it to the database
        res.status(201).json(savedStudent); // Respond with the saved student
    } catch (error) {
        console.error("Error adding student:", error.message);
        res.status(500).json({ error: "Failed to add student" });
    }
});

// Route to fetch a student ID by name
router.get("/id", async (req, res) => {
    const { name } = req.query;

    try {
        const student = await Student.findOne({ namn: name }) // `namn` should match your schema
            .populate("courses.courseId", "courseName courseCode")
            .exec();

        if (!student) {
            return res.status(404).json({ error: "Elev hittades inte." });
        }

        res.json({ studentId: student._id });
    } catch (error) {
        console.error("Error fetching student:", error);
        res.status(500).json({ error: "Ett serverfel inträffade." });
    }
});

//Update Student
router.put("/:id", async (req, res) => {
    try {
        const updatedStudent = await Student.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true }
        );
        res.status(200).json(updatedStudent);
    } catch (error) {
        res.status(500).json({ error: "Failed to update student" });
    }
});

// ✅ Define the route for Excel file upload
router.post("/xlsxupload", upload.single("file"), uploadXlsx);

// ✅ Function to Convert Excel Date to JavaScript Date
function parseExcelDate(value) {
    if (!value) return null;
    if (typeof value === "number") {
        return new Date((value - 25569) * 86400 * 1000).toISOString();
    }
    return value;
}

// ✅ Add a course to an existing student by name
router.post("/addcoursetostudent", async (req, res) => {
    try {
        const { studentName, courseId } = req.body;

        if (!studentName || !courseId) {
            return res
                .status(400)
                .send("Student name and course ID are required.");
        }

        const student = await Student.findOne({ namn: studentName });
        if (!student) {
            return res.status(404).send("Student not found");
        }

        const course = await Education.Course.findById(courseId);
        if (!course) {
            return res.status(404).send("Course not found");
        }

        student.kurspaket.push(course.namn);
        await student.save();

        res.status(200).send("Course added to student!");
    } catch (error) {
        console.error("Error adding course to student:", error.message);
        res.status(500).json({ error: "Server error", details: error.message });
    }
});

// ✅ Add a course to an existing student by ID
router.post("/:studentId/courses", async (req, res) => {
    const { studentId } = req.params;
    const { courseId } = req.body;

    try {
        const student = await Student.findById(studentId);
        if (!student) {
            return res.status(404).json({ error: "Student not found" });
        }

        const course = await Education.Course.findById(courseId);
        if (!course) {
            return res.status(404).json({ error: "Course not found" });
        }

        student.courses.push({
            courseId: course._id,
            courseName: course.courseName,
            courseCode: course.courseCode,
        });

        await student.save();
        res.status(200).json({ message: "Course added successfully", student });
    } catch (error) {
        console.error("Error adding course:", error);
        res.status(500).json({ error: "Server error" });
    }
});

// Route to get student ID by name
router.get("students/id", async (req, res) => {
    try {
        const { name } = req.query;

        // Find the student by name
        const student = await Student.findOne({ namn: name })
            .populate("courses.courseId", "courseName")
            .exec();
        if (!student) {
            return res.status(404).send("Student not found");
        }

        res.status(200).json({ studentId: student._id });
    } catch (error) {
        console.error(error);
        res.status(500).send("Server error");
    }
});

// Fetch student details by ID
router.get("/:id", async (req, res) => {
    try {
        const student = await Student.findById(req.params.id).populate(
            "courses.courseId"
        );
        if (!student) {
            return res.status(404).send("Student not found.");
        }
        res.json(student);
    } catch (error) {
        console.error("Error fetching student:", error);
        res.status(500).send("Failed to fetch student details.");
    }
});

// Update student details
router.put("/:id", async (req, res) => {
    try {
        const updatedStudent = await Student.findByIdAndUpdate(
            req.params.id,
            req.body,
            {
                new: true,
                runValidators: true,
            }
        );
        if (!updatedStudent) {
            return res.status(404).send("Student not found.");
        }
        res.json(updatedStudent);
    } catch (error) {
        console.error("Error updating student:", error);
        res.status(500).send("Failed to update student.");
    }
});

// Remove a course from a student
router.delete("/:id/courses/:courseId", async (req, res) => {
    try {
        const student = await Student.findById(req.params.id);
        if (!student) {
            return res.status(404).send("Student not found.");
        }

        student.courses = student.courses.filter(
            (course) => course.courseId.toString() !== req.params.courseId
        );
        await student.save();

        res.send("Course removed successfully.");
    } catch (error) {
        console.error("Error removing course:", error);
        res.status(500).send("Failed to remove course.");
    }
});

// Route to search for students by name
router.get("/search", async (req, res) => {
    const { name } = req.query;

    if (!name || name.trim() === "") {
        return res.status(400).send("Name query is required.");
    }

    try {
        const students = await Student.find({
            namn: { $regex: name, $options: "i" },
        }).select("_id namn");
        res.json(students);
    } catch (error) {
        console.error("Error searching students:", error);
        res.status(500).send("Error searching students.");
    }
});

export default router;
