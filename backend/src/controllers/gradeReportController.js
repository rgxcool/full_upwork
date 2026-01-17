import { generateGradeReport } from '../services/gradeReportService.js';
// TODO: Add validation with Joi, once it is added as a dependency.

export const getGradeReport = async (req, res) => {
    try {
        const { municipality, courseId, startDate, endDate } = req.query;
        // Basic validation
        if (!startDate || !endDate) {
            return res.status(400).json({ message: 'startDate and endDate are required' });
        }
        
        const report = await generateGradeReport({ municipality, courseId, startDate, endDate });
        res.status(200).json(report);
    } catch (err) {
        console.error('Error generating grade report:', err);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};
