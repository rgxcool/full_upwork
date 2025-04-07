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
        if (cell.style.fill?.fgColor?.argb?.toUpperCase() === "FFFF0000") {
          hasRedBackground = true
        }
      }
    })

    rowObject["teacher"] = teacherName
    rowObject["dropout"] = hasRedBackground

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

    let programRef = null
    if (rowObject["PROGRAM"]) {
      const programName = rowObject["PROGRAM"]?.toUpperCase().trim()
      const programDoc = await Program.findOne({ programName })
      if (programDoc) {
        programRef = { programId: programDoc._id, grade: null }
      } else {
        console.warn(`⚠️ No Program found for: ${programName}`)
      }
    }

    let rawInput = rowObject["KURS/PAKET"]
    let rawNames = []

    if (typeof rawInput === "string") {
      rawNames = rawInput.split(/[,;|]/).map(n => n.trim().toUpperCase()).filter(Boolean)
    } else if (Array.isArray(rawInput)) {
      rawNames = rawInput.map(n => n.trim().toUpperCase()).filter(Boolean)
    } else if (rawInput && typeof rawInput.text === "string") {
      rawNames = rawInput.text.split(/[,;|]/).map(n => n.trim().toUpperCase()).filter(Boolean)
    }

    const courses = []
    const coursePackages = []
    const education = []

    for (const name of rawNames) {
      const programDoc = await Program.findOne({ programName: name })
      if (programDoc) {
        if (!programRef) programRef = { programId: programDoc._id, grade: null }
        education.push({ type: "Program", refId: programDoc._id, name })
        continue
      }

      const packageDoc = await CoursePackage.findOne({ coursePackageName: name })
      if (packageDoc) {
        coursePackages.push({ coursePackageId: packageDoc._id, grade: null })
        education.push({ type: "CoursePackage", refId: packageDoc._id, name })
        continue
      }

      const courseDoc = await Course.findOne({ courseName: name })
      if (courseDoc) {
        courses.push({ courseId: courseDoc._id, addedAt: new Date(), grade: null })
        education.push({ type: "Course", refId: courseDoc._id, name })
        continue
      }

      console.warn(`⚠️ No match for: ${name}`)
    }

    studentsToSave.push({
      name: rowObject["NAMN"],
      personalNumber: rowObject["PERSONNUMMER"],
      program: programRef,
      coursePackages,
      courses,
      startDate: parseExcelDate(rowObject["START"]),
      endDate: parseExcelDate(rowObject["SLUT"]),
      finalExamDate: parseExcelDate(rowObject["PREL. DATUM SLUTPROV"]),
      municipality: rowObject["KOMMUN/PRIVAT"],
      phone: rowObject["TELEFON"] || "",
      email: extractMail(rowObject["MAIL"]),
      exam: rowObject["PROV"] || "",
      additionalInfo: rowObject["ÖVRIGT"] || "",
      teacher: teacherName,
      dropout: hasRedBackground,
      aplStatus: "GRAY",
      education,
    })

    console.log(`✅ Processed student: ${rowObject["NAMN"]}, dropout: ${hasRedBackground}`)
  }

  console.log(`✅ Parsed ${studentsToSave.length} students.`)
  return studentsToSave
}

// ✅ Excel date normalization
function parseExcelDate(value) {
  if (!value) return null
  if (value instanceof Date) return value.toISOString()
  if (typeof value === "number") {
    return new Date((value - 25569) * 86400 * 1000).toISOString()
  }
  return null
}

// ✅ Mail field normalization
function extractMail(value) {
  if (!value) return ""
  if (typeof value === "object" && value.text) return value.text.trim()
  return typeof value === "string" ? value.trim() : ""
}

export { parseStudentExcel }
