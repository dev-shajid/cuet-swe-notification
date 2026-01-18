import express from 'express';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import { AttendanceController } from '../controllers/attendance.controller';
import { ClassTestController } from '../controllers/classTest.controller';
import { InvitationController } from '../controllers/invitation.controller';
import { NoteController } from '../controllers/note.controller';
import { CourseController } from '../controllers/course.controller';
import * as UserController from '../controllers/user.controller';

const router = express.Router();

// ============================================================================
// USERS ROUTES
// ============================================================================

router.post('/users/me', authenticate, UserController.createOrUpdateUser);
router.get('/users/me', authenticate, UserController.getMe);
router.post('/users/me/push-token', authenticate, UserController.savePushTokenHandler);
router.delete('/users/me/push-token', authenticate, UserController.removePushTokenHandler);

// ============================================================================
// COURSE ROUTES
// ============================================================================

// ✅ TEACHER ROUTES
router.post('/courses', authenticate, requireRole('teacher'), CourseController.createCourse);
router.get('/courses/teacher', authenticate, requireRole('teacher'), CourseController.getTeacherCourses);
router.put('/courses/:courseId', authenticate, requireRole('teacher'), CourseController.updateCourse);
router.delete('/courses/:courseId', authenticate, requireRole('teacher'), CourseController.deleteCourse);

// ✅ STUDENT ROUTES
router.get('/courses/student', authenticate, requireRole('student'), CourseController.getStudentCourses);

// ✅ SHARED ROUTES
router.get('/courses/:courseId', authenticate, CourseController.getCourseById);
router.get('/courses/:courseId/stats', authenticate, CourseController.getCourseStats);

// ✅ NEW: Get students by IDs (for enrollment verification)
router.get('/courses/:courseId/students', authenticate, CourseController.getStudentsByIds);

// ✅ PERFORMANCE ROUTES (Dashboard data - optimized)
router.get('/courses/:courseId/performance', authenticate, requireRole('teacher'), CourseController.getTeacherCoursePerformance);
router.get('/courses/:courseId/student-performance', authenticate, requireRole('student'), CourseController.getStudentCoursePerformance);
router.get('/courses/:courseId/export-report', authenticate, requireRole('teacher'), CourseController.getExportReport);

// ============================================================================
// ENROLLMENT ROUTES (TEACHER ONLY)
// ============================================================================

router.post('/courses/:courseId/enrollments', authenticate, requireRole('teacher'), CourseController.addEnrollment);
router.post('/courses/:courseId/add-teacher', authenticate, requireRole('teacher'), CourseController.addTeacherToCourse);
router.get('/courses/:courseId/enrollments', authenticate, requireRole('teacher'), CourseController.getEnrollments);
router.put('/enrollments/:enrollmentId', authenticate, requireRole('teacher'), CourseController.updateEnrollment);
router.delete('/enrollments/:enrollmentId', authenticate, requireRole('teacher'), CourseController.deleteEnrollment);

// ============================================================================
// COURSE STATUS ROUTES
// ============================================================================

// ✅ TEACHER COURSE STATUS
router.patch('/courses/:courseId/status/teacher', authenticate, requireRole('teacher'), CourseController.toggleTeacherCourseStatus);

// ✅ STUDENT COURSE STATUS
router.patch('/courses/:courseId/status/student', authenticate, requireRole('student'), CourseController.toggleStudentCourseStatus);

// ============================================================================
// TEACHER INVITATION ROUTES
// ============================================================================

router.post('/invitations', authenticate, requireRole('teacher'), InvitationController.sendInvitation);
router.get('/invitations/pending', authenticate, requireRole('teacher'), InvitationController.getPendingInvitations);
router.post('/invitations/:invitationId/accept', authenticate, requireRole('teacher'), InvitationController.acceptInvitation);
router.post('/invitations/:invitationId/reject', authenticate, requireRole('teacher'), InvitationController.rejectInvitation);

// ============================================================================
// ATTENDANCE ROUTES
// ============================================================================

// Teacher routes
router.post('/attendance', authenticate, requireRole('teacher'), AttendanceController.createAttendance);
router.put('/attendance', authenticate, requireRole('teacher'), AttendanceController.updateAttendance); // ✅ NEW
router.get('/attendance/course/:courseId', authenticate, AttendanceController.getCourseAttendance);
router.patch('/attendance/records/:recordId', authenticate, requireRole('teacher'), AttendanceController.updateAttendanceRecord);

// Student routes
router.get('/attendance/student/:courseId', authenticate, requireRole('student'), AttendanceController.getStudentAttendance);

// Shared routes
router.get('/attendance', authenticate, AttendanceController.getAttendanceByDate);

// ============================================================================
// CLASS TEST & MARKS ROUTES
// ============================================================================

// Teacher routes
router.post('/class-tests', authenticate, requireRole('teacher'), ClassTestController.createClassTest);
router.put('/class-tests/:testId', authenticate, requireRole('teacher'), ClassTestController.updateClassTest);
router.delete('/class-tests/:testId', authenticate, requireRole('teacher'), ClassTestController.deleteClassTest);
router.put('/marks/batch', authenticate, requireRole('teacher'), ClassTestController.batchUpdateMarks);
router.get('/class-tests/:testId/marks', authenticate, requireRole('teacher'), ClassTestController.getClassTestMarks);
router.patch('/marks/:markId', authenticate, requireRole('teacher'), ClassTestController.updateMark);

// Student routes
router.get('/marks/student/:courseId', authenticate, requireRole('student'), ClassTestController.getStudentCourseMarks);

// Shared routes
router.get('/class-tests/course/:courseId', authenticate, ClassTestController.getCourseClassTests);
router.get('/class-tests/:testId', authenticate, ClassTestController.getClassTestById);
router.get('/class-tests/:testId/export', authenticate, requireRole('teacher'), ClassTestController.getExportData);

// ============================================================================
// NOTE ROUTES
// ============================================================================

router.post('/notes', authenticate, NoteController.createNote);
router.get('/notes', authenticate, NoteController.getUserNotes);
router.get('/notes/:noteId', authenticate, NoteController.getNoteById);
router.put('/notes/:noteId', authenticate, NoteController.updateNote);
router.delete('/notes/:noteId', authenticate, NoteController.deleteNote);
router.patch('/notes/:noteId/toggle', authenticate, NoteController.toggleNoteCompletion);

export default router;