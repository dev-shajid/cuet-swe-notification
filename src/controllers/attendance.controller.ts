import { AttendanceSession, AttendanceRecord, Student } from '../models';
import { AuthRequest } from '../middleware/auth.middleware';
import { Response } from 'express';

export class AttendanceController {
  // Create attendance session
  static async createAttendance(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { courseId, section, date, studentStatuses, notes }: {
        courseId: string;
        section: string;
        date: string;
        studentStatuses: Record<string, 'present' | 'absent'>;
        notes?: string;
      } = req.body;
      const teacherId = req.user!.userId;

      // Check if session already exists
      const existing = await AttendanceSession.findOne({
        course: courseId,
        section,
        date: new Date(date),
      });

      if (existing) {
        res.status(400).json({ success: false, message: 'Attendance already taken for this date' });
        return;
      }

      // Convert studentStatuses keys (studentId strings) to actual student documents
      const studentIds = Object.keys(studentStatuses).map(id => parseInt(id));
      const students = await Student.find({ studentId: { $in: studentIds } });

      // Create a map for quick lookup
      const studentMap = new Map(students.map(s => [s.studentId, s]));

      // ✅ Filter out students that don't exist in the database
      const validStudentStatuses: Record<string, 'present' | 'absent'> = {};
      const missingStudentIds: number[] = [];

      Object.entries(studentStatuses).forEach(([studentIdStr, status]) => {
        const studentIdNum = parseInt(studentIdStr);
        if (studentMap.has(studentIdNum)) {
          validStudentStatuses[studentIdStr] = status;
        } else {
          missingStudentIds.push(studentIdNum);
        }
      });

      // ✅ Log warning about missing students but continue
      if (missingStudentIds.length > 0) {
        console.warn(`⚠️ Warning: ${missingStudentIds.length} students not found in database:`, missingStudentIds);
      }

      // ✅ Check if we have any valid students
      if (Object.keys(validStudentStatuses).length === 0) {
        res.status(400).json({ 
          success: false, 
          message: 'No valid students found. All student IDs are missing from the database.',
          missingStudentIds 
        });
        return;
      }

      // Calculate stats (only for valid students)
      const totalStudents = Object.keys(validStudentStatuses).length;
      const presentCount = Object.values(validStudentStatuses).filter(s => s === 'present').length;

      // Create session
      const session = await AttendanceSession.create({
        course: courseId,
        section,
        date: new Date(date),
        teacher: teacherId,
        notes,
        stats: {
          totalStudents,
          presentCount,
          absentCount: totalStudents - presentCount,
        },
      });

      // Create individual records (only for valid students)
      const attendanceRecords = Object.entries(validStudentStatuses).map(([studentIdStr, status]) => {
        const studentIdNum = parseInt(studentIdStr);
        const student = studentMap.get(studentIdNum)!; // Safe because we filtered

        return {
          session: session._id,
          course: courseId,
          student: {
            _id: student._id,
            studentId: student.studentId,
            email: student.email,
          },
          status,
        };
      });

      await AttendanceRecord.insertMany(attendanceRecords);

      res.status(201).json({
        success: true,
        message: 'Attendance recorded',
        data: session,
        warnings: missingStudentIds.length > 0 ? {
          missingStudents: missingStudentIds.length,
          missingStudentIds,
          message: `${missingStudentIds.length} student(s) were not found in the database and were skipped.`
        } : undefined,
      });
    } catch (error: any) {
      console.error('Error creating attendance:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // Update attendance session
  static async updateAttendance(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { courseId, section, date, studentStatuses, notes }: {
        courseId: string;
        section: string;
        date: string;
        studentStatuses: Record<string, 'present' | 'absent'>;
        notes?: string;
      } = req.body;

      // Parse and normalize date
      const sessionDate = new Date(date);
      sessionDate.setHours(0, 0, 0, 0);

      // Validate date
      if (isNaN(sessionDate.getTime())) {
        res.status(400).json({ success: false, message: 'Invalid date format' });
        return;
      }

      // Find existing session
      const session = await AttendanceSession.findOne({
        course: courseId,
        section,
        date: sessionDate,
      });

      if (!session) {
        res.status(404).json({ success: false, message: 'Attendance session not found' });
        return;
      }

      // Convert studentStatuses keys to actual student documents
      const studentIds = Object.keys(studentStatuses).map(id => parseInt(id));
      const students = await Student.find({ studentId: { $in: studentIds } });

      // Create a map for quick lookup
      const studentMap = new Map(students.map(s => [s.studentId, s]));

      // Filter out students that don't exist
      const validStudentStatuses: Record<string, 'present' | 'absent'> = {};
      const missingStudentIds: number[] = [];

      Object.entries(studentStatuses).forEach(([studentIdStr, status]) => {
        const studentIdNum = parseInt(studentIdStr);
        if (studentMap.has(studentIdNum)) {
          validStudentStatuses[studentIdStr] = status;
        } else {
          missingStudentIds.push(studentIdNum);
        }
      });

      if (missingStudentIds.length > 0) {
        console.warn(`⚠️ Warning: ${missingStudentIds.length} students not found in database:`, missingStudentIds);
      }

      if (Object.keys(validStudentStatuses).length === 0) {
        res.status(400).json({ 
          success: false, 
          message: 'No valid students found.',
          missingStudentIds 
        });
        return;
      }

      // Calculate new stats
      const totalStudents = Object.keys(validStudentStatuses).length;
      const presentCount = Object.values(validStudentStatuses).filter(s => s === 'present').length;

      // Update session stats
      session.stats = {
        totalStudents,
        presentCount,
        absentCount: totalStudents - presentCount,
      };
      if (notes !== undefined) {
        session.notes = notes;
      }
      await session.save();

      // Delete old records for this session
      await AttendanceRecord.deleteMany({ session: session._id });

      // Create new records
      const attendanceRecords = Object.entries(validStudentStatuses).map(([studentIdStr, status]) => {
        const studentIdNum = parseInt(studentIdStr);
        const student = studentMap.get(studentIdNum)!;

        return {
          session: session._id,
          course: courseId,
          student: {
            _id: student._id,
            studentId: student.studentId,
            email: student.email,
          },
          status,
        };
      });

      await AttendanceRecord.insertMany(attendanceRecords);

      res.json({
        success: true,
        message: 'Attendance updated',
        data: session,
        warnings: missingStudentIds.length > 0 ? {
          missingStudents: missingStudentIds.length,
          missingStudentIds,
          message: `${missingStudentIds.length} student(s) were not found in the database and were skipped.`
        } : undefined,
      });
    } catch (error: any) {
      console.error('Error updating attendance:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // Get attendance by date
  static async getAttendanceByDate(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { courseId, section, date } = req.query;

      const session = await AttendanceSession.findOne({
        course: courseId,
        section,
        date: new Date(date as string),
      });

      if (!session) {
        res.json({ success: true, data: null });
        return;
      }

      const records = await AttendanceRecord.find({ session: session._id });

      res.json({ success: true, data: { session, records } });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // Get course attendance sessions
  static async getCourseAttendance(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { courseId } = req.params;
      const { section } = req.query;

      const query: any = { course: courseId };
      if (section) query.section = section;

      const sessions = await AttendanceSession.find(query)
        .sort({ date: -1 })
        .populate('teacher');

      res.json({ success: true, data: sessions });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // Get student attendance
  static async getStudentAttendance(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { courseId } = req.params;
      const studentId = req.user!.userId;

      const student = await Student.findById(studentId);
      if (!student) {
        res.status(404).json({ success: false, message: 'Student not found' });
        return;
      }

      const records = await AttendanceRecord.find({
        course: courseId,
        'student.studentId': student.studentId,
      }).populate('session');

      // Calculate stats
      const total = records.length;
      const present = records.filter(r => r.status === 'present').length;
      const percentage = total > 0 ? (present / total) * 100 : 0;

      res.json({
        success: true,
        data: {
          records,
          stats: {
            total,
            present,
            absent: total - present,
            percentage: Math.round(percentage * 100) / 100,
          },
        },
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // Update attendance record
  static async updateAttendanceRecord(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { recordId } = req.params;
      const { status } = req.body;

      const record = await AttendanceRecord.findById(recordId);
      if (!record) {
        res.status(404).json({ success: false, message: 'Record not found' });
        return;
      }

      record.status = status;
      await record.save();

      // Update session stats
      const allRecords = await AttendanceRecord.find({ session: record.session });
      await AttendanceSession.findByIdAndUpdate(record.session, {
        'stats.presentCount': allRecords.filter(r => r.status === 'present').length,
        'stats.absentCount': allRecords.filter(r => r.status === 'absent').length,
      });

      res.json({ success: true, message: 'Attendance updated', data: record });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
}