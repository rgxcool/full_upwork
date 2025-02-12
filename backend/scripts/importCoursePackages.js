import ExcelJS from "exceljs";

async function extractCoursePackages(filePath) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const sheet = workbook.worksheets[0];

    const coursePackages = {};
    let currentPackage = null;

    sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return; // Skip header row

        const courseCodeCell = row.getCell(1);
        const courseNameCell = row.getCell(2);

        const courseCode = courseCodeCell.value;
        const courseName = courseNameCell.value;

        // Check if the cell is bold and course code starts with 'FSX'
        if (
            courseCodeCell.font &&
            courseCodeCell.font.bold &&
            courseCode.startsWith("FSX")
        ) {
            currentPackage = courseCode;
            coursePackages[currentPackage] = [];
        } else if (currentPackage) {
            coursePackages[currentPackage].push({ courseCode, courseName });
        }
    });

    return coursePackages;
}

// Example usage
const filePath = "./Kurser och kurspaket.xlsx";
extractCoursePackages(filePath).then((coursePackages) => {
    for (const [package, courses] of Object.entries(coursePackages)) {
        console.log(`Course Package: ${package}`);
        courses.forEach((course) => {
            console.log(
                `  Course: ${course.courseCode} - ${course.courseName}`
            );
        });
    }
});
