# Course Versioning System

## Overview

This system implements a robust, versioned course management approach that solves the problem of course changes breaking student links while maintaining comprehensive statistics and temporal tracking.

## Architecture

### 1. Hierarchical Structure

```
Programs (e.g., "Gymnasieprogram")
├── CoursePackages (e.g., "Språkpaket")
    ├── MainCourses (e.g., "Svenska 1") - Static definitions
        ├── CourseInstances (e.g., "Svenska 1 - 2024-01-15 to 2024-06-15") - Temporal versions
            ├── StudentEnrollments - Individual student participation
```

### 2. Key Components

#### Main Courses (Static Definitions)

-   **Purpose**: Define the core course information that doesn't change
-   **Contains**: Course name, code, points, extent
-   **Benefits**:
    -   Can be updated without breaking historical data
    -   Maintains course catalog integrity
    -   Supports fuzzy matching for student enrollments

#### Course Instances (Temporal Versions)

-   **Purpose**: Represent specific time-bound versions of courses
-   **Contains**: Start/end dates, instance-specific data, statistics
-   **Benefits**:
    -   Preserves historical course information
    -   Enables temporal analysis
    -   Supports overlapping course periods

#### Student Enrollments (Individual Participation)

-   **Purpose**: Track individual student participation and progress
-   **Contains**: Status, grades, attendance, payment info, history
-   **Benefits**:
    -   Complete student journey tracking
    -   Comprehensive statistics
    -   Audit trail for all changes

## How It Works

### 1. Student Upload Process

When students are uploaded via Excel:

1. **Fuzzy Matching**: Course names are cleaned and matched against main courses using Levenshtein distance
2. **Instance Creation**: If no matching course instance exists for the date range, one is automatically created
3. **Enrollment Creation**: Student enrollments are created linking students to specific course instances
4. **Alerts**: System alerts about new course instances or unmatched courses

### 2. Course Updates

When main courses are updated:

1. **Historical Preservation**: Existing course instances retain their original data
2. **New Instances**: New enrollments use updated course information
3. **Statistics**: All historical statistics remain intact
4. **Flexibility**: Course instances can override main course data if needed

### 3. Statistics and Reporting

The system provides comprehensive statistics:

-   **Course Level**: Enrollment counts, completion rates, dropout rates
-   **Instance Level**: Specific period performance metrics
-   **Student Level**: Complete enrollment history and progress tracking
-   **Temporal Analysis**: Performance trends over time

## API Endpoints

### Course Matching

-   `GET /api/course-match` - Find best course match for a name
-   `POST /api/process-education` - Process student education entries

### Course Instances

-   `GET /api/course-instances` - Get course instances with filters
-   `POST /api/course-instances` - Create new course instance

### Student Enrollments

-   `GET /api/students/:studentId/enrollments` - Get student enrollment history
-   `PUT /api/enrollments/:enrollmentId/status` - Update enrollment status

### Statistics

-   `GET /api/course-statistics` - Get course performance statistics

## Benefits

### 1. Robustness

-   **No Broken Links**: Course changes don't affect historical data
-   **Data Integrity**: All student-course relationships are preserved
-   **Audit Trail**: Complete history of all changes

### 2. Flexibility

-   **Modular Design**: Easy to update course catalog
-   **Temporal Support**: Handles overlapping course periods
-   **Customization**: Course instances can override main course data

### 3. Analytics

-   **Comprehensive Statistics**: Track everything from enrollment to completion
-   **Temporal Analysis**: Performance trends over time
-   **Student Journeys**: Complete tracking of individual progress

### 4. User Experience

-   **Automatic Matching**: Fuzzy matching reduces manual work
-   **Smart Alerts**: Notifies about new course instances
-   **Seamless Updates**: Course changes don't break existing functionality

## Implementation Notes

### Fuzzy Matching

-   Uses `fastest-levenshtein` for efficient string matching
-   Configurable threshold (default: 0.7)
-   Matches against both course names and codes
-   Cleans course names for better matching

### Database Design

-   Proper indexing for efficient queries
-   Referential integrity maintained
-   Optimized for temporal queries

### Performance

-   Efficient aggregation queries for statistics
-   Lazy loading of related data
-   Proper indexing on date ranges

## Migration Strategy

1. **Phase 1**: Deploy new models and services
2. **Phase 2**: Update student upload process to use new system
3. **Phase 3**: Migrate existing student-course relationships
4. **Phase 4**: Enable new statistics and reporting features

## Future Enhancements

-   **Program/CoursePackage Support**: Extend to handle program and package enrollments
-   **Advanced Analytics**: Machine learning for dropout prediction
-   **Integration**: Connect with external learning management systems
-   **Reporting**: Advanced dashboards and automated reports
