// ============================================================================
// MONGOOSE DOCUMENT TYPES
// ============================================================================

import { Document, Types } from 'mongoose';

// ============================================================================
// BASE USER TYPES
// ============================================================================

export interface IBaseUser {
    email: string;
    name: string;
    image: string;
    expoPushToken?: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface IStudent extends IBaseUser {
    studentId: number;
    batch: string;
    department: string;
    inactiveCourses: Types.ObjectId[];
}

export interface ITeacher extends IBaseUser {
    department: string;
}

// Mongoose Document types (with _id)
export interface IStudentDocument extends IStudent, Document {
    _id: Types.ObjectId;
}

export interface ITeacherDocument extends ITeacher, Document {
    _id: Types.ObjectId;
}

// Populated types (for frontend use)
export interface IStudentPopulated extends Omit<IStudent, 'inactiveCourses'> {
    _id: string;
    inactiveCourses: ICoursePopulated[];
}

export interface ITeacherPopulated extends ITeacher {
    _id: string;
}

// Union type for any user
export type IUser = IStudent | ITeacher;
export type IUserDocument = IStudentDocument | ITeacherDocument;
export type IUserPopulated = IStudentPopulated | ITeacherPopulated;

// ============================================================================
// COURSE TYPES
// ============================================================================

export interface ICourse {
    code: string;
    name: string;
    owner: Types.ObjectId;
    ownerEmail: string;
    credit: number;
    batch?: number;
    isSessional: boolean;
    bestCTCount?: number;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export interface ICourseDocument extends ICourse, Document {
    _id: Types.ObjectId;
}

export interface ICoursePopulated extends Omit<ICourse, 'owner'> {
    _id: string;
    owner: ITeacherPopulated;
}

// ============================================================================
// COURSE TEACHER MEMBERSHIP TYPES
// ============================================================================

export type CourseTeacherRole = 'owner' | 'teacher';

export interface ICourseTeacher {
    course: Types.ObjectId;
    teacher: Types.ObjectId;
    teacherEmail: string;
    role: CourseTeacherRole;
    isActive: boolean;
    joinedAt: Date;
    createdAt: Date;
    updatedAt: Date;
}

export interface ICourseTeacherDocument extends ICourseTeacher, Document {
    _id: Types.ObjectId;
}

export interface ICourseTeacherPopulated extends Omit<ICourseTeacher, 'course' | 'teacher'> {
    _id: string;
    course: ICoursePopulated;
    teacher: ITeacherPopulated;
}

// ============================================================================
// STUDENT ENROLLMENT TYPES
// ============================================================================

export interface IStudentEnrollment {
    course: Types.ObjectId;
    startId: number;
    endId: number;
    section: string;
    addedBy: Types.ObjectId;
    addedAt: Date;
}

export interface IStudentEnrollmentDocument extends IStudentEnrollment, Document {
    _id: Types.ObjectId;
}

export interface IStudentEnrollmentPopulated extends Omit<IStudentEnrollment, 'course' | 'addedBy'> {
    _id: string;
    course: ICoursePopulated;
    addedBy: ITeacherPopulated;
}

// Helper type for checking enrollment
export interface IEnrollmentCheck {
    isEnrolled: boolean;
    section?: string;
    enrollment?: IStudentEnrollmentPopulated;
}

// ============================================================================
// TEACHER INVITATION TYPES
// ============================================================================

export type InvitationStatus = 'pending' | 'accepted' | 'rejected';

export interface ITeacherInvitation {
    course: Types.ObjectId;
    sender: {
        teacher: Types.ObjectId;
        email: string;
        name: string;
    };
    recipient: {
        teacher: Types.ObjectId;
        email: string;
    };
    status: InvitationStatus;
    respondedAt?: Date;
    expiresAt: Date;
    createdAt: Date;
    updatedAt: Date;
}

export interface ITeacherInvitationDocument extends ITeacherInvitation, Document {
    _id: Types.ObjectId;
}

export interface ITeacherInvitationPopulated extends Omit<
    ITeacherInvitation,
    'course' | 'sender' | 'recipient'
> {
    _id: string;
    course: ICoursePopulated;
    sender: {
        teacher: ITeacherPopulated;
        email: string;
        name: string;
    };
    recipient: {
        teacher: ITeacherPopulated;
        email: string;
    };
}

// ============================================================================
// ATTENDANCE TYPES
// ============================================================================

export type AttendanceStatus = 'present' | 'absent';

export interface IAttendanceStats {
    totalStudents: number;
    presentCount: number;
    absentCount: number;
}

export interface IAttendanceSession {
    course: Types.ObjectId;
    section: string;
    date: Date;
    teacher: Types.ObjectId;
    notes?: string;
    stats: IAttendanceStats;
    createdAt: Date;
    updatedAt: Date;
}

export interface IAttendanceSessionDocument extends IAttendanceSession, Document {
    _id: Types.ObjectId;
}

export interface IAttendanceSessionPopulated extends Omit<IAttendanceSession, 'course' | 'teacher'> {
    _id: string;
    course: ICoursePopulated;
    teacher: ITeacherPopulated;
}

export interface IAttendanceRecord {
    session: Types.ObjectId;
    course: Types.ObjectId;
    student: {
        _id: Types.ObjectId;
        studentId: number;
        email: string;
    };
    status: AttendanceStatus;
    markedAt: Date;
}

export interface IAttendanceRecordDocument extends IAttendanceRecord, Document {
    _id: Types.ObjectId;
}

export interface IAttendanceRecordPopulated extends Omit<
    IAttendanceRecord,
    'session' | 'course' | 'student'
> {
    _id: string;
    session: IAttendanceSessionPopulated;
    course: ICoursePopulated;
    student: {
        _id: string;
        studentId: number;
        email: string;
        details?: IStudentPopulated; // Optional full student details
    };
}

// Attendance statistics for student
export interface IStudentAttendanceStats {
    totalSessions: number;
    presentCount: number;
    absentCount: number;
    percentage: number;
}

// ============================================================================
// CLASS TEST & MARK TYPES
// ============================================================================

export interface IClassTest {
    course: Types.ObjectId;
    name: string;
    description?: string;
    date: Date;
    totalMarks: number;
    isPublished: boolean;
    createdBy: Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

export interface IClassTestDocument extends IClassTest, Document {
    _id: Types.ObjectId;
}

export interface IClassTestPopulated extends Omit<IClassTest, 'course' | 'createdBy'> {
    _id: string;
    course: ICoursePopulated;
    createdBy: ITeacherPopulated;
}

export type MarkStatus = 'present' | 'absent';

export interface IMark {
    classTest: Types.ObjectId;
    course: Types.ObjectId;
    classTestTotal: number;
    student: {
        _id: Types.ObjectId;
        studentId: number;
        email: string;
    };
    status: MarkStatus;
    marksObtained?: number;
    feedback?: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface IMarkDocument extends IMark, Document {
    _id: Types.ObjectId;
}

export interface IMarkPopulated extends Omit<
    IMark,
    'classTest' | 'course' | 'student'
> {
    _id: string;
    classTest: IClassTestPopulated;
    course: ICoursePopulated;
    student: {
        _id: string;
        studentId: number;
        email: string;
        details?: IStudentPopulated;
    };
}

// Class test statistics
export interface IClassTestStats {
    totalStudents: number;
    presentStudents: number;
    absentStudents: number;
    averageMarks: number;
    highestMarks: number;
    lowestMarks: number;
    submittedCount: number;
}

// Student performance in a course
export interface IStudentCoursePerformance {
    student: IStudentPopulated;
    marks: IMarkPopulated[];
    totalCTs: number;
    averageMark: number;
    bestCTAverage: number;
    attendancePercentage: number;
}

// ============================================================================
// NOTE TYPES
// ============================================================================

export type NotePriority = 'high' | 'medium' | 'low';
export type NoteUserModel = 'Student' | 'Teacher';

export interface INote {
    user: {
        _id: Types.ObjectId;
        email: string;
    };
    userModel: NoteUserModel;
    title: string;
    description?: string;
    priority: NotePriority;
    completed: boolean;
    dueDate?: Date;
    createdAt: Date;
    updatedAt: Date;
}

export interface INoteDocument extends INote, Document {
    _id: Types.ObjectId;
}

export interface INotePopulated extends Omit<INote, 'user'> {
    _id: string;
    user: {
        _id: string;
        email: string;
        details?: IUserPopulated;
    };
}

// ============================================================================
// REQUEST/RESPONSE TYPES (DTOs)
// ============================================================================

// Course DTOs
export interface ICreateCourseDTO {
    code: string;
    name: string;
    credit: number;
    batch?: number;
    isSessional?: boolean;
    bestCTCount?: number;
}

export interface IUpdateCourseDTO {
    name?: string;
    credit?: number;
    bestCTCount?: number;
}

// Student Enrollment DTOs
export interface IAddEnrollmentDTO {
    startId: number;
    endId: number;
    section: string;
}

export interface IUpdateEnrollmentDTO {
    startId?: number;
    endId?: number;
    section?: string;
}

// Teacher Invitation DTOs
export interface ISendInvitationDTO {
    courseId: string;
    recipientEmail: string;
}

export interface IRespondInvitationDTO {
    invitationId: string;
    accept: boolean;
}

// Attendance DTOs
export interface ICreateAttendanceDTO {
    courseId: string;
    section: string;
    date: Date;
    records: Array<{
        studentId: number;
        email: string;
        status: AttendanceStatus;
    }>;
    notes?: string;
}

export interface IUpdateAttendanceDTO {
    recordId: string;
    status: AttendanceStatus;
}

// Class Test DTOs
export interface ICreateClassTestDTO {
    courseId: string;
    name: string;
    description?: string;
    date: Date;
    totalMarks: number;
}

export interface IUpdateClassTestDTO {
    name?: string;
    description?: string;
    date?: Date;
    totalMarks?: number;
    isPublished?: boolean;
}

// Mark DTOs
export interface IAddMarkDTO {
    classTestId: string;
    studentId: number | string;
    email: string;
    status: MarkStatus;
    marksObtained?: number;
    feedback?: string;
}

export interface IUpdateMarkDTO {
    markId: string;
    status?: MarkStatus;
    marksObtained?: number;
    feedback?: string;
}

export interface IBatchAddMarksDTO {
    classTestId: string;
    marks: Array<{
        studentId: number | string;
        email: string;
        status: MarkStatus;
        marksObtained?: number;
        feedback?: string;
    }>;
}

// Note DTOs
export interface ICreateNoteDTO {
    title: string;
    description?: string;
    priority: NotePriority;
    dueDate?: Date;
}

export interface IUpdateNoteDTO {
    title?: string;
    description?: string;
    priority?: NotePriority;
    completed?: boolean;
    dueDate?: Date;
}

// ============================================================================
// QUERY/FILTER TYPES
// ============================================================================

export interface IPaginationParams {
    page: number;
    limit: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
}

export interface IPaginatedResponse<T> {
    data: T[];
    pagination: {
        total: number;
        page: number;
        limit: number;
        totalPages: number;
        hasNextPage: boolean;
        hasPrevPage: boolean;
    };
}

export interface ICourseFilterParams {
    batch?: number;
    isActive?: boolean;
    isSessional?: boolean;
    search?: string;
}

export interface IAttendanceFilterParams {
    courseId: string;
    section?: string;
    startDate?: Date;
    endDate?: Date;
}

export interface IMarkFilterParams {
    courseId: string;
    classTestId?: string;
    studentId?: number;
    status?: MarkStatus;
}

export interface INoteFilterParams {
    priority?: NotePriority;
    completed?: boolean;
    dueDateBefore?: Date;
    dueDateAfter?: Date;
}

// ============================================================================
// AGGREGATION RESULT TYPES
// ============================================================================

export interface IAttendanceAggregation {
    _id: string | null;
    totalSessions: number;
    presentCount: number;
    absentCount: number;
    percentage: number;
}

export interface IMarkAggregation {
    _id: string | null;
    totalTests: number;
    averageMark: number;
    highestMark: number;
    lowestMark: number;
    totalMarksObtained: number;
    totalPossibleMarks: number;
}

export interface ICourseStatsAggregation {
    totalStudents: number;
    totalTeachers: number;
    totalClasses: number;
    averageAttendance: number;
}

// ============================================================================
// API RESPONSE TYPES
// ============================================================================

export interface IApiResponse<T = any> {
    success: boolean;
    message?: string;
    data?: T;
    error?: string;
}

export interface IApiError {
    success: false;
    message: string;
    error: string;
    statusCode: number;
}

// ============================================================================
// AUTHENTICATION TYPES
// ============================================================================

export type UserRole = 'student' | 'teacher';

export interface IAuthUser {
    _id: string;
    email: string;
    role: UserRole;
    name: string;
    image: string;
}

export interface IAuthTokenPayload {
    userId: Types.ObjectId | undefined;
    sessionId: string;
    role?: 'student' | 'teacher';
    email?: string;
}


export interface ILoginDTO {
    email: string;
    password: string;
}

export interface IRegisterDTO {
    email: string;
    password: string;
    name: string;
    role: UserRole;
    studentId?: number; // Required for students
    batch?: string; // Required for students
    department?: string;
}

export interface IAuthResponse {
    success: boolean;
    user: IAuthUser;
    token: string;
    refreshToken: string;
}

// ============================================================================
// NOTIFICATION TYPES
// ============================================================================

export type NotificationType =
    | 'course_enroll'
    | 'course_invitation'
    | 'attendance_marked'
    | 'ct_created'
    | 'ct_published'
    | 'mark_updated'
    | 'note_reminder';

export interface INotification {
    recipient: Types.ObjectId;
    recipientModel: 'Student' | 'Teacher';
    type: NotificationType;
    title: string;
    message: string;
    data?: Record<string, any>;
    read: boolean;
    createdAt: Date;
}

export interface INotificationDocument extends INotification, Document {
    _id: Types.ObjectId;
}

export interface INotificationPopulated extends INotification {
    _id: string;
}

export interface ISendNotificationDTO {
    recipients: string[]; // emails
    title: string;
    message: string;
    type: NotificationType;
    data?: Record<string, any>;
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

// Convert Mongoose document to plain object
export type PlainDocument<T> = Omit<T, keyof Document> & { _id: string };

// Make all fields optional (for partial updates)
export type PartialUpdate<T> = Partial<Omit<T, '_id' | 'createdAt' | 'updatedAt'>>;

// Extract only the fields needed for creation (no _id, timestamps)
export type CreateInput<T> = Omit<T, '_id' | 'createdAt' | 'updatedAt'>;

// Type guard helpers
export const isStudent = (user: IUser): user is IStudent => {
    return 'studentId' in user;
};

export const isTeacher = (user: IUser): user is ITeacher => {
    return !('studentId' in user);
};

export const isStudentDocument = (doc: IUserDocument): doc is IStudentDocument => {
    return 'studentId' in doc;
};

export const isTeacherDocument = (doc: IUserDocument): doc is ITeacherDocument => {
    return !('studentId' in doc);
};

// ============================================================================
// EXPORT ALL TYPES
// ============================================================================

export type {
    // Documents
    Document,
    Types,
    // Add more as needed
};