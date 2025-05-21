import { municipalityPricing } from "./municipalityPricing.js";

/**
 * @param {Array} students - Array of student objects like:
 *    { municipality: "Botkyrka", grade: "A" }
 * @returns {number} total earnings
 */
export function calculateTotalEarnings(students) {
    return students.reduce((total, student) => {
        const pricing = municipalityPricing[student.municipality];
        if (!pricing) return total;

        const grade = student.grade.toUpperCase();
        if (["A", "B", "C", "D", "E"].includes(grade)) {
            return total + pricing.AtoE;
        } else if (grade === "F") {
            return total + pricing.F;
        } else if (grade === "STRECK" || grade === "AVBROTT") {
            return total + pricing.Streck;
        }

        return total;
    }, 0);
}
