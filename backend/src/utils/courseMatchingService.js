import { distance } from "fastest-levenshtein";

class CourseMatchingService {
    /**
     * Helper: get next Monday
     */
    static getNextMonday(date) {
        const d = new Date(date);
        const day = d.getDay();
        const diff = day === 1 ? 0 : (8 - day) % 7;
        d.setDate(d.getDate() + diff);
        d.setHours(0, 0, 0, 0);
        return d;
    }

    /**
     * Helper: add weeks
     */
    static addWeeks(date, weeks) {
        const d = new Date(date);
        d.setDate(d.getDate() + weeks * 7);
        return d;
    }

    /**
     * Helper: get Wednesday of week X (1-based, relative to start)
     */
    static getWednesdayOfWeek(startDate, weekNum) {
        const d = new Date(startDate);
        d.setDate(d.getDate() + (weekNum - 1) * 7);
        d.setDate(d.getDate() + ((3 - d.getDay() + 7) % 7)); // 3 = Wednesday
        d.setHours(0, 0, 0, 0);
        return d;
    }

    /**
     * Clean course name for better matching
     */
    static cleanCourseName(name) {
        return name
            .toUpperCase()
            .replace(/\(.*?\)/g, "") // Remove parentheses
            .replace(/\bmot\b/gi, "") // Remove "mot"
            .replace(/[,;|]/g, "") // Remove separators
            .replace(/\s+/g, " ") // Collapse spaces
            .trim();
    }

    /**
     * Find the best matching course using fuzzy matching
     */
    static async findBestCourseMatch(courseName, threshold = 0.7) {
        const { default: Course } = await import("../models/Course.js");
        const cleanedName = this.cleanCourseName(courseName);

        // Get all courses
        const allCourses = await Course.find({ isActive: true });

        let bestMatch = null;
        let bestScore = 0;

        for (const course of allCourses) {
            const courseNameDistance = distance(
                cleanedName,
                this.cleanCourseName(course.courseName)
            );
            const courseCodeDistance = distance(
                cleanedName,
                this.cleanCourseName(course.courseCode)
            );

            // Convert distance to similarity score (0-1, where 1 is exact match)
            const maxLength = Math.max(
                cleanedName.length,
                course.courseName.length,
                course.courseCode.length
            );
            const courseNameScore = 1 - courseNameDistance / maxLength;
            const courseCodeScore = 1 - courseCodeDistance / maxLength;

            const score = Math.max(courseNameScore, courseCodeScore);

            if (score > bestScore) {
                bestScore = score;
                bestMatch = { course, score };
            }
        }

        return bestScore >= threshold ? bestMatch : null;
    }

    /**
     * Find or create course instance for a specific date range
     */
    static async findOrCreateCourseInstance(
        mainCourseId,
        startDate,
        endDate,
        userId = null,
        responsibleTeacherId = null,
        slutprovDate = null
    ) {
        const { default: CourseInstance } = await import(
            "../models/CourseInstance.js"
        );
        const { default: Course } = await import("../models/Course.js");
        // Only match on exact course + startDate + endDate
        const existingInstance = await CourseInstance.findOne({
            mainCourseId,
            startDate,
            endDate,
        });

        if (existingInstance) {
            // Always set slutprovDate to the explicit value if provided
            if (slutprovDate) {
                existingInstance.slutprovDate = slutprovDate;
                await existingInstance.save();
                console.log(
                    `[FORCE PATCH] Set slutprovDate for course instance: ${existingInstance.courseName} to ${slutprovDate}`
                );
            }
            console.log(
                `✅ Found existing course instance: ${
                    existingInstance.courseName
                } (${existingInstance.startDate.toDateString()} - ${existingInstance.endDate.toDateString()})`
            );
            return { instance: existingInstance, wasCreated: false };
        }

        // If no existing instance, create a new one
        const mainCourse = await Course.findById(mainCourseId);
        if (!mainCourse) {
            throw new Error(`Main course not found: ${mainCourseId}`);
        }

        const newInstance = new CourseInstance({
            mainCourseId,
            startDate,
            endDate,
            courseName: mainCourse.courseName,
            courseCode: mainCourse.courseCode,
            coursePoints: mainCourse.coursePoints,
            courseExtent: mainCourse.courseExtent,
            createdBy: userId,
            responsibleTeacher: responsibleTeacherId || undefined,
            notes: `Auto-created for student enrollment (${startDate.toDateString()} - ${endDate.toDateString()})`,
            slutprovDate: slutprovDate || undefined,
        });

        await newInstance.save();

        console.log(
            `🆕 Created new course instance: ${
                newInstance.courseName
            } (${newInstance.startDate.toDateString()} - ${newInstance.endDate.toDateString()})`
        );

        return { instance: newInstance, wasCreated: true };
    }

    /**
     * Process student education entries and create enrollments
     */
    static async processStudentEducation(
        studentId,
        educationEntries,
        userId = null
    ) {
        const { default: StudentEnrollment } = await import(
            "../models/StudentEnrollment.js"
        );
        const results = {
            enrollments: [],
            warnings: [],
            errors: [],
        };

        console.log(
            `[DEBUG] 🔄 Processing ${educationEntries.length} education entries for student ${studentId}`
        );

        // Deduplicate missing package errors
        const missingPackages = new Set();
        for (const entry of educationEntries) {
            try {
                // --- PATCH: Improved normalization and fuzzy matching for course packages ---
                const { default: CoursePackage } = await import(
                    "../models/CoursePackage.js"
                );
                const allPackages = await CoursePackage.find({}).lean();
                function normalizeName(name) {
                    return (name || "")
                        .toUpperCase()
                        .replace(/[,;|]/g, "") // Remove commas, semicolons, pipes
                        .replace(/\s+/g, " ") // Collapse spaces
                        .trim();
                }
                const normalizedEntryName = normalizeName(entry.name)
                    .replace(/[-\s]*\d+\s*v$/i, "")
                    .replace(/[-\s]*\d+v$/i, "")
                    .replace(/\d+v$/i, "");
                // Try exact match first
                let packageMatch = allPackages.find(
                    (pkg) =>
                        normalizeName(pkg.coursePackageName) ===
                        normalizedEntryName
                );
                // Fallback: fuzzy match for long names (distance <= 1)
                if (!packageMatch) {
                    let best = null,
                        minDist = Infinity;
                    for (const pkg of allPackages) {
                        const normPkg = normalizeName(pkg.coursePackageName);
                        const d = distance(normalizedEntryName, normPkg);
                        if (d < minDist) {
                            minDist = d;
                            best = pkg;
                        }
                    }
                    if (normalizedEntryName.length > 12 && minDist <= 1) {
                        packageMatch = best;
                        console.log(
                            `[DEBUG] Fuzzy matched package: '${entry.name}' → '${best.coursePackageName}' (distance ${minDist})`
                        );
                    }
                }
                if (packageMatch) {
                    if (entry.type !== "CoursePackage") {
                        console.log(
                            `[DEBUG] Name '${normalizedEntryName}' matches a CoursePackage. Forcing type to CoursePackage.`
                        );
                    }
                    entry.type = "CoursePackage";
                    entry.refId = packageMatch._id;
                }
                if (
                    entry.type === "Course" &&
                    entry.startDate &&
                    entry.endDate
                ) {
                    // Find the best course match
                    const match = await this.findBestCourseMatch(entry.name);

                    if (!match) {
                        results.warnings.push({
                            type: "no_match",
                            courseName: entry.name,
                            message: `No matching course found for \"${entry.name}\"`,
                        });
                        continue;
                    }

                    // Determine slutprovDate:
                    console.log(
                        `[DEBUG] entry.slutprovDate for course ${entry.name}:`,
                        entry.slutprovDate
                    );
                    let slutprovDate;
                    if (entry.slutprovDate) {
                        slutprovDate = new Date(entry.slutprovDate);
                        console.log(
                            `[DEBUG] Using explicit slutprovDate for course ${entry.name}:`,
                            slutprovDate
                        );
                    } else {
                        slutprovDate = this.getWednesdayOfWeek(
                            new Date(entry.startDate),
                            4
                        );
                        console.log(
                            `[DEBUG] Using fallback slutprovDate for course ${entry.name}:`,
                            slutprovDate
                        );
                    }

                    // Find or create course instance, pass responsibleTeacherId
                    const { instance, wasCreated } =
                        await this.findOrCreateCourseInstance(
                            match.course._id,
                            new Date(entry.startDate),
                            new Date(entry.endDate),
                            userId,
                            entry.teacherId || null,
                            slutprovDate
                        );
                    console.log(
                        `[DEBUG] CourseInstance created/used for course ${entry.name}:`,
                        instance && instance.slutprovDate
                    );

                    if (wasCreated) {
                        results.warnings.push({
                            type: "instance_created",
                            courseName: entry.name,
                            instanceId: instance._id,
                            message: `Created new course instance for "${
                                entry.name
                            }" (${instance.startDate.toDateString()} - ${instance.endDate.toDateString()})`,
                        });
                    }

                    // Add this check before creating a new StudentEnrollment
                    const existingEnrollment = await StudentEnrollment.findOne({
                        studentId,
                        courseInstanceId: instance._id,
                        mainCourseId: match.course._id,
                        startDate: new Date(entry.startDate),
                        endDate: new Date(entry.endDate),
                    });
                    if (existingEnrollment) {
                        console.log(
                            `[DEDUP] Skipping duplicate enrollment for student ${studentId} in course ${match.course._id} (${entry.startDate} - ${entry.endDate})`
                        );
                        continue;
                    }

                    // Get student to find teacherId
                    let studentDocA;
                    if (!global._StudentModel) {
                        const studentDocImport = await import(
                            "../models/Student.js"
                        );
                        global._StudentModel = studentDocImport.default;
                    }
                    studentDocA = await global._StudentModel.findById(
                        studentId
                    );

                    // Create enrollment
                    const enrollment = new StudentEnrollment({
                        studentId,
                        courseInstanceId: instance._id,
                        mainCourseId: match.course._id,
                        startDate: new Date(entry.startDate),
                        endDate: new Date(entry.endDate),
                        status: "enrolled",
                        teacherId:
                            studentDocA?.teacherId || entry.teacherId || null,
                        notes: entry.notes || null,
                    });
                    console.log(
                        `[DEBUG] Creating individual course enrollment with teacherId: ${
                            enrollment.teacherId || "null"
                        } (studentDocA.teacherId: ${
                            studentDocA?.teacherId || "null"
                        }, entry.teacherId: ${entry.teacherId || "null"})`
                    );

                    await enrollment.save();
                    // Attach student email for frontend display
                    // studentDocA is already loaded above
                    results.enrollments.push({
                        ...enrollment.toObject(),
                        studentEmail: studentDocA?.email || "",
                        courseInstanceName: instance.courseName || "",
                    });
                    console.log(
                        `✅ Created enrollment for student ${studentId} in course ${entry.name} (CourseInstance: ${instance._id})`
                    );

                    // Create calendar event for slutprov for individual courses
                    try {
                        console.log(
                            `[DEBUG] 🗓️ Starting calendar event creation for individual course ${entry.name}`
                        );
                        const CalendarEvent = (
                            await import("../models/Event.js")
                        ).default;

                        // Use provided slutprov date or calculate as Wednesday of week 4
                        const courseStart = new Date(entry.startDate);
                        let slutprovDate;
                        if (entry.slutprovDate) {
                            slutprovDate = new Date(entry.slutprovDate);
                            console.log(
                                `[DEBUG] 📅 Using provided slutprov date for individual course: ${slutprovDate.toDateString()}`
                            );
                        } else {
                            slutprovDate = this.getWednesdayOfWeek(
                                courseStart,
                                4
                            );
                            console.log(
                                `[DEBUG] 📅 Calculated slutprov date for individual course (Wednesday week 4): ${slutprovDate.toDateString()}`
                            );
                        }

                        // Validate the slutprov date
                        if (isNaN(slutprovDate.getTime())) {
                            console.error(
                                `[ERROR] Invalid slutprov date for individual course: ${
                                    entry.slutprovDate || "calculated"
                                }`
                            );
                            continue;
                        }

                        // Set slutprov date on enrollment
                        enrollment.slutprovDate = slutprovDate;
                        await enrollment.save();

                        console.log(
                            `[DEBUG] 🗓️ Student found for individual course: ${
                                studentDocA ? studentDocA.name : "NOT FOUND"
                            }`
                        );

                        // DISABLED: Individual calendar event creation to prevent duplicates
                        // Calendar events are now handled by the deduplication system in /calendar-events/syncable
                        // This prevents duplicate events where students appear both individually and in grouped events

                        // if (studentDocA) {
                        //     // Check if event already exists for this student and course on this date
                        //     const existingEvent = await CalendarEvent.findOne({
                        //         title: { $regex: /^Slutprov/i },
                        //         start: slutprovDate,
                        //         'extendedProps.students._id': studentDocA._id,
                        //         'extendedProps.type': 'slutprov'
                        //     });
                        //
                        //     if (!existingEvent) {
                        //         const event = new CalendarEvent({
                        //             title: `Slutprov - ${entry.name}`,
                        //             start: slutprovDate,
                        //             color: '#ff6b6b', // Red color for exams
                        //             extendedProps: {
                        //                 teacher: studentDocA.teacher || 'Unknown',
                        //                 teacherId: studentDocA.teacherId || null,
                        //                 type: 'slutprov',
                        //                 examMunicipality: studentDocA.examMunicipality || '',
                        //                 examLocation: studentDocA.examLocation || '',
                        //                 examTime: studentDocA.examTime || '',
                        //                 students: [{
                        //                     _id: studentDocA._id,
                        //                     name: studentDocA.name,
                        //                     personalNumber: studentDocA.personalNumber,
                        //                     additionalInfo: studentDocA.additionalInfo || '',
                        //                     attended: false
                        //                 }]
                        //             }
                        //         });
                        //
                        //         await event.save();
                        //         console.log(`✅ Created slutprov calendar event for student ${studentDocA.name} in course ${entry.name} on ${slutprovDate.toDateString()}`);
                        //     } else {
                        //         console.log(`ℹ️ Slutprov event already exists for student ${studentDocA.name} in course ${entry.name} on ${slutprovDate.toDateString()}`);
                        //     }
                        // }
                    } catch (eventError) {
                        console.error(
                            `❌ Failed to create slutprov calendar event for student ${studentId} in course ${entry.name}:`,
                            eventError
                        );
                    }

                    // --- PATCH: Update student's education array for ALL types ---
                    if (studentDocA) {
                        // Remove any existing education entry for this course and date range
                        studentDocA.education = (
                            studentDocA.education || []
                        ).filter((e) => {
                            if (e.type !== "Course") return true;
                            if (!e.refId) return true;
                            return (
                                e.refId.toString() !==
                                    match.course._id.toString() ||
                                new Date(e.startDate).getTime() !==
                                    new Date(entry.startDate).getTime() ||
                                new Date(e.endDate).getTime() !==
                                    new Date(entry.endDate).getTime()
                            );
                        });
                        // Add the new education entry (always, regardless of type)
                        studentDocA.education.push({
                            type: "Course",
                            refId: match.course._id,
                            name: match.course.courseName,
                            startDate: new Date(entry.startDate),
                            endDate: new Date(entry.endDate),
                            grade: null,
                            addedAt: new Date(),
                            addedBy: userId,
                            removedAt: null,
                        });
                        await studentDocA.save();
                    }
                    // --- END PATCH ---
                }
                // --- PATCH: Handle CoursePackage and Program types as well ---
                else if (entry.type === "CoursePackage" && entry.refId) {
                    // Retrieve the course package and its courses (ordered)
                    const CoursePackageModel = (
                        await import("../models/CoursePackage.js")
                    ).default;
                    const packageDoc = await CoursePackageModel.findById(
                        entry.refId
                    ).populate("coursePackageCourses");
                    if (!packageDoc) {
                        results.errors.push({
                            type: "no_package",
                            packageId: entry.refId,
                            message: `No course package found for id ${entry.refId}`,
                        });
                        continue;
                    }

                    // Start scheduling
                    let courseStart = this.getNextMonday(
                        entry.startDate || new Date()
                    );
                    let i = 0;

                    while (i < packageDoc.coursePackageCourses.length) {
                        // Get current course details
                        const courseId = packageDoc.coursePackageCourses[i];
                        const course =
                            typeof courseId === "object"
                                ? courseId
                                : await import(
                                      "../models/Course.js"
                                  ).default.findById(courseId);
                        const extentWeeks =
                            parseFloat(course.courseExtent) || 5; // Use parseFloat to handle 2.5

                        // Check if this course has 2.5 extent and if there's a next course
                        let shouldGroup = false;
                        let nextCourse = null;
                        let nextExtentWeeks = 0;

                        if (
                            extentWeeks === 2.5 &&
                            i + 1 < packageDoc.coursePackageCourses.length
                        ) {
                            const nextCourseId =
                                packageDoc.coursePackageCourses[i + 1];
                            nextCourse =
                                typeof nextCourseId === "object"
                                    ? nextCourseId
                                    : await import(
                                          "../models/Course.js"
                                      ).default.findById(nextCourseId);
                            nextExtentWeeks =
                                parseFloat(nextCourse.courseExtent) || 5;

                            if (nextExtentWeeks === 2.5) {
                                shouldGroup = true;
                                console.log(
                                    `[DEBUG] 🔗 Grouping courses: '${course.courseName}' (2.5) + '${nextCourse.courseName}' (2.5)`
                                );
                            }
                        }

                        // Calculate course end date
                        let courseEnd;
                        if (shouldGroup) {
                            // For grouped courses, use combined extent (5 weeks total)
                            courseEnd = this.addWeeks(courseStart, 5);
                        } else {
                            courseEnd = this.addWeeks(courseStart, extentWeeks);
                        }

                        // Process current course
                        const { instance: courseInstance, wasCreated } =
                            await this.findOrCreateCourseInstance(
                                course._id,
                                courseStart,
                                courseEnd,
                                userId,
                                entry.teacherId || null
                            );
                        console.log(
                            `[DEBUG] Processing course: '${course.courseName}' | Found/created CourseInstance:`,
                            courseInstance ? courseInstance._id : null
                        );
                        if (!courseInstance || !courseInstance._id) {
                            console.warn(
                                `[WARN] No CourseInstance found/created for course '${course.courseName}'. Skipping enrollment for this course.`
                            );
                            i++;
                            continue;
                        }

                        // Add this check before creating a new StudentEnrollment
                        const existingEnrollment =
                            await StudentEnrollment.findOne({
                                studentId,
                                courseInstanceId: courseInstance._id,
                                mainCourseId: course._id,
                                startDate: courseStart,
                                endDate: courseEnd,
                            });
                        if (existingEnrollment) {
                            console.log(
                                `[DEDUP] Skipping duplicate enrollment for student ${studentId} in course ${course._id} (${courseStart} - ${courseEnd})`
                            );
                            i++;
                            continue;
                        }

                        // Get student to find teacherId
                        let studentDocB;
                        if (!global._StudentModel) {
                            const studentDocImport = await import(
                                "../models/Student.js"
                            );
                            global._StudentModel = studentDocImport.default;
                        }
                        studentDocB = await global._StudentModel.findById(
                            studentId
                        );

                        // Create enrollment for current course
                        const enrollment = new StudentEnrollment({
                            studentId,
                            courseInstanceId: courseInstance._id,
                            mainCourseId: course._id,
                            startDate: courseStart,
                            endDate: courseEnd,
                            status: "enrolled",
                            teacherId:
                                studentDocB?.teacherId ||
                                entry.teacherId ||
                                null,
                            notes: entry.notes || null,
                        });
                        console.log(
                            `[DEBUG] Creating enrollment with teacherId: ${
                                enrollment.teacherId || "null"
                            } (studentDocB.teacherId: ${
                                studentDocB?.teacherId || "null"
                            }, entry.teacherId: ${entry.teacherId || "null"})`
                        );
                        console.log(
                            "[DEBUG] StudentEnrollment to be created:",
                            enrollment.toObject()
                        );
                        await enrollment.save();

                        // Attach student email for frontend display
                        if (enrollment.courseInstanceId) {
                            results.enrollments.push({
                                ...enrollment.toObject(),
                                studentEmail: studentDocB?.email || "",
                                courseInstanceName:
                                    courseInstance.courseName || "",
                            });
                            console.log(
                                `✅ Created enrollment for student ${studentId} in course ${course.courseName} (CourseInstance: ${courseInstance._id})`
                            );
                        } else {
                            console.warn(
                                "[WARN] Skipping enrollment with missing courseInstanceId:",
                                enrollment.toObject()
                            );
                        }

                        // Calculate slutprov date - for grouped courses, use the same date for both
                        let slutprovDate;
                        if (entry.slutprovDate) {
                            slutprovDate = new Date(entry.slutprovDate);
                            console.log(
                                `[DEBUG] 📅 Using provided slutprov date: ${slutprovDate.toDateString()}`
                            );
                        } else {
                            slutprovDate = this.getWednesdayOfWeek(
                                courseStart,
                                4
                            );
                            console.log(
                                `[DEBUG] 📅 Calculated slutprov date (Wednesday week 4): ${slutprovDate.toDateString()}`
                            );
                        }

                        // Validate the slutprov date
                        if (isNaN(slutprovDate.getTime())) {
                            console.error(
                                `[ERROR] Invalid slutprov date: ${
                                    entry.slutprovDate || "calculated"
                                }`
                            );
                            i++;
                            continue;
                        }

                        enrollment.slutprovDate = slutprovDate;
                        await enrollment.save();

                        console.log(
                            `📅 Slutprov date set for student ${studentId} in course ${
                                course.courseName
                            }: ${slutprovDate.toDateString()}`
                        );

                        // Add to education array
                        let studentDocC;
                        if (!global._StudentModel) {
                            const studentDocImport = await import(
                                "../models/Student.js"
                            );
                            global._StudentModel = studentDocImport.default;
                        }
                        studentDocC = await global._StudentModel.findById(
                            studentId
                        );

                        if (studentDocC) {
                            const exists = (studentDocC.education || []).some(
                                (e) =>
                                    e.type === "Course" &&
                                    e.refId &&
                                    e.refId.toString() ===
                                        course._id.toString() &&
                                    new Date(e.startDate).getTime() ===
                                        courseStart.getTime() &&
                                    new Date(e.endDate).getTime() ===
                                        courseEnd.getTime()
                            );
                            if (!exists) {
                                studentDocC.education.push({
                                    type: "Course",
                                    refId: course._id,
                                    name: course.courseName,
                                    startDate: courseStart,
                                    endDate: courseEnd,
                                    grade: null,
                                    addedAt: new Date(),
                                    addedBy: userId,
                                    removedAt: null,
                                });
                                await studentDocC.save();
                            }
                        }

                        // If we're grouping courses, process the next course as well
                        if (shouldGroup && nextCourse) {
                            console.log(
                                `[DEBUG] 🔗 Processing grouped course: '${nextCourse.courseName}'`
                            );

                            // Create CourseInstance for next course (same dates as current course)
                            const {
                                instance: nextCourseInstance,
                                wasCreated: nextWasCreated,
                            } = await this.findOrCreateCourseInstance(
                                nextCourse._id,
                                courseStart,
                                courseEnd,
                                userId,
                                entry.teacherId || null
                            );

                            if (nextCourseInstance && nextCourseInstance._id) {
                                // Add this check before creating a new StudentEnrollment
                                const existingEnrollment =
                                    await StudentEnrollment.findOne({
                                        studentId,
                                        courseInstanceId:
                                            nextCourseInstance._id,
                                        mainCourseId: nextCourse._id,
                                        startDate: courseStart,
                                        endDate: courseEnd,
                                    });
                                if (existingEnrollment) {
                                    console.log(
                                        `[DEDUP] Skipping duplicate enrollment for student ${studentId} in course ${nextCourse._id} (${courseStart} - ${courseEnd})`
                                    );
                                    i += 2;
                                    continue;
                                }

                                // Create enrollment for next course
                                const nextEnrollment = new StudentEnrollment({
                                    studentId,
                                    courseInstanceId: nextCourseInstance._id,
                                    mainCourseId: nextCourse._id,
                                    startDate: courseStart,
                                    endDate: courseEnd,
                                    status: "enrolled",
                                    teacherId:
                                        studentDocB?.teacherId ||
                                        entry.teacherId ||
                                        null,
                                    notes: entry.notes || null,
                                });

                                await nextEnrollment.save();

                                // Use the same slutprov date for the grouped course
                                nextEnrollment.slutprovDate = slutprovDate;
                                await nextEnrollment.save();

                                console.log(
                                    `✅ Created grouped enrollment for student ${studentId} in course ${nextCourse.courseName} (CourseInstance: ${nextCourseInstance._id})`
                                );
                                console.log(
                                    `📅 Same slutprov date for grouped course ${
                                        nextCourse.courseName
                                    }: ${slutprovDate.toDateString()}`
                                );

                                // Add to results
                                results.enrollments.push({
                                    ...nextEnrollment.toObject(),
                                    studentEmail: studentDocB?.email || "",
                                    courseInstanceName:
                                        nextCourseInstance.courseName || "",
                                });

                                // Add to education array
                                if (studentDocC) {
                                    const nextExists = (
                                        studentDocC.education || []
                                    ).some(
                                        (e) =>
                                            e.type === "Course" &&
                                            e.refId &&
                                            e.refId.toString() ===
                                                nextCourse._id.toString() &&
                                            new Date(e.startDate).getTime() ===
                                                courseStart.getTime() &&
                                            new Date(e.endDate).getTime() ===
                                                courseEnd.getTime()
                                    );
                                    if (!nextExists) {
                                        studentDocC.education.push({
                                            type: "Course",
                                            refId: nextCourse._id,
                                            name: nextCourse.courseName,
                                            startDate: courseStart,
                                            endDate: courseEnd,
                                            grade: null,
                                            addedAt: new Date(),
                                            addedBy: userId,
                                            removedAt: null,
                                        });
                                        await studentDocC.save();
                                    }
                                }
                            }

                            // Skip the next course in the next iteration since we've already processed it
                            i += 2;
                        } else {
                            // Move to next course
                            i++;
                        }

                        // Prepare for next course (or next group)
                        courseStart = this.getNextMonday(courseEnd);
                    }

                    // Add CoursePackage entry to student's education array for APL filtering
                    let studentDocD;
                    if (!global._StudentModel) {
                        const studentDocImport = await import(
                            "../models/Student.js"
                        );
                        global._StudentModel = studentDocImport.default;
                    }
                    studentDocD = await global._StudentModel.findById(
                        studentId
                    );
                    if (studentDocD) {
                        const exists = (studentDocD.education || []).some(
                            (e) =>
                                e.type === "CoursePackage" &&
                                e.refId &&
                                e.refId.toString() ===
                                    packageDoc._id.toString() &&
                                new Date(e.startDate).getTime() ===
                                    new Date(entry.startDate).getTime() &&
                                new Date(e.endDate).getTime() ===
                                    new Date(entry.endDate).getTime()
                        );
                        if (!exists) {
                            const packageStartDate = entry.startDate
                                ? new Date(entry.startDate)
                                : undefined;
                            const packageEndDate = entry.endDate
                                ? new Date(entry.endDate)
                                : undefined;

                            console.log(
                                `[DEBUG] 📦 Creating CoursePackage education entry:`
                            );
                            console.log(
                                `[DEBUG] 📦 Package: ${packageDoc.coursePackageName}`
                            );
                            console.log(
                                `[DEBUG] 📦 Entry startDate: ${entry.startDate} -> Parsed: ${packageStartDate}`
                            );
                            console.log(
                                `[DEBUG] 📦 Entry endDate: ${entry.endDate} -> Parsed: ${packageEndDate}`
                            );

                            studentDocD.education.push({
                                type: "CoursePackage",
                                refId: packageDoc._id,
                                name: packageDoc.coursePackageName,
                                startDate: packageStartDate,
                                endDate: packageEndDate,
                                grade: null,
                                addedAt: new Date(),
                                addedBy: userId,
                                removedAt: null,
                            });
                            await studentDocD.save();
                            console.log(
                                `✅ Added CoursePackage education entry for student ${
                                    studentDocD.name || studentDocD.email
                                } in package ${packageDoc.coursePackageName}`
                            );
                        }
                    }

                    // Optionally, create a StudentEnrollment for the package itself
                    // const packageEnrollment = new StudentEnrollment({
                    //     studentId,
                    //     coursePackageId: entry.refId,
                    //     startDate: entry.startDate ? new Date(entry.startDate) : undefined,
                    //     endDate: entry.endDate ? new Date(entry.endDate) : undefined,
                    //     status: "enrolled",
                    //     teacherId: entry.teacherId || null,
                    //     notes: entry.notes || null,
                    // });
                    // await packageEnrollment.save();
                    // // Add to results
                    // let studentDocD;
                    // if (!global._StudentModel) {
                    //     const studentDocImport = await import('../models/Student.js');
                    //     global._StudentModel = studentDocImport.default;
                    // }
                    // studentDocD = await global._StudentModel.findById(studentId);
                    // results.enrollments.push({
                    //     ...packageEnrollment.toObject(),
                    //     studentEmail: studentDocD?.email || '',
                    //     courseInstanceName: undefined,
                    // });
                    // Add to education array if not already present
                    // if (studentDocD) {
                    //     const exists = (studentDocD.education || []).some(e =>
                    //         e.type === 'CoursePackage' &&
                    //         e.refId && e.refId.toString() === entry.refId.toString()
                    //     );
                    //     if (!exists) {
                    //         studentDocD.education.push({
                    //             type: 'CoursePackage',
                    //             refId: entry.refId,
                    //             name: packageDoc.coursePackageName,
                    //             startDate: entry.startDate ? new Date(entry.startDate) : undefined,
                    //             endDate: entry.endDate ? new Date(entry.endDate) : undefined,
                    //             grade: null,
                    //             addedAt: new Date(),
                    //             addedBy: userId,
                    //             removedAt: null,
                    //         });
                    //         await studentDocD.save();
                    //     }
                    // }
                } else if (entry.type === "Course" && entry.name) {
                    console.log(
                        `[DEBUG] Processing individual course: '${entry.name}'`
                    );

                    // Find the best matching course
                    const courseMatch = await this.findBestCourseMatch(
                        entry.name
                    );
                    if (!courseMatch) {
                        results.warnings.push({
                            type: "no_match",
                            courseName: entry.name,
                            message: `No course match found for: ${entry.name}`,
                        });
                        continue;
                    }

                    const course = courseMatch.course;
                    console.log(
                        `[DEBUG] Matched individual course: '${entry.name}' → '${course.courseName}'`
                    );

                    // Calculate course dates
                    const courseStart = entry.startDate
                        ? new Date(entry.startDate)
                        : this.getNextMonday(new Date());
                    const extentWeeks = parseInt(course.courseExtent) || 5; // Default to 5 weeks if not set
                    const courseEnd = this.addWeeks(courseStart, extentWeeks);

                    // Find or create CourseInstance
                    const { instance: courseInstance, wasCreated } =
                        await this.findOrCreateCourseInstance(
                            course._id,
                            courseStart,
                            courseEnd,
                            userId,
                            entry.teacherId || null
                        );

                    console.log(
                        `[DEBUG] Processing individual course: '${course.courseName}' | Found/created CourseInstance:`,
                        courseInstance ? courseInstance._id : null
                    );
                    if (!courseInstance || !courseInstance._id) {
                        console.warn(
                            `[WARN] No CourseInstance found/created for individual course '${course.courseName}'. Skipping enrollment.`
                        );
                        continue;
                    }

                    // Add this check before creating a new StudentEnrollment
                    const existingEnrollment = await StudentEnrollment.findOne({
                        studentId,
                        courseInstanceId: courseInstance._id,
                        mainCourseId: course._id,
                        startDate: courseStart,
                        endDate: courseEnd,
                    });
                    if (existingEnrollment) {
                        console.log(
                            `[DEDUP] Skipping duplicate enrollment for student ${studentId} in course ${course._id} (${courseStart} - ${courseEnd})`
                        );
                        continue;
                    }

                    // Get student to find teacherId
                    let studentDoc;
                    if (!global._StudentModel) {
                        const studentDocImport = await import(
                            "../models/Student.js"
                        );
                        global._StudentModel = studentDocImport.default;
                    }
                    studentDoc = await global._StudentModel.findById(studentId);

                    // Create enrollment
                    const enrollment = new StudentEnrollment({
                        studentId,
                        courseInstanceId: courseInstance._id,
                        mainCourseId: course._id,
                        startDate: courseStart,
                        endDate: courseEnd,
                        status: "enrolled",
                        teacherId:
                            studentDoc?.teacherId || entry.teacherId || null,
                        notes: entry.notes || null,
                    });

                    console.log(
                        "[DEBUG] Individual course StudentEnrollment to be created:",
                        enrollment.toObject()
                    );
                    await enrollment.save();

                    // Attach student email for frontend display
                    // studentDoc is already loaded above

                    if (enrollment.courseInstanceId) {
                        results.enrollments.push({
                            ...enrollment.toObject(),
                            studentEmail: studentDoc?.email || "",
                            courseInstanceName: courseInstance.courseName || "",
                        });
                        console.log(
                            `✅ Created enrollment for student ${studentId} in individual course ${course.courseName} (CourseInstance: ${courseInstance._id})`
                        );
                    } else {
                        console.warn(
                            "[WARN] Skipping individual course enrollment with missing courseInstanceId:",
                            enrollment.toObject()
                        );
                    }

                    // Use provided slutprov date or calculate as Wednesday of week 4
                    let slutprovDate;
                    if (entry.slutprovDate) {
                        slutprovDate = new Date(entry.slutprovDate);
                        console.log(
                            `[DEBUG] 📅 Using provided slutprov date for individual course: ${slutprovDate.toDateString()}`
                        );
                    } else {
                        slutprovDate = this.getWednesdayOfWeek(courseStart, 4);
                        console.log(
                            `[DEBUG] 📅 Calculated slutprov date for individual course (Wednesday week 4): ${slutprovDate.toDateString()}`
                        );
                    }

                    // Validate the slutprov date
                    if (isNaN(slutprovDate.getTime())) {
                        console.error(
                            `[ERROR] Invalid slutprov date for individual course: ${
                                entry.slutprovDate || "calculated"
                            }`
                        );
                        continue;
                    }

                    enrollment.slutprovDate = slutprovDate;
                    await enrollment.save(); // Save the updated enrollment with slutprovDate

                    // Note: Calendar events are now generated automatically by the /calendar-events/syncable endpoint
                    // based on StudentEnrollment.slutprovDate, so we don't need to create them here
                    console.log(
                        `📅 Slutprov date set for student ${studentId} in individual course ${
                            course.courseName
                        }: ${slutprovDate.toDateString()}`
                    );

                    // Add to education array if not already present
                    if (studentDoc) {
                        const exists = (studentDoc.education || []).some(
                            (e) =>
                                e.type === "Course" &&
                                e.refId &&
                                e.refId.toString() === course._id.toString() &&
                                new Date(e.startDate).getTime() ===
                                    courseStart.getTime() &&
                                new Date(e.endDate).getTime() ===
                                    courseEnd.getTime()
                        );
                        if (!exists) {
                            studentDoc.education.push({
                                type: "Course",
                                refId: course._id,
                                name: course.courseName,
                                startDate: courseStart,
                                endDate: courseEnd,
                                grade: null,
                                addedAt: new Date(),
                                addedBy: userId,
                                removedAt: null,
                            });
                            await studentDoc.save();
                            console.log(
                                `✅ Added individual course education entry for student ${
                                    studentDoc.name || studentDoc.email
                                } in course ${course.courseName}`
                            );
                        }
                    }
                } else if (entry.type === "Program" && entry.refId) {
                    // Add to student's education array if not already present
                    let studentDocE;
                    if (!global._StudentModel) {
                        const studentDocImport = await import(
                            "../models/Student.js"
                        );
                        global._StudentModel = studentDocImport.default;
                    }
                    studentDocE = await global._StudentModel.findById(
                        studentId
                    );
                    // Create enrollment for CoursePackage or Program
                    const programEnrollment = new StudentEnrollment({
                        studentId,
                        programId: entry.refId,
                        startDate: entry.startDate
                            ? new Date(entry.startDate)
                            : undefined,
                        endDate: entry.endDate
                            ? new Date(entry.endDate)
                            : undefined,
                        status: "enrolled",
                        teacherId: entry.teacherId || null,
                        notes: entry.notes || null,
                    });
                    await programEnrollment.save();
                    results.enrollments.push({
                        ...programEnrollment.toObject(),
                        studentEmail: studentDocE?.email || "",
                        courseInstanceName: undefined,
                    });
                    // Add to education array if not already present
                    if (studentDocE) {
                        const exists = (studentDocE.education || []).some(
                            (e) =>
                                e.type === "Program" &&
                                e.refId &&
                                e.refId.toString() === entry.refId.toString()
                        );
                        if (!exists) {
                            studentDocE.education.push({
                                type: "Program",
                                refId: entry.refId,
                                name: entry.name,
                                startDate: entry.startDate
                                    ? new Date(entry.startDate)
                                    : undefined,
                                endDate: entry.endDate
                                    ? new Date(entry.endDate)
                                    : undefined,
                                grade: null,
                                addedAt: new Date(),
                                addedBy: userId,
                                removedAt: null,
                            });
                            await studentDocE.save();
                        }
                    }
                }
            } catch (error) {
                results.errors.push({
                    type: "processing_error",
                    courseName: entry.name,
                    message: error.message,
                });
                console.error(
                    `❌ Error processing education entry for student ${studentId}: ${error.message}`
                );
            }
        }

        console.log(
            `[DEBUG] ✅ Finished processing ${educationEntries.length} education entries for student ${studentId}. Total enrollments created: ${results.enrollments.length}`
        );

        // Before returning, filter out any enrollments with missing courseInstanceId
        results.enrollments = results.enrollments.filter((enrollment) => {
            if (!enrollment.courseInstanceId) {
                console.warn(
                    `[WARN] Filtering out enrollment with missing courseInstanceId:`,
                    enrollment
                );
                return false;
            }
            return true;
        });

        return results;
    }
}

export default CourseMatchingService;
