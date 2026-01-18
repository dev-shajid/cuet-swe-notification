import { Response } from 'express';
import { notificationQueue, QUEUE_EVENTS } from '../config/queue';
import { AuthRequest } from '../middleware/auth.middleware';
import { ClassTest, Course, Mark, Student, StudentEnrollment } from '../models';
import { IBatchAddMarksDTO, ICreateClassTestDTO, IUpdateClassTestDTO } from '../types';

export class ClassTestController {
  /**
   * Helper: Get all enrolled students for a course
   */
  static async getEnrolledStudentEmails(courseId: string): Promise<string[]> {
    const enrollments = await StudentEnrollment.find({ course: courseId });
    const studentEmails = new Set<string>();

    for (const enrollment of enrollments) {
      const students = await Student.find({
        studentId: {
          $gte: enrollment.startId,
          $lte: enrollment.endId,
        },
      });
      students.forEach(s => studentEmails.add(s.email));
    }

    return Array.from(studentEmails);
  }

  // Create class test
  static async createClassTest(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { courseId, name, description, date, totalMarks }: ICreateClassTestDTO = req.body;
      const teacherId = req.user!.userId;

      const classTest = await ClassTest.create({
        course: courseId,
        name,
        description,
        date: new Date(date),
        totalMarks,
        createdBy: teacherId,
      });

      // ✅ Get course details for notification
      const course = await Course.findById(courseId);

      // ✅ Send notification to all enrolled students
      if (course) {
        try {
          const studentEmails = await ClassTestController.getEnrolledStudentEmails(courseId);

          if (studentEmails.length > 0) {
            await notificationQueue.add(QUEUE_EVENTS.SEND_USERS, {
              emails: studentEmails,
              title: `New Class Test: ${name}`,
              body: `A new class test "${name}" has been created for ${course.code} - ${course.name}. Total Marks: ${totalMarks}`,
              data: {
                courseId: courseId,
                classTestId: classTest._id.toString(),
                type: 'ct_created',
                courseCode: course.code,
                ctName: name,
                totalMarks,
                date: date,
              },
            });
          }
        } catch (notifError) {
          console.error('Failed to send class test creation notifications:', notifError);
        }
      }

      res.status(201).json({
        success: true,
        message: 'Class test created',
        data: classTest,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // Get course class tests
  static async getCourseClassTests(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { courseId } = req.params;
      const { publishedOnly } = req.query;

      const query: any = { course: courseId };
      if (publishedOnly === 'true') query.isPublished = true;

      const classTests = await ClassTest.find(query)
        .sort({ date: 1 })
        .populate('createdBy');

      res.json({ success: true, data: classTests });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // Get class test by ID
  static async getClassTestById(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { testId } = req.params;

      const classTest = await ClassTest.findById(testId).populate('createdBy');

      if (!classTest) {
        res.status(404).json({ success: false, message: 'Class test not found' });
        return;
      }

      res.json({ success: true, data: classTest });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // Update class test
  static async updateClassTest(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { testId } = req.params;
      const updates: IUpdateClassTestDTO = req.body;

      const classTest = await ClassTest.findById(testId);
      if (!classTest) {
        res.status(404).json({ success: false, message: 'Class test not found' });
        return;
      }

      // Track if isPublished changed from false to true
      const wasUnpublished = !classTest.isPublished;
      const isNowPublished = updates.isPublished === true;

      Object.assign(classTest, updates);
      await classTest.save();

      // ✅ Send notification when class test is published
      if (wasUnpublished && isNowPublished) {
        try {
          const course = await Course.findById(classTest.course);
          const studentEmails = await ClassTestController.getEnrolledStudentEmails(classTest.course.toString());

          if (studentEmails.length > 0 && course) {
            await notificationQueue.add(QUEUE_EVENTS.SEND_USERS, {
              emails: studentEmails,
              title: `Marks Published: ${classTest.name}`,
              body: `Marks for "${classTest.name}" in ${course.code} - ${course.name} are now available. Check your performance!`,
              data: {
                courseId: classTest.course.toString(),
                classTestId: testId,
                type: 'ct_published',
                courseCode: course.code,
                ctName: classTest.name,
              },
            });
          }
        } catch (notifError) {
          console.error('Failed to send class test publication notifications:', notifError);
        }
      }

      // ✅ Notify about significant updates (name, date, total marks changes)
      else if (updates.name || updates.date || updates.totalMarks) {
        try {
          const course = await Course.findById(classTest.course);
          const studentEmails = await ClassTestController.getEnrolledStudentEmails(classTest.course.toString());

          if (studentEmails.length > 0 && course) {
            const changedFields = [];
            if (updates.name) changedFields.push('name');
            if (updates.date) changedFields.push('date');
            if (updates.totalMarks) changedFields.push('total marks');

            await notificationQueue.add(QUEUE_EVENTS.SEND_USERS, {
              emails: studentEmails,
              title: `Class Test Updated: ${classTest.name}`,
              body: `"${classTest.name}" for ${course.code} has been updated. Changes: ${changedFields.join(', ')}`,
              data: {
                courseId: classTest.course.toString(),
                classTestId: testId,
                type: 'ct_updated',
                courseCode: course.code,
                ctName: classTest.name,
                changedFields,
              },
            });
          }
        } catch (notifError) {
          console.error('Failed to send class test update notifications:', notifError);
        }
      }

      res.json({ success: true, message: 'Class test updated', data: classTest });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // Delete class test
  static async deleteClassTest(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { testId } = req.params;

      const classTest = await ClassTest.findById(testId);
      if (!classTest) {
        res.status(404).json({ success: false, message: 'Class test not found' });
        return;
      }

      // ✅ Get course and student emails BEFORE deletion
      const course = await Course.findById(classTest.course);
      const studentEmails = await ClassTestController.getEnrolledStudentEmails(classTest.course.toString());

      await Promise.all([
        ClassTest.findByIdAndDelete(testId),
        Mark.deleteMany({ classTest: testId }),
      ]);

      // ✅ Notify students about deletion
      if (studentEmails.length > 0 && course) {
        try {
          await notificationQueue.add(QUEUE_EVENTS.SEND_USERS, {
            emails: studentEmails,
            title: `Class Test Deleted: ${classTest.name}`,
            body: `The class test "${classTest.name}" for ${course.code} - ${course.name} has been deleted.`,
            data: {
              courseId: classTest.course.toString(),
              type: 'ct_deleted',
              courseCode: course.code,
              ctName: classTest.name,
            },
          });
        } catch (notifError) {
          console.error('Failed to send class test deletion notifications:', notifError);
        }
      }

      res.json({ success: true, message: 'Class test deleted' });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // Batch add/update marks (upsert)
  static async batchUpdateMarks(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { classTestId, marks }: IBatchAddMarksDTO = req.body;

      const classTest = await ClassTest.findById(classTestId);
      if (!classTest) {
        res.status(404).json({ success: false, message: 'Class test not found' });
        return;
      }

      // Get student IDs from marks to fetch their details
      const studentIds = marks.map(m => Number(m.studentId));
      const students = await Student.find({ studentId: { $in: studentIds } });
      const studentMap = new Map(students.map(s => [s.studentId, s]));

      // Get existing marks to check for significant changes (for notifications)
      const existingMarks = await Mark.find({
        classTest: classTestId,
        'student.studentId': { $in: studentIds }
      });
      const existingMarksMap = new Map(existingMarks.map(m => [m.student.studentId, m]));

      // Build bulk operations
      const bulkOps = marks
        .filter(m => studentMap.has(Number(m.studentId)))
        .map(m => {
          const studentIdNum = Number(m.studentId);
          const student = studentMap.get(studentIdNum)!;
          return {
            updateOne: {
              filter: {
                classTest: classTestId,
                'student.studentId': studentIdNum
              },
              update: {
                $set: {
                  course: classTest.course,
                  classTestTotal: classTest.totalMarks,
                  'student._id': student._id,
                  'student.email': student.email,
                  status: m.status,
                  marksObtained: m.marksObtained,
                  feedback: m.feedback,
                }
              },
              upsert: true
            }
          };
        });

      if (bulkOps.length === 0) {
        console.warn('⚠️ No valid students found for batch update. Requested IDs:', studentIds);
        res.status(400).json({ success: false, message: 'No valid students found' });
        return;
      }

      await Mark.bulkWrite(bulkOps);

      // ✅ If class test is published, notify students about new or updated marks
      if (classTest.isPublished) {
        try {
          const course = await Course.findById(classTest.course);

          const notificationPromises = marks
            .filter(m => studentMap.has(Number(m.studentId)))
            .map(async (m) => {
              const studentIdNum = Number(m.studentId);
              const student = studentMap.get(studentIdNum)!;
              const existingMark = existingMarksMap.get(studentIdNum);

              // Only notify if it's a new mark or if the status/marks changed
              const isNew = !existingMark;
              const hasChanged = existingMark && (existingMark.status !== m.status || existingMark.marksObtained !== m.marksObtained);

              if (isNew || hasChanged) {
                const action = isNew ? 'Available' : 'Updated';
                const markStatus = m.status === 'present'
                  ? `${m.marksObtained}/${classTest.totalMarks}`
                  : 'Absent';

                return notificationQueue.add(QUEUE_EVENTS.SEND_USER, {
                  email: student.email,
                  title: `Marks ${action}: ${classTest.name}`,
                  body: `Your marks for "${classTest.name}" in ${course?.code} are now ${action.toLowerCase()}. Score: ${markStatus}`,
                  data: {
                    courseId: classTest.course.toString(),
                    classTestId: classTestId,
                    type: isNew ? 'mark_added' : 'mark_updated',
                    courseCode: course?.code,
                    ctName: classTest.name,
                    marksObtained: m.marksObtained,
                    totalMarks: classTest.totalMarks,
                    status: m.status,
                  },
                });
              }
            });

          await Promise.all(notificationPromises.filter(Boolean));
        } catch (notifError) {
          console.error('Failed to send batch marks notifications:', notifError);
        }
      }

      res.json({ success: true, message: 'Marks updated successfully' });
    } catch (error: any) {
      console.error('Error in batchUpdateMarks:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // Get class test marks
  static async getClassTestMarks(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { testId } = req.params;

      const marks = await Mark.find({ classTest: testId }).sort({ 'student.studentId': 1 });

      // Flatten mark data for frontend
      const flattenedMarks = marks.map(m => ({
        _id: m._id.toString(),
        courseId: m.course.toString(),
        ctId: m.classTest.toString(),
        studentId: m.student.studentId,
        studentEmail: m.student.email,
        marksObtained: m.marksObtained,
        status: m.status,
        feedback: m.feedback || '',
        createdAt: m.createdAt,
        updatedAt: m.updatedAt,
      }));

      res.json({ success: true, data: flattenedMarks });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // Get student marks for course
  static async getStudentCourseMarks(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { courseId } = req.params;
      const studentId = req.user!.userId;

      const student = await Student.findById(studentId);
      if (!student) {
        res.status(404).json({ success: false, message: 'Student not found' });
        return;
      }

      const marks = await Mark.find({
        course: courseId,
        'student.studentId': student.studentId,
      }).populate('classTest');

      const flattenedMarks = marks.map(m => ({
        _id: m._id.toString(),
        courseId: m.course.toString(),
        ctId: (m.classTest as any)._id?.toString() || m.classTest.toString(),
        studentId: m.student.studentId,
        studentEmail: m.student.email,
        marksObtained: m.marksObtained,
        status: m.status,
        feedback: m.feedback || '',
        createdAt: m.createdAt,
        updatedAt: m.updatedAt,
      }));

      res.json({ success: true, data: flattenedMarks });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // Update mark
  static async updateMark(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { markId } = req.params;
      const { status, marksObtained, feedback } = req.body;

      const mark = await Mark.findById(markId).populate('classTest');
      if (!mark) {
        res.status(404).json({ success: false, message: 'Mark not found' });
        return;
      }

      // Track if significant changes occurred
      const significantChange =
        (status && status !== mark.status) ||
        (marksObtained !== undefined && marksObtained !== mark.marksObtained);

      if (status) mark.status = status;
      if (marksObtained !== undefined) mark.marksObtained = marksObtained;
      if (feedback !== undefined) mark.feedback = feedback;

      await mark.save();

      // ✅ Notify student if mark was updated and test is published
      const classTest = mark.classTest as any;
      if (significantChange && classTest.isPublished) {
        try {
          const course = await Course.findById(classTest.course);

          const markStatus = mark.status === 'present'
            ? `Updated marks: ${mark.marksObtained}/${classTest.totalMarks}`
            : 'Status: Absent';

          await notificationQueue.add(QUEUE_EVENTS.SEND_USER, {
            email: mark.student.email,
            title: `Marks Updated: ${classTest.name}`,
            body: `Your marks for "${classTest.name}" in ${course?.code} have been updated. ${markStatus}`,
            data: {
              courseId: classTest.course.toString(),
              classTestId: classTest._id.toString(),
              markId: markId,
              type: 'mark_updated',
              courseCode: course?.code,
              ctName: classTest.name,
              marksObtained: mark.marksObtained,
              totalMarks: classTest.totalMarks,
              status: mark.status,
            },
          });
        } catch (notifError) {
          console.error('Failed to send mark update notification:', notifError);
        }
      }

      const flattenedMark = {
        _id: mark._id.toString(),
        courseId: mark.course.toString(),
        ctId: (mark.classTest as any)._id?.toString() || mark.classTest.toString(),
        studentId: mark.student.studentId,
        studentEmail: mark.student.email,
        marksObtained: mark.marksObtained,
        status: mark.status,
        feedback: mark.feedback || '',
        createdAt: mark.createdAt,
        updatedAt: mark.updatedAt,
      };

      res.json({ success: true, message: 'Mark updated', data: flattenedMark });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Get individual CT export data
   */
  static async getExportData(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { testId } = req.params;

      const classTest = await ClassTest.findById(testId).populate('course');
      if (!classTest) {
        res.status(404).json({ success: false, message: 'Class test not found' });
        return;
      }

      const enrollments = await StudentEnrollment.find({ course: classTest.course });
      const studentIdsInRanges = enrollments.flatMap(e =>
        Array.from({ length: e.endId - e.startId + 1 }, (_, i) => e.startId + i)
      );

      const enrolledStudents = await Student.find({
        studentId: { $in: studentIdsInRanges }
      }).select('studentId email name department batch');

      const marks = await Mark.find({ classTest: testId });
      const marksMap = new Map(marks.map(m => [m.student.studentId, m]));

      const exportData = enrolledStudents.map(student => {
        const mark = marksMap.get(student.studentId);
        return {
          studentId: student.studentId,
          studentName: student.name,
          email: student.email,
          batch: student.batch,
          department: student.department,
          status: mark ? mark.status : 'not_graded',
          marksObtained: mark?.marksObtained ?? null,
          feedback: mark?.feedback ?? '',
        };
      });

      res.json({
        success: true,
        data: {
          classTest: {
            name: classTest.name,
            date: classTest.date,
            totalMarks: classTest.totalMarks,
            courseCode: (classTest.course as any).code,
          },
          students: exportData,
        },
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
}