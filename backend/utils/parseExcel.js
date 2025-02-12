// ✅ Function to Convert Excel Date to JavaScript Date
function parseExcelDate(value) {
    if (!value) return null;
    if (typeof value === "number") {
        return new Date((value - 25569) * 86400 * 1000).toISOString();
    }
    return value;
}

export default parseExcelDate;
