// ✅ parseStudentExcel.js
import ExcelJS from "exceljs";

function parseExcelDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number") {
    return new Date((value - 25569) * 86400 * 1000).toISOString();
  }
  return null;
}

function normalizePN(value) {
  if (!value) return "";
  return value.toString().replace(/\s/g, "").trim(); // Remove all spaces/newlines
}

function extractMail(value) {
  if (!value) return "";
  if (typeof value === "object" && value.text) return value.text.trim();
  return typeof value === "string" ? value.trim() : "";
}

export async function parseStudentExcel(fileBuffer, teacherName) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(fileBuffer);
  const worksheet = workbook.worksheets[0];

  const headers = worksheet.getRow(1).values.slice(1);
  const requiredFields = [
    "NAMN",
    "PERSONNUMMER",
    "KURS/PAKET",
    "START",
    "SLUT",
    "KOMMUN/PRIVAT",
  ];

  const studentsToSave = [];
  let consecutiveEmptyRows = 0;

  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
    const row = worksheet.getRow(rowNumber);
    const rowObject = {};
    let hasRedBackground = false;

    row.eachCell((cell, colNumber) => {
      const columnName = headers[colNumber - 1];
      if (columnName) {
        rowObject[columnName] = cell.value;
        if (cell.style.fill?.fgColor?.argb?.toUpperCase() === "FFFF0000") {
          hasRedBackground = true;
        }
      }
    });

    rowObject["teacher"] = teacherName;
    rowObject["dropout"] = hasRedBackground;

    if (requiredFields.every((field) => !rowObject[field])) {
      consecutiveEmptyRows++;
      if (consecutiveEmptyRows >= 5) break;
      continue;
    } else {
      consecutiveEmptyRows = 0;
    }

    let rawInput = rowObject["KURS/PAKET"];
    let rawNames = [];
    if (typeof rawInput === "string") {
      rawNames = rawInput
        .split(/[,;|]/)
        .map((n) => n.trim().toUpperCase())
        .filter(Boolean);
    } else if (Array.isArray(rawInput)) {
      rawNames = rawInput.map((n) => n.trim().toUpperCase()).filter(Boolean);
    } else if (rawInput && typeof rawInput.text === "string") {
      rawNames = rawInput.text
        .split(/[,;|]/)
        .map((n) => n.trim().toUpperCase())
        .filter(Boolean);
    }

    const education = [];
    let programName =
      rowObject["PROGRAM"]?.toString().trim().toUpperCase() || null;

    if (programName) {
      education.push({ type: "Program", name: programName });
    }

    for (const name of rawNames) {
      education.push({ type: "Auto", name }); // 'Auto' means not yet resolved
    }

    if (rawNames.length === 0 && !programName) {
      education.push({ type: "Course", name: "SE STUDIEPLAN" });
    }

    studentsToSave.push({
      name: rowObject["NAMN"],
      personalNumber: normalizePN(rowObject["PERSONNUMMER"]),
      startDate: parseExcelDate(rowObject["START"]),
      endDate: parseExcelDate(rowObject["SLUT"]),
      finalExamDate: parseExcelDate(rowObject["PREL. DATUM SLUTPROV"]),
      municipality: {
        type: rowObject["KOMMUN/PRIVAT"]?.toString().trim() || "",
      },
      phone: rowObject["TELEFON"] || "",
      email: extractMail(rowObject["MAIL"]),
      exam: rowObject["PROV"] || "",
      additionalInfo: rowObject["ÖVRIGT"] || "",
      teacher: teacherName,
      dropout: hasRedBackground,
      aplStatus: "GRAY",
      education,
    });
  }

  return studentsToSave;
}
