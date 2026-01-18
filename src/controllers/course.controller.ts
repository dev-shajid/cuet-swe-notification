import { Response } from 'express';
import { notificationQueue, QUEUE_EVENTS } from '../config/queue';
import { AuthRequest } from '../middleware/auth.middleware';
import {
  AttendanceRecord,
  AttendanceSession,
  ClassTest,
  Course,
  CourseTeacher,
  Mark,
  Student,
  StudentEnrollment,
  Teacher,
} from '../models';
import {
  IAddEnrollmentDTO,
  ICreateCourseDTO,
  IUpdateCourseDTO,
  IUpdateEnrollmentDTO,
} from '../types';

export class CourseController {
  /**
   * Helper: Get all students within a given ID range
   */
  static async getStudentsInRange(startId: number, endId: number) {
    return Student.find({
      studentId: {
        $gte: startId,
        $lte: endId,
      },
    });
  }

  /**
   * Helper: Get all students already enrolled in a course
   */
  static async getAlreadyEnrolledStudents(courseId: string) {
    const enrollments = await StudentEnrollment.find({ course: courseId });
    const studentIds = new Set<number>();

    for (const enrollment of enrollments) {
      for (let id = enrollment.startId; id <= enrollment.endId; id++) {
        studentIds.add(id);
      }
    }

    if (studentIds.size === 0) return [];

    return Student.find({
      studentId: { $in: Array.from(studentIds) },
    });
  }

  // Create course
  static async createCourse(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { code, name, credit, batch, isSessional, bestCTCount }: ICreateCourseDTO = req.body;
      const teacherEmail = req.user!.email;

      // Validate teacher exists
      const teacher = await Teacher.findOne({ email: teacherEmail });
      if (!teacher) {
        res.status(404).json({ success: false, message: 'Teacher not found' });
        return;
      }

      // Check if course code already exists
      const existing = await Course.findOne({ code });
      if (existing) {
        res.status(400).json({ success: false, message: 'Course code already exists' });
        return;
      }

      // Create course
      const course = await Course.create({
        code,
        name: name || code,
        owner: teacher._id,
        ownerEmail: teacherEmail,
        credit,
        batch,
        isSessional: isSessional || false,
        bestCTCount: !isSessional ? bestCTCount : undefined,
      });

      // Create owner membership
      await CourseTeacher.create({
        course: course._id,
        teacher: teacher._id,
        teacherEmail,
        role: 'owner',
        isActive: true,
      });

      res.status(201).json({
        success: true,
        message: 'Course created successfully',
        data: course,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // Get teacher's courses
  static async getTeacherCourses(req: AuthRequest, res: Response): Promise<void> {
    try {
      const teacherEmail = req.user!.email;
      const { activeOnly } = req.query;

      const query: any = { teacherEmail };
      if (activeOnly === 'true') {
        query.isActive = true;
      }

      const memberships = await CourseTeacher.find(query)
        .populate('course')
        .sort({ createdAt: -1 });

      const courses = memberships.map(m => m.course);

      res.json({ success: true, data: courses });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // Get student's courses
  static async getStudentCourses(req: AuthRequest, res: Response): Promise<void> {
    try {
      const studentId = req.user!.userId;
      const { activeOnly } = req.query;

      const student = await Student.findById(studentId);
      if (!student) {
        res.status(404).json({ success: false, message: 'Student not found' });
        return;
      }

      // Get all enrollments that include this student
      const enrollments = await StudentEnrollment.find({
        startId: { $lte: student.studentId },
        endId: { $gte: student.studentId },
      }).populate('course');

      let courses = enrollments.map(e => e.course);

      // Filter out inactive courses if requested
      if (activeOnly === 'true') {
        const inactiveCourseIds = student.inactiveCourses.map(id => id.toString());
        courses = courses.filter(c => !inactiveCourseIds.includes(c._id.toString()));
      }

      res.json({ success: true, data: courses });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // Get course by ID
  static async getCourseById(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { courseId } = req.params;

      const course = await Course.findById(courseId).populate('owner');

      if (!course) {
        res.status(404).json({ success: false, message: 'Course not found' });
        return;
      }

      res.json({ success: true, data: course });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // Update course
  static async updateCourse(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { courseId } = req.params;
      const updates: IUpdateCourseDTO = req.body;
      const userId = req.user!.userId;

      const course = await Course.findById(courseId);
      if (!course) {
        res.status(404).json({ success: false, message: 'Course not found' });
        return;
      }

      // Check if user is owner or teacher
      const membership = await CourseTeacher.findOne({
        course: courseId,
        teacher: userId,
      });

      if (!course.owner.equals(userId) && !membership) {
        res.status(403).json({ success: false, message: 'Unauthorized' });
        return;
      }

      // Track what fields changed
      const changedFields = Object.keys(updates).filter(
        key => course[key as keyof typeof course] !== updates[key as keyof typeof updates]
      );

      Object.assign(course, updates);
      await course.save();

      // ✅ Notify all course members about significant changes
      if (changedFields.length > 0 && (changedFields.includes('name') || changedFields.includes('credit'))) {
        try {
          const enrollments = await StudentEnrollment.find({ course: courseId });
          const courseMembers = await CourseTeacher.find({ course: courseId }).populate('teacher');

          const studentEmails = new Set<string>();
          for (const enrollment of enrollments) {
            const students = await CourseController.getStudentsInRange(enrollment.startId, enrollment.endId);
            students.forEach(s => studentEmails.add(s.email));
          }

          const teacherEmails = courseMembers.map(m => (m.teacher as any).email);
          const allEmails = Array.from(studentEmails).concat(teacherEmails);

          if (allEmails.length > 0) {
            await notificationQueue.add(QUEUE_EVENTS.SEND_USERS, {
              emails: allEmails,
              title: `Course "${course.name}" Updated`,
              body: `Course ${course.code} has been updated. Changes: ${changedFields.join(', ')}`,
              data: {
                courseId: courseId,
                type: 'course_updated',
                changedFields,
              },
            });
          }
        } catch (notifError) {
          console.error('Failed to send course update notifications:', notifError);
          // Don't fail the request if notifications fail
        }
      }

      res.json({ success: true, message: 'Course updated', data: course });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // Delete course
  static async deleteCourse(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { courseId } = req.params;
      const userId = req.user!.userId;

      const course = await Course.findById(courseId);
      if (!course) {
        res.status(404).json({ success: false, message: 'Course not found' });
        return;
      }

      // Check user membership
      const membership = await CourseTeacher.findOne({
        course: courseId,
        teacher: userId,
      });

      if (!membership) {
        res.status(403).json({ success: false, message: 'Not a member of this course' });
        return;
      }

      // If user is co-teacher, only remove their membership
      if (membership.role === 'teacher') {
        await CourseTeacher.findByIdAndDelete(membership._id);
        res.json({ success: true, message: 'Course removed from your profile' });
        return;
      }

      // If user is owner, delete for all (existing logic)
      if (membership.role !== 'owner' || !course.owner.equals(userId)) {
        res.status(403).json({ success: false, message: 'Only owner can delete course for all' });
        return;
      }

      // ✅ Get all affected students and teachers BEFORE deletion
      const enrollments = await StudentEnrollment.find({ course: courseId });
      const courseMembers = await CourseTeacher.find({ course: courseId }).populate('teacher');

      const studentEmails = new Set<string>();
      for (const enrollment of enrollments) {
        const students = await CourseController.getStudentsInRange(enrollment.startId, enrollment.endId);
        students.forEach(s => studentEmails.add(s.email));
      }

      const teacherEmails = courseMembers.map(m => (m.teacher as any).email);
      const allEmails = Array.from(studentEmails).concat(teacherEmails);

      // Delete related data
      await Promise.all([
        Course.findByIdAndDelete(courseId),
        CourseTeacher.deleteMany({ course: courseId }),
        StudentEnrollment.deleteMany({ course: courseId }),
      ]);

      // ✅ Send deletion notification to all course members
      if (allEmails.length > 0) {
        try {
          await notificationQueue.add(QUEUE_EVENTS.SEND_USERS, {
            emails: allEmails,
            title: `Course "${course.name}" Deleted`,
            body: `The course ${course.code} - ${course.name} has been deleted. All associated data has been removed.`,
            data: {
              courseId: courseId,
              type: 'course_deleted',
              courseCode: course.code,
            },
          });
        } catch (notifError) {
          console.error('Failed to send course deletion notifications:', notifError);
        }
      }

      res.json({ success: true, message: 'Course deleted successfully for all' });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // Add student enrollment range
  static async addEnrollment(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { courseId } = req.params;
      const { startId, endId, section }: IAddEnrollmentDTO = req.body;
      const teacherId = req.user!.userId;

      const course = await Course.findById(courseId);
      if (!course) {
        res.status(404).json({ success: false, message: 'Course not found' });
        return;
      }

      // Verify teacher has access
      const membership = await CourseTeacher.findOne({
        course: courseId,
        teacher: teacherId,
      });

      if (!course.owner.equals(teacherId) && !membership) {
        res.status(403).json({ success: false, message: 'Unauthorized' });
        return;
      }

      if (startId > endId) {
        res.status(400).json({ success: false, message: 'Invalid ID range' });
        return;
      }

      // ✅ Get students in this range
      const newStudents = await CourseController.getStudentsInRange(startId, endId);

      // ✅ Get already enrolled students to avoid duplicate notifications
      const alreadyEnrolled = await CourseController.getAlreadyEnrolledStudents(courseId);
      const alreadyEnrolledIds = new Set(alreadyEnrolled.map(s => s.studentId));

      // ✅ Filter to get only newly enrolled students
      const newlyEnrolledStudents = newStudents.filter(
        s => !alreadyEnrolledIds.has(s.studentId)
      );

      const enrollment = await StudentEnrollment.create({
        course: courseId,
        startId,
        endId,
        section: section.toUpperCase(),
        addedBy: teacherId,
      });

      // ✅ Send notifications ONLY to newly enrolled students
      if (newlyEnrolledStudents.length > 0) {
        const newStudentEmails = newlyEnrolledStudents.map(s => s.email);

        try {
          await notificationQueue.add(QUEUE_EVENTS.SEND_USERS, {
            emails: newStudentEmails,
            title: `Enrolled in "${course.name}"`,
            body: `You have been enrolled in ${course.code} - ${course.name} (Section: ${section.toUpperCase()})`,
            data: {
              courseId: courseId,
              type: 'enrollment',
              section: section.toUpperCase(),
              courseCode: course.code,
            },
          });
        } catch (notifError) {
          console.error('Failed to send enrollment notifications:', notifError);
        }
      }

      res.status(201).json({
        success: true,
        message: 'Enrollment added',
        data: enrollment,
        totalStudentsInRange: newStudents.length,
        newlyEnrolledCount: newlyEnrolledStudents.length,
        alreadyEnrolledCount: newStudents.length - newlyEnrolledStudents.length,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // Get enrollments for course
  static async getEnrollments(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { courseId } = req.params;

      const enrollments = await StudentEnrollment.find({ course: courseId })
        .populate('addedBy')
        .sort({ addedAt: -1 });

      res.json({ success: true, data: enrollments });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // Update enrollment
  static async updateEnrollment(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { enrollmentId } = req.params;
      const updates: IUpdateEnrollmentDTO = req.body;

      const enrollment = await StudentEnrollment.findById(enrollmentId);
      if (!enrollment) {
        res.status(404).json({ success: false, message: 'Enrollment not found' });
        return;
      }

      // ✅ If ID range changes, notify new students only
      if (updates.startId !== undefined || updates.endId !== undefined) {
        try {
          const newStartId = updates.startId ?? enrollment.startId;
          const newEndId = updates.endId ?? enrollment.endId;
          const oldStartId = enrollment.startId;
          const oldEndId = enrollment.endId;

          const course = await Course.findById(enrollment.course);

          // Find students in new range
          const newRangeStudents = await CourseController.getStudentsInRange(newStartId, newEndId);
          const oldRangeStudentIds = new Set<number>();

          // Build set of old student IDs
          for (let id = oldStartId; id <= oldEndId; id++) {
            oldRangeStudentIds.add(id);
          }

          // Find only newly added students
          const newlyAddedStudents = newRangeStudents.filter(
            s => !oldRangeStudentIds.has(s.studentId)
          );

          // Send notification only to new students
          if (newlyAddedStudents.length > 0 && course) {
            const newStudentEmails = newlyAddedStudents.map(s => s.email);

            await notificationQueue.add(QUEUE_EVENTS.SEND_USERS, {
              emails: newStudentEmails,
              title: `Enrolled in "${course.name}"`,
              body: `You have been enrolled in ${course.code} - ${course.name}`,
              data: {
                courseId: enrollment.course.toString(),
                type: 'enrollment_updated',
                courseCode: course.code,
              },
            });
          }
        } catch (notifError) {
          console.error('Failed to send enrollment update notifications:', notifError);
        }
      }

      Object.assign(enrollment, updates);
      await enrollment.save();

      res.json({ success: true, message: 'Enrollment updated', data: enrollment });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // Delete enrollment
  static async deleteEnrollment(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { enrollmentId } = req.params;

      const enrollment = await StudentEnrollment.findById(enrollmentId);
      if (enrollment) {
        const course = await Course.findById(enrollment.course);

        // ✅ Notify removed students
        if (course) {
          try {
            const removedStudents = await CourseController.getStudentsInRange(enrollment.startId, enrollment.endId);
            const removedEmails = removedStudents.map(s => s.email);

            if (removedEmails.length > 0) {
              await notificationQueue.add(QUEUE_EVENTS.SEND_USERS, {
                emails: removedEmails,
                title: `Removed from "${course.name}"`,
                body: `You have been removed from ${course.code} - ${course.name}`,
                data: {
                  courseId: enrollment.course.toString(),
                  type: 'enrollment_removed',
                  courseCode: course.code,
                },
              });
            }
          } catch (notifError) {
            console.error('Failed to send enrollment removal notifications:', notifError);
          }
        }
      }

      await StudentEnrollment.findByIdAndDelete(enrollmentId);

      res.json({ success: true, message: 'Enrollment deleted' });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * ✅ NEW ENDPOINT: Add teacher to course
   * Only course owner can add teachers
   * Sends notification to the invited teacher
   */
  static async addTeacherToCourse(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { courseId } = req.params;
      const { teacherEmail, role = 'teacher' }: { teacherEmail: string; role?: string } = req.body;
      const requesterUserId = req.user!.userId;

      const course = await Course.findById(courseId);
      if (!course) {
        res.status(404).json({ success: false, message: 'Course not found' });
        return;
      }

      // Only owner can add teachers
      if (!course.owner.equals(requesterUserId)) {
        res.status(403).json({ success: false, message: 'Only course owner can add teachers' });
        return;
      }

      // Validate teacher exists
      const teacher = await Teacher.findOne({ email: teacherEmail });
      if (!teacher) {
        res.status(404).json({ success: false, message: 'Teacher not found' });
        return;
      }

      // Check if already a member
      const existingMembership = await CourseTeacher.findOne({
        course: courseId,
        teacher: teacher._id,
      });

      if (existingMembership) {
        res.status(400).json({ success: false, message: 'Teacher is already a member of this course' });
        return;
      }

      // Create membership
      const courseTeacher = await CourseTeacher.create({
        course: courseId,
        teacher: teacher._id,
        teacherEmail,
        role,
        isActive: true,
      });

      // ✅ Send notification to the invited teacher
      try {
        await notificationQueue.add(QUEUE_EVENTS.SEND_USER, {
          email: teacherEmail,
          title: `Added to Course "${course.name}"`,
          body: `You have been added as ${role} to course ${course.code} - ${course.name}`,
          data: {
            courseId: courseId,
            type: 'teacher_added',
            role: role,
            courseCode: course.code,
          },
        });
      } catch (notifError) {
        console.error('Failed to send teacher invitation notification:', notifError);
      }

      res.status(201).json({
        success: true,
        message: 'Teacher added to course',
        data: courseTeacher,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // Toggle course active status for teacher
  static async toggleTeacherCourseStatus(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { courseId } = req.params;
      const { isActive } = req.body;
      const teacherId = req.user!.userId;

      const membership = await CourseTeacher.findOne({
        course: courseId,
        teacher: teacherId,
      });

      if (!membership) {
        res.status(404).json({ success: false, message: 'Not a member of this course' });
        return;
      }

      membership.isActive = isActive;
      await membership.save();

      res.json({ success: true, message: 'Course status updated' });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // Toggle course active status for student
  static async toggleStudentCourseStatus(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { courseId } = req.params;
      const { isActive } = req.body;
      const studentId = req.user!.userId;

      const student = await Student.findById(studentId);
      if (!student) {
        res.status(404).json({ success: false, message: 'Student not found' });
        return;
      }

      if (isActive) {
        // Remove from inactive courses
        student.inactiveCourses = student.inactiveCourses.filter(
          id => !id.equals(courseId)
        );
      } else {
        // Add to inactive courses
        if (!student.inactiveCourses.some(id => id.equals(courseId))) {
          student.inactiveCourses.push(courseId as any);
        }
      }

      await student.save();

      res.json({ success: true, message: 'Course status updated' });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Get course statistics (student count and teacher count)
   * GET /courses/:courseId/stats
   */
  static async getCourseStats(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { courseId } = req.params;

      // Verify course exists
      const course = await Course.findById(courseId);
      if (!course) {
        res.status(404).json({ success: false, message: 'Course not found' });
        return;
      }

      // Get all enrollments for this course
      const enrollments = await StudentEnrollment.find({ course: courseId });

      // Build set of unique student IDs from enrollment ranges
      const studentIds = new Set<string>();
      for (const enrollment of enrollments) {
        for (let id = enrollment.startId; id <= enrollment.endId; id++) {
          const student = await Student.findOne({ studentId: id });
          if (student) {
            studentIds.add(student._id.toString());
          }
        }
      }

      // Count active teachers in this course
      const teacherCount = await CourseTeacher.countDocuments({
        course: courseId,
        isActive: true,
      });

      res.json({
        success: true,
        data: {
          courseId,
          courseName: course.name,
          courseCode: course.code,
          studentCount: studentIds.size,
          teacherCount,
        },
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Get comprehensive course performance data
   * Returns all students with their attendance and marks data in one response
   */
  static async getTeacherCoursePerformance(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { courseId } = req.params;

      // Verify course exists
      const course = await Course.findById(courseId);
      if (!course) {
        res.status(404).json({ success: false, message: 'Course not found' });
        return;
      }

      // Get all enrollments
      const enrollments = await StudentEnrollment.find({ course: courseId });

      // Get unique student IDs from ranges
      const enrolledStudents = await Student.find({
        studentId: {
          $in: enrollments.flatMap(e =>
            Array.from({ length: e.endId - e.startId + 1 }, (_, i) => e.startId + i)
          )
        }
      });

      // Get all CTs for course
      const classTests = await ClassTest.find({ course: courseId });
      const ctIds = classTests.map(ct => ct._id);

      // Get ALL marks in one query
      const allMarks = await Mark.find({
        course: courseId,
        classTest: { $in: ctIds }
      });

      // Get all attendance sessions with their records
      const attendanceSessions = await AttendanceSession.find({ course: courseId })
        .sort({ date: -1 });

      // Get all attendance records for this course
      const attendanceRecords = await AttendanceRecord.find({ course: courseId });

      // ✅ TRANSFORM attendance records into studentStatuses map for each session
      const sessionStudentStatusMap: Record<string, Record<string, string>> = {};
      attendanceSessions.forEach(session => {
        sessionStudentStatusMap[session._id.toString()] = {};
      });

      attendanceRecords.forEach(record => {
        const sessionId = record.session.toString();
        if (sessionStudentStatusMap[sessionId]) {
          // Use studentId as the key (as number converted to string)
          sessionStudentStatusMap[sessionId][String(record.student.studentId)] = record.status;
        }
      });

      // Build performance data for each student
      const studentPerformance = enrolledStudents.map(student => {
        const studentIdStr = String(student.studentId);
        const studentEmail = student.email;

        // Calculate attendance percentage using the records
        const studentRecords = attendanceRecords.filter(
          r => r.student.studentId === student.studentId
        );
        const presentCount = studentRecords.filter(r => r.status === 'present').length;
        const attendancePercentage = studentRecords.length > 0
          ? (presentCount / studentRecords.length) * 100
          : 0;

        // Get student's marks for all CTs
        const studentMarks = allMarks.filter(m => m.student.email === studentEmail);

        // Calculate best CT average
        const publishedCTs = classTests.filter(ct => ct.isPublished);
        const markValues = publishedCTs.map(ct => {
          const mark = studentMarks.find(m => m.classTest.equals(ct._id));
          return mark?.status === 'present' && mark.marksObtained !== undefined
            ? mark.marksObtained
            : 0;
        });

        markValues.sort((a, b) => b - a);
        const bestCTCount = course.bestCTCount || classTests.length;
        const bestMarks = markValues.slice(0, Math.min(bestCTCount, markValues.length));
        const ctAverage = bestMarks.length > 0
          ? bestMarks.reduce((a, b) => a + b, 0) / bestMarks.length
          : 0;

        return {
          _id: student._id,
          studentId: student.studentId,
          email: student.email,
          name: student.name,
          department: student.department,
          batch: student.batch,
          role: 'student' as const,
          image: student.image,
          attendancePercentage: Math.round(attendancePercentage * 100) / 100,
          totalSessions: studentRecords.length,
          presentCount,
          ctAverage: Math.round(ctAverage * 100) / 100,
          bestMarks: bestMarks, // Added for transparency
          totalCTs: classTests.length,
          // ✅ FLATTEN the marks structure
          marks: studentMarks.map(m => ({
            _id: m._id.toString(),
            courseId: m.course.toString(),
            ctId: m.classTest.toString(),
            studentId: m.student.studentId,
            studentEmail: m.student.email,
            marksObtained: m.marksObtained,
            status: m.status,
            feedback: m.feedback || '',
          })),
        };
      });

      // ✅ TRANSFORM sessions to include studentStatuses
      const sessionsWithStatuses = attendanceSessions.map(session => ({
        _id: session._id,
        courseId: session.course,
        section: session.section,
        date: session.date,
        teacherId: session.teacher,
        notes: session.notes,
        stats: session.stats,
        studentStatuses: sessionStudentStatusMap[session._id.toString()] || {},
      }));

      res.json({
        success: true,
        data: {
          courseId,
          courseName: course.name,
          courseCode: course.code,
          totalStudents: enrolledStudents.length,
          totalCTs: classTests.length,
          totalSessions: attendanceSessions.length,
          students: studentPerformance,
          enrollments: enrollments,
          classTests: classTests,
          attendanceSessions: sessionsWithStatuses,
        },
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Get student's comprehensive course performance data
   * Single endpoint for student dashboard - replaces multiple API calls
   */
  static async getStudentCoursePerformance(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { courseId } = req.params;
      const studentId = req.user!.userId;

      // Verify course exists
      const course = await Course.findById(courseId);
      if (!course) {
        res.status(404).json({ success: false, message: 'Course not found' });
        return;
      }

      // Get current student
      const student = await Student.findById(studentId);
      if (!student) {
        res.status(404).json({ success: false, message: 'Student not found' });
        return;
      }

      // Check if student is enrolled in this course
      const enrollment = await StudentEnrollment.findOne({
        course: courseId,
        startId: { $lte: student.studentId },
        endId: { $gte: student.studentId },
      });

      if (!enrollment) {
        res.status(403).json({ success: false, message: 'Student not enrolled in this course' });
        return;
      }

      // Get all CTs for course
      const classTests = await ClassTest.find({ course: courseId });
      const ctIds = classTests.map(ct => ct._id);

      // Get all marks for THIS STUDENT only
      const studentMarks = await Mark.find({
        course: courseId,
        'student.email': student.email,
        classTest: { $in: ctIds }
      });

      // Get all attendance sessions for student's section
      const attendanceSessions = await AttendanceSession.find({
        course: courseId,
        section: enrollment.section,
      }).sort({ date: -1 });

      // Get all attendance records for this student in these sessions
      const attendanceRecords = await AttendanceRecord.find({
        course: courseId,
        'student.studentId': student.studentId,
        session: { $in: attendanceSessions.map(s => s._id) }
      });

      // Calculate attendance percentage
      const presentCount = attendanceRecords.filter(r => r.status === 'present').length;
      const attendancePercentage = attendanceRecords.length > 0
        ? (presentCount / attendanceRecords.length) * 100
        : 0;

      // Calculate best CT average
      const publishedCTs = classTests.filter(ct => ct.isPublished);
      const markValues = publishedCTs.map(ct => {
        const mark = studentMarks.find(m => m.classTest.equals(ct._id));
        return mark?.status === 'present' && mark.marksObtained !== undefined
          ? mark.marksObtained
          : 0;
      });

      markValues.sort((a, b) => b - a);
      const bestCTCount = course.bestCTCount || classTests.length;
      const bestMarks = markValues.slice(0, Math.min(bestCTCount, markValues.length));
      const ctAverage = bestMarks.length > 0
        ? bestMarks.reduce((a, b) => a + b, 0) / bestMarks.length
        : 0;

      // Transform attendance sessions to include studentStatuses
      const sessionStudentStatusMap: Record<string, Record<string, string>> = {};
      attendanceSessions.forEach(session => {
        sessionStudentStatusMap[session._id.toString()] = {};
      });

      attendanceRecords.forEach(record => {
        const sessionId = record.session.toString();
        if (sessionStudentStatusMap[sessionId]) {
          sessionStudentStatusMap[sessionId][String(record.student.studentId)] = record.status;
        }
      });

      const sessionsWithStatuses = attendanceSessions.map(session => ({
        _id: session._id,
        courseId: session.course,
        section: session.section,
        date: session.date,
        teacherId: session.teacher,
        notes: session.notes,
        stats: session.stats,
        studentStatuses: sessionStudentStatusMap[session._id.toString()] || {},
      }));

      res.json({
        success: true,
        data: {
          course: {
            _id: course._id,
            code: course.code,
            name: course.name,
            credit: course.credit,
            bestCTCount: course.bestCTCount,
            isSessional: course.isSessional,
          },
          student: {
            _id: student._id,
            studentId: student.studentId,
            email: student.email,
            name: student.name,
            batch: student.batch,
            department: student.department,
            section: enrollment.section,
          },
          performance: {
            attendancePercentage: Math.round(attendancePercentage * 100) / 100,
            presentCount,
            totalSessions: attendanceRecords.length,
            ctAverage: Math.round(ctAverage * 100) / 100,
            bestMarks: bestMarks, // Added for transparency
          },
          classTests,
          marks: studentMarks.map(m => ({
            _id: m._id.toString(),
            courseId: m.course.toString(),
            ctId: m.classTest.toString(),
            studentId: m.student.studentId,
            studentEmail: m.student.email,
            marksObtained: m.marksObtained,
            status: m.status,
            feedback: m.feedback || '',
            classTestTotal: m.classTestTotal,
          })),
          attendanceSessions: sessionsWithStatuses,
        },
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
 * Get students by an array of student IDs
 * Used to verify which students from enrollment ranges actually exist
 * GET /courses/:courseId/students?studentIds=2104001,2104002,2104003
 */
  static async getStudentsByIds(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { courseId } = req.params;
      const { studentIds } = req.query;

      if (!studentIds || typeof studentIds !== 'string') {
        res.status(400).json({
          success: false,
          message: 'studentIds query parameter is required (comma-separated)'
        });
        return;
      }

      // Verify course exists
      const course = await Course.findById(courseId);
      if (!course) {
        res.status(404).json({ success: false, message: 'Course not found' });
        return;
      }

      // Parse comma-separated string to array of numbers
      const ids = studentIds
        .split(',')
        .map(id => parseInt(id.trim()))
        .filter(id => !isNaN(id));

      if (ids.length === 0) {
        res.status(400).json({
          success: false,
          message: 'No valid student IDs provided'
        });
        return;
      }

      // Fetch students that actually exist in the database
      const students = await Student.find({
        studentId: { $in: ids }
      }).select('studentId email name department batch image');

      res.json({
        success: true,
        data: students,
        meta: {
          requested: ids.length,
          found: students.length,
          missing: ids.length - students.length,
        }
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Get full course export report for Excel
   */
  static async getExportReport(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { courseId } = req.params;

      const course = await Course.findById(courseId);
      if (!course) {
        res.status(404).json({ success: false, message: 'Course not found' });
        return;
      }

      const enrollments = await StudentEnrollment.find({ course: courseId });
      const studentIdsInRanges = enrollments.flatMap(e =>
        Array.from({ length: e.endId - e.startId + 1 }, (_, i) => e.startId + i)
      );

      const enrolledStudents = await Student.find({
        studentId: { $in: studentIdsInRanges }
      }).select('studentId email name department batch');

      const classTests = await ClassTest.find({ course: courseId, isPublished: true }).sort({ date: 1 });
      const ctIds = classTests.map(ct => ct._id);

      const allMarks = await Mark.find({
        course: courseId,
        classTest: { $in: ctIds }
      });

      const attendanceRecords = await AttendanceRecord.find({ course: courseId });

      const reportData = enrolledStudents.map(student => {
        const studentMarks = allMarks.filter(m => m.student.studentId === student.studentId);

        // Attendance calculation
        const studentAttendance = attendanceRecords.filter(r => r.student.studentId === student.studentId);
        const presentCount = studentAttendance.filter(r => r.status === 'present').length;
        const totalSessions = studentAttendance.length;
        const attendancePercentage = totalSessions > 0 ? (presentCount / totalSessions) * 100 : 0;

        // Slab-based attendance marks calculation
        let slabGrade = 0;
        if (attendancePercentage >= 90) slabGrade = 10;
        else if (attendancePercentage >= 85) slabGrade = 9;
        else if (attendancePercentage >= 80) slabGrade = 8;
        else if (attendancePercentage >= 75) slabGrade = 7;
        else if (attendancePercentage >= 70) slabGrade = 6;
        else if (attendancePercentage >= 65) slabGrade = 5;
        else if (attendancePercentage >= 60) slabGrade = 4;
        else slabGrade = 0;

        const attendanceMarks = slabGrade * course.credit;

        // CT Results
        const markValues = classTests.map(ct => {
          const mark = studentMarks.find(m => m.classTest.equals(ct._id));
          return (mark?.status === 'present') ? (mark.marksObtained ?? 0) : 0;
        });
        markValues.sort((a, b) => b - a);
        const nCredit = Math.ceil(course.credit);
        const bestSum = markValues.slice(0, Math.min(nCredit, markValues.length)).reduce((a, b) => a + b, 0);

        // Build the requested row structure
        const row: any = {
          'ID': String(student.studentId),
          'Att. %': attendancePercentage.toFixed(1) + '%',
          'Att. Marks': attendanceMarks,
        };

        // Add marks for each CT by name
        classTests.forEach(ct => {
          const mark = studentMarks.find(m => m.classTest.equals(ct._id));
          row[ct.name] = (mark?.status === 'present') ? (mark.marksObtained ?? 0) : 0;
        });

        row['Best CT'] = bestSum;
        row['Total Marks'] = (attendanceMarks + bestSum).toFixed(2);

        return row;
      });

      // Sort by ID string
      reportData.sort((a, b) => a['ID'].localeCompare(b['ID']));

      res.json({
        success: true,
        data: {
          course: {
            code: course.code,
            name: course.name,
          },
          students: reportData
        }
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
}