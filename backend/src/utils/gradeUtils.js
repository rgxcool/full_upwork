export const gradeToNumber = (grade) => {
  const gradeMap = {
    'A': 5,
    'B': 4,
    'C': 3,
    'D': 2,
    'E': 1,
    'F': 0,
  };
  return gradeMap[(grade || '').toUpperCase()] || 0;
};
