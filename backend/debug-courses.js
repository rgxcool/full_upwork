import mongoose from "mongoose";
import Course from "./src/models/Course.js";
import CoursePackage from "./src/models/CoursePackage.js";
import { normalizeCodeForMatching } from "./src/utils/parseStudentExcel.js";

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/mindful";

async function debugCourses() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log("Connected to MongoDB");

        // Check for SVEA1000X and SAMH1A10X
        const searchCodes = ["SVEA1000X", "SAMH1A10X"];
        
        console.log("\n=== Searching for courses ===");
        for (const code of searchCodes) {
            const normalized = normalizeCodeForMatching(code);
            console.log(`\nSearching for: "${code}" (normalized: "${normalized}")`);
            
            // Find exact match
            const exact = await Course.findOne({ courseCode: code });
            if (exact) {
                console.log(`  ✓ Found exact match: ${exact.courseCode} - ${exact.courseName}`);
            } else {
                console.log(`  ✗ No exact match found`);
            }
            
            // Find all courses and check normalized
            const allCourses = await Course.find({}).lean();
            console.log(`  Checking ${allCourses.length} courses...`);
            let found = false;
            for (const c of allCourses) {
                const norm = normalizeCodeForMatching(c.courseCode || "");
                if (norm === normalized) {
                    console.log(`  ✓ Found normalized match: "${c.courseCode}" (normalized: "${norm}") - ${c.courseName}`);
                    found = true;
                }
            }
            if (!found) {
                console.log(`  ✗ No normalized match found`);
                // Show similar codes
                const similar = allCourses
                    .map(c => ({
                        code: c.courseCode,
                        normalized: normalizeCodeForMatching(c.courseCode || ""),
                        name: c.courseName
                    }))
                    .filter(c => c.normalized.includes(normalized.substring(0, 4)) || normalized.includes(c.normalized.substring(0, 4)))
                    .slice(0, 5);
                if (similar.length > 0) {
                    console.log(`  Similar codes found:`);
                    similar.forEach(s => console.log(`    - "${s.code}" (normalized: "${s.normalized}") - ${s.name}`));
                }
            }
        }
        
        // Check packages
        console.log("\n=== Searching for packages ===");
        for (const code of searchCodes) {
            const normalized = normalizeCodeForMatching(code);
            const allPackages = await CoursePackage.find({}).lean();
            let found = false;
            for (const pkg of allPackages) {
                const norm = normalizeCodeForMatching(pkg.coursePackageCode || "");
                if (norm === normalized) {
                    console.log(`  ✓ Found package match: "${pkg.coursePackageCode}" (normalized: "${norm}") - ${pkg.coursePackageName}`);
                    found = true;
                }
            }
            if (!found) {
                console.log(`  ✗ No package match found for "${code}"`);
            }
        }
        
        // Show sample courses
        console.log("\n=== Sample courses (first 10) ===");
        const samples = await Course.find({}).limit(10).lean();
        console.log(`Found ${samples.length} courses total`);
        if (samples.length === 0) {
            // Try to find courses in CourseInstance
            const CourseInstance = mongoose.model("CourseInstance");
            const instances = await CourseInstance.find({}).limit(10).lean();
            console.log(`Found ${instances.length} course instances instead`);
            instances.forEach(ci => {
                console.log(`  Instance: "${ci.courseCode}" - ${ci.courseName}`);
            });
        } else {
            samples.forEach(c => {
                const norm = normalizeCodeForMatching(c.courseCode || "");
                console.log(`  "${c.courseCode}" → normalized: "${norm}" - ${c.courseName}`);
            });
        }
        
        // Check total count
        const totalCourses = await Course.countDocuments({});
        console.log(`\nTotal courses in database: ${totalCourses}`);
        
        await mongoose.disconnect();
        process.exit(0);
    } catch (error) {
        console.error("Error:", error);
        process.exit(1);
    }
}

debugCourses();
