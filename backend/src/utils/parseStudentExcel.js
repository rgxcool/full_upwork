import ExcelJS from "exceljs"
import Program from "../models/Program.js"
import Course from "../models/Course.js"
import CoursePackage from "../models/CoursePackage.js"

async function parseStudentExcel(fileBuffer, teacherName) {
  console.log("🔹 Loading Excel file...")

  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(fileBuffer)
  const worksheet = workbook.worksheets[0]

  const headers = worksheet.getRow(1).values.slice(1)
  const requiredFields = ["NAMN", "PERSONNUMMER", "KURS/PAKET", "START", "SLUT", "KOMMUN/PRIVAT"]

  const studentsToSave = []
  let consecutiveEmptyRows = 0

  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
    const row = worksheet.getRow(rowNumber)
    const rowObject = {}
    let hasRedBackground = false

    row.eachCell((cell, colNumber) => {
      const columnName = headers[colNumber - 1]
      if (columnName) {
        rowObject[columnName] = cell.value
      }

      // Detect dropout status via red fill
      if (
        cell.style.fill?.fgColor?.argb?.toUpperCase() === "FFFF0000"
      ) {
        hasRedBackground = true
      }
    })

    rowObject["teacher"] = teacherName
    rowObject["dropout"] = hasRedBackground

    // Skip if empty row
    if (requiredFields.every(field => !rowObject[field])) {
      consecutiveEmptyRows++
      if (consecutiveEmptyRows >= 5) {
        console.warn(`⚠️ Stopped after ${consecutiveEmptyRows} empty rows.`)
        break
      }
      continue
    } else {
      consecutiveEmptyRows = 0
    }

    // Program lookup
    let programId = null
    if (rowObject["PROGRAM"]) {
      const rawProgram = rowObject["PROGRAM"]
      const programName = rawProgram?.toUpperCase().trim()
      const programDoc = await Program.findOne({ name: programName })
      programId = programDoc?._id || null
    }

    // Courses & Course Packages
    let courseIds = []
    let coursePackageIds = []

    if (rowObject["KURS/PAKET"]) {
      const rawCourseNames = rowObject["KURS/PAKET"]
        .split(",")
        .map(name => name.trim().toUpperCase())

      console.log(`🔍 Searching for courses/packages:`, rawCourseNames)

      const foundCourses = await Course.find({
        courseName: { $in: rawCourseNames },
      }).lean()

      const courseMap = Object.fromEntries(foundCourses.map(c => [c.courseName, c._id]))

      const unmatched = rawCourseNames.filter(name => !courseMap[name])
      const foundPackages = await CoursePackage.find({
        name: { $in: unmatched },
      }).lean()

      const packageMap = Object.fromEntries(foundPackages.map(p => [p.name, p._id]))

      courseIds = foundCourses.map(course => ({
        courseId: course._id,
        courseName: course.courseName,
        addedAt: new Date(),
      }))

      coursePackageIds = foundPackages.map(pkg => ({
        coursePackageId: pkg._id,
        coursePackageName: pkg.name,
        addedAt: new Date(),
      }))

      const completelyUnmatched = unmatched.filter(name => !packageMap[name])
      if (completelyUnmatched.length > 0) {
        console.warn(`⚠️ No match found for: ${completelyUnmatched.join(", ")}`)
      }
    }

    studentsToSave.push({
      name: rowObject["NAMN"],
      personalNumber: rowObject["PERSONNUMMER"],
      program: programId,
      coursePackages: coursePackageIds,
      courses: courseIds,
      startDate: parseExcelDate(rowObject["START"]),
      endDate: parseExcelDate(rowObject["SLUT"]),
      municipality: rowObject["KOMMUN/PRIVAT"],
      phone: rowObject["TELEFON"] || "",
      email: extractMail(rowObject["MAIL"]),
      exam: rowObject["PROV"] || "",
      additionalInfo: rowObject["ÖVRIGT"] || "",
      finalExamDate: parseExcelDate(rowObject["PREL. DATUM SLUTPROV"]),
      dropout: hasRedBackground,
      teacher: teacherName,
    })

    console.log(`✅ Processed: ${rowObject["NAMN"]}, dropout: ${hasRedBackground}`)
  }

  console.log(`✅ Parsed ${studentsToSave.length} students.`)
  return studentsToSave
}

// Parse Excel date formats (number or Date)
function parseExcelDate(value) {
  if (!value) return null
  if (value instanceof Date) return value.toISOString()
  if (typeof value === "number") {
    return new Date((value - 25569) * 86400 * 1000).toISOString()
  }
  return value
}

// Normalize mail field regardless of format
function extractMail(value) {
  if (!value) return ""
  if (typeof value === "object" && value.text) return value.text.trim()
  return typeof value === "string" ? value.trim() : ""
}

export { parseStudentExcel }
