import StudentEnrollment from '../models/StudentEnrollment.js';
import mongoose from 'mongoose';
import { gradeToNumber } from '../utils/gradeUtils.js';

export const generateGradeReport = async (filters) => {
    const { municipality, courseId, startDate, endDate } = filters;

    // Build the initial match stage for the aggregation pipeline
    const matchStage = {
        grade: { $ne: null, $nin: ['', 'F', 'f'] }, // Exclude F and non-graded
        gradeDate: { $gte: new Date(startDate), $lte: new Date(endDate) }
    };

    // The main aggregation pipeline
    const pipeline = [
        // 1. Filter enrollments by grade, date
        { $match: matchStage },

        // 2. Lookup student to filter by municipality
        {
            $lookup: {
                from: 'students',
                localField: 'studentId',
                foreignField: '_id',
                as: 'studentInfo'
            }
        },
        { $unwind: '$studentInfo' },

        // 3. Lookup course instance and then main course
        {
            $lookup: {
                from: 'courseinstances',
                localField: 'courseInstanceId',
                foreignField: '_id',
                as: 'courseInstanceInfo'
            }
        },
        { $unwind: '$courseInstanceInfo' },
        {
            $lookup: {
                from: 'courses',
                localField: 'courseInstanceInfo.mainCourseId',
                foreignField: '_id',
                as: 'mainCourseInfo'
            }
        },
        { $unwind: '$mainCourseInfo' },
        
        // 4. Apply municipality and course filters if provided
        {
            $match: {
                ...(municipality && { 'studentInfo.municipality': municipality }),
                ...(courseId && { 'mainCourseInfo._id': new mongoose.Types.ObjectId(courseId) })
            }
        },
        
        // 5. Group by year and month to calculate monthly stats
        {
            $group: {
                _id: {
                    year: { $year: '$gradeDate' },
                    month: { $month: '$gradeDate' },
                },
                grades: { $push: '$grade' },
                count: { $sum: 1 }
            }
        },

        // 6. Sort by date
        {
            $sort: {
                '_id.year': 1,
                '_id.month': 1
            }
        },

        // 7. Project for final output shape
        {
            $project: {
                _id: 0,
                year: '$_id.year',
                month: '$_id.month',
                date: {
                    $dateFromParts: {
                        'year': '$_id.year',
                        'month': '$_id.month',
                        'day': 1
                    }
                },
                grades: 1,
                count: 1,
            }
        }
    ];

    const results = await StudentEnrollment.aggregate(pipeline);

    // Calculate average grade for each month
    const report = results.map(item => {
        const numericGrades = item.grades.map(grade => gradeToNumber(grade)).filter(g => g > 0); // filter out F (0)
        const averageGrade = numericGrades.length > 0
            ? (numericGrades.reduce((a, b) => a + b, 0) / numericGrades.length).toFixed(2)
            : 0;

        return {
            ...item,
            averageGrade: parseFloat(averageGrade)
        };
    });

    // Also, generate a summary table
    const tableDataPipeline = [
        ...pipeline.slice(0, 4), // Reuse the same initial filtering
        {
            $group: {
                _id: '$grade',
                count: { $sum: 1 }
            }
        },
        {
            $sort: {
                _id: 1
            }
        },
        {
            $project: {
                grade: '$_id',
                count: 1,
                _id: 0
            }
        }
    ];

    const tableData = await StudentEnrollment.aggregate(tableDataPipeline);
    const totalGrades = tableData.reduce((sum, item) => sum + item.count, 0);

    return {
        monthlyTrend: report,
        summary: tableData.map(item => ({ ...item, percentage: totalGrades > 0 ? ((item.count / totalGrades) * 100).toFixed(2) : 0 })),
        total: totalGrades,
    };
};
