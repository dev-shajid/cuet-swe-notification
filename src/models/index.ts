// ============================================================================
// MONGOOSE SCHEMAS WITH TYPESCRIPT
// ============================================================================

import mongoose, { Schema, Model } from 'mongoose';
import {
    IStudentDocument,
    ITeacherDocument,
    ICourseDocument,
    ICourseTeacherDocument,
    IStudentEnrollmentDocument,
    ITeacherInvitationDocument,
    IAttendanceSessionDocument,
    IAttendanceRecordDocument,
    IClassTestDocument,
    IMarkDocument,
    INoteDocument,
    CourseTeacherRole,
    InvitationStatus,
    AttendanceStatus,
    MarkStatus,
    NotePriority,
    NoteUserModel,
    INotificationDocument,
    NotificationType,
} from '../types';

// ============================================================================
// USER SCHEMAS
// ============================================================================

const baseUserOptions = {
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
        index: true,
    },
    name: {
        type: String,
        required: true,
        trim: true,
    },
    image: {
        type: String,
        default: '',
    },
    expoPushToken: {
        type: String,
        sparse: true,
    },
};

// Student Schema
const studentSchema = new Schema<IStudentDocument>(
    {
        ...baseUserOptions,
        studentId: {
            type: Number,
            required: true,
            unique: true,
            index: true,
        },
        batch: {
            type: String,
            required: true,
            index: true,
        },
        department: {
            type: String,
            required: true,
            default: 'CSE',
        },
        inactiveCourses: [
            {
                type: Schema.Types.ObjectId,
                ref: 'Course',
            },
        ],
    },
    {
        timestamps: true,
        collection: 'students',
    }
);

// Indexes
studentSchema.index({ email: 1, studentId: 1 });
studentSchema.index({ batch: 1, department: 1 });

export const Student: Model<IStudentDocument> = mongoose.model<IStudentDocument>(
    'Student',
    studentSchema
);

// Teacher Schema
const teacherSchema = new Schema<ITeacherDocument>(
    {
        ...baseUserOptions,
        department: {
            type: String,
            required: true,
            default: 'CSE',
        },
    },
    {
        timestamps: true,
        collection: 'teachers',
    }
);

export const Teacher: Model<ITeacherDocument> = mongoose.model<ITeacherDocument>(
    'Teacher',
    teacherSchema
);

// ============================================================================
// COURSE SCHEMA
// ============================================================================

const courseSchema = new Schema<ICourseDocument>(
    {
        code: {
            type: String,
            required: true,
            unique: true,
            uppercase: true,
            trim: true,
            match: /^[A-Z]{3}-\d{3}$/,
            index: true,
        },
        name: {
            type: String,
            required: true,
            trim: true,
        },
        owner: {
            type: Schema.Types.ObjectId,
            ref: 'Teacher',
            required: true,
            index: true,
        },
        ownerEmail: {
            type: String,
            required: true,
        },
        credit: {
            type: Number,
            required: true,
            min: 0.5,
            max: 10,
        },
        batch: {
            type: Number,
            index: true,
        },
        isSessional: {
            type: Boolean,
            default: false,
        },
        bestCTCount: {
            type: Number,
            min: 1,
        },
        isActive: {
            type: Boolean,
            default: true,
            index: true,
        },
    },
    {
        timestamps: true,
        collection: 'courses',
    }
);

// Indexes
courseSchema.index({ owner: 1, isActive: 1 });
courseSchema.index({ batch: 1, isActive: 1 });

export const Course: Model<ICourseDocument> = mongoose.model<ICourseDocument>(
    'Course',
    courseSchema
);

// ============================================================================
// COURSE TEACHER MEMBERSHIP SCHEMA
// ============================================================================

const courseTeacherSchema = new Schema<ICourseTeacherDocument>(
    {
        course: {
            type: Schema.Types.ObjectId,
            required: true,
            ref: 'Course',
            index: true,
        },
        teacher: {
            type: Schema.Types.ObjectId,
            required: true,
            ref: 'Teacher',
            index: true,
        },
        teacherEmail: {
            type: String,
            required: true,
        },
        role: {
            type: String,
            enum: ['owner', 'teacher'] as CourseTeacherRole[],
            default: 'teacher',
        },
        isActive: {
            type: Boolean,
            default: true,
            index: true,
        },
        joinedAt: {
            type: Date,
            default: Date.now,
            immutable: true,
        },
    },
    {
        timestamps: true,
        collection: 'course_teachers',
    }
);

// Compound indexes
courseTeacherSchema.index({ course: 1, teacher: 1 }, { unique: true });
courseTeacherSchema.index({ teacher: 1, isActive: 1 });
courseTeacherSchema.index({ course: 1, isActive: 1 });

export const CourseTeacher: Model<ICourseTeacherDocument> = mongoose.model<ICourseTeacherDocument>(
    'CourseTeacher',
    courseTeacherSchema
);

// ============================================================================
// STUDENT ENROLLMENT SCHEMA
// ============================================================================

interface IStudentEnrollmentModel extends Model<IStudentEnrollmentDocument> {
    isStudentEnrolled(courseId: string, studentId: number): Promise<boolean>;
    getStudentSection(courseId: string, studentId: number): Promise<string | undefined>;
}

const studentEnrollmentSchema = new Schema<IStudentEnrollmentDocument, IStudentEnrollmentModel>(
    {
        course: {
            type: Schema.Types.ObjectId,
            required: true,
            ref: 'Course',
            index: true,
        },
        startId: {
            type: Number,
            required: true,
            validate: {
                validator: function (this: any, v: number) {
                    return v <= this.endId;
                },
                message: 'startId must be <= endId',
            },
        },
        endId: {
            type: Number,
            required: true,
        },
        section: {
            type: String,
            required: true,
            uppercase: true,
            trim: true,
            index: true,
        },
        addedBy: {
            type: Schema.Types.ObjectId,
            required: true,
            ref: 'Teacher',
        },
        addedAt: {
            type: Date,
            default: Date.now,
            immutable: true,
        },
    },
    {
        timestamps: false,
        collection: 'student_enrollments',
    }
);

// Compound indexes
studentEnrollmentSchema.index({ course: 1, section: 1 });
studentEnrollmentSchema.index({ course: 1, startId: 1, endId: 1 });

// Overlap validation
// Overlap validation
studentEnrollmentSchema.pre('save', async function (this: IStudentEnrollmentDocument) {
    const overlaps = await mongoose.model<IStudentEnrollmentDocument>('StudentEnrollment').findOne({
        course: this.course,
        _id: { $ne: this._id as any },
        $or: [
            {
                startId: { $lte: this.endId },
                endId: { $gte: this.startId },
            },
        ],
    });

    if (overlaps) {
        throw new Error('Enrollment ranges cannot overlap');
    }
});

// Static methods
studentEnrollmentSchema.statics.isStudentEnrolled = async function (
    courseId: string,
    studentId: number
): Promise<boolean> {
    const enrollment = await this.findOne({
        course: courseId,
        startId: { $lte: studentId },
        endId: { $gte: studentId },
    });
    return !!enrollment;
};

studentEnrollmentSchema.statics.getStudentSection = async function (
    courseId: string,
    studentId: number
): Promise<string | undefined> {
    const enrollment = await this.findOne({
        course: courseId,
        startId: { $lte: studentId },
        endId: { $gte: studentId },
    });
    return enrollment?.section;
};

export const StudentEnrollment: IStudentEnrollmentModel = mongoose.model<
    IStudentEnrollmentDocument,
    IStudentEnrollmentModel
>('StudentEnrollment', studentEnrollmentSchema);

// ============================================================================
// TEACHER INVITATION SCHEMA
// ============================================================================

const teacherInvitationSchema = new Schema<ITeacherInvitationDocument>(
    {
        course: {
            type: Schema.Types.ObjectId,
            required: true,
            ref: 'Course',
            index: true,
        },
        sender: {
            teacher: {
                type: Schema.Types.ObjectId,
                required: true,
                ref: 'Teacher',
            },
            email: {
                type: String,
                required: true,
            },
            name: {
                type: String,
                required: true,
            },
        },
        recipient: {
            teacher: {
                type: Schema.Types.ObjectId,
                required: true,
                ref: 'Teacher',
                index: true,
            },
            email: {
                type: String,
                required: true,
            },
        },
        status: {
            type: String,
            enum: ['pending', 'accepted', 'rejected'] as InvitationStatus[],
            default: 'pending',
            index: true,
        },
        respondedAt: {
            type: Date,
        },
        expiresAt: {
            type: Date,
            default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
    },
    {
        timestamps: true,
        collection: 'teacher_invitations',
    }
);

// Compound indexes
teacherInvitationSchema.index({ 'recipient.teacher': 1, status: 1 });
teacherInvitationSchema.index({ course: 1, 'recipient.teacher': 1 });
teacherInvitationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const TeacherInvitation: Model<ITeacherInvitationDocument> = mongoose.model<ITeacherInvitationDocument>(
    'TeacherInvitation',
    teacherInvitationSchema
);

// ============================================================================
// ATTENDANCE SCHEMAS
// ============================================================================

const attendanceSessionSchema = new Schema<IAttendanceSessionDocument>(
    {
        course: {
            type: Schema.Types.ObjectId,
            required: true,
            ref: 'Course',
            index: true,
        },
        section: {
            type: String,
            required: true,
            uppercase: true,
            index: true,
        },
        date: {
            type: Date,
            required: true,
            index: true,
        },
        teacher: {
            type: Schema.Types.ObjectId,
            required: true,
            ref: 'Teacher',
        },
        notes: {
            type: String,
            trim: true,
        },
        stats: {
            totalStudents: { type: Number, default: 0 },
            presentCount: { type: Number, default: 0 },
            absentCount: { type: Number, default: 0 },
        },
    },
    {
        timestamps: true,
        collection: 'attendance_sessions',
    }
);

// Compound indexes
attendanceSessionSchema.index({ course: 1, section: 1, date: 1 }, { unique: true });
attendanceSessionSchema.index({ course: 1, date: -1 });

export const AttendanceSession: Model<IAttendanceSessionDocument> = mongoose.model<IAttendanceSessionDocument>(
    'AttendanceSession',
    attendanceSessionSchema
);

const attendanceRecordSchema = new Schema<IAttendanceRecordDocument>(
    {
        session: {
            type: Schema.Types.ObjectId,
            required: true,
            ref: 'AttendanceSession',
            index: true,
        },
        course: {
            type: Schema.Types.ObjectId,
            required: true,
            ref: 'Course',
            index: true,
        },
        student: {
            _id: {
                type: Schema.Types.ObjectId,
                required: true,
                ref: 'Student',
            },
            studentId: {
                type: Number,
                required: true,
                index: true,
            },
            email: {
                type: String,
                required: true,
                index: true,
            },
        },
        status: {
            type: String,
            enum: ['present', 'absent'] as AttendanceStatus[],
            required: true,
            index: true,
        },
        markedAt: {
            type: Date,
            default: Date.now,
            immutable: true,
        },
    },
    {
        timestamps: false,
        collection: 'attendance_records',
    }
);

// Compound indexes
attendanceRecordSchema.index({ session: 1, 'student._id': 1 }, { unique: true });
attendanceRecordSchema.index({ course: 1, 'student.studentId': 1 });
attendanceRecordSchema.index({ course: 1, 'student.email': 1 });
attendanceRecordSchema.index({ 'student.studentId': 1, status: 1 });

export const AttendanceRecord: Model<IAttendanceRecordDocument> = mongoose.model<IAttendanceRecordDocument>(
    'AttendanceRecord',
    attendanceRecordSchema
);

// ============================================================================
// CLASS TEST SCHEMA
// ============================================================================

const classTestSchema = new Schema<IClassTestDocument>(
    {
        course: {
            type: Schema.Types.ObjectId,
            required: true,
            ref: 'Course',
            index: true,
        },
        name: {
            type: String,
            required: true,
            trim: true,
        },
        description: {
            type: String,
            trim: true,
        },
        date: {
            type: Date,
            required: true,
            index: true,
        },
        totalMarks: {
            type: Number,
            required: true,
            min: 0,
        },
        isPublished: {
            type: Boolean,
            default: false,
            index: true,
        },
        createdBy: {
            type: Schema.Types.ObjectId,
            required: true,
            ref: 'Teacher',
        },
    },
    {
        timestamps: true,
        collection: 'class_tests',
    }
);

// Compound indexes
classTestSchema.index({ course: 1, date: 1 });
classTestSchema.index({ course: 1, isPublished: 1 });

export const ClassTest: Model<IClassTestDocument> = mongoose.model<IClassTestDocument>(
    'ClassTest',
    classTestSchema
);

// ============================================================================
// MARK SCHEMA
// ============================================================================

const markSchema = new Schema<IMarkDocument>(
    {
        classTest: {
            type: Schema.Types.ObjectId,
            required: true,
            ref: 'ClassTest',
            index: true,
        },
        course: {
            type: Schema.Types.ObjectId,
            required: true,
            ref: 'Course',
            index: true,
        },
        classTestTotal: {
            type: Number,
            required: true,
            min: 0,
        },
        student: {
            _id: {
                type: Schema.Types.ObjectId,
                required: true,
                ref: 'Student',
            },
            studentId: {
                type: Number,
                required: true,
                index: true,
            },
            email: {
                type: String,
                required: true,
                index: true,
            },
        },
        status: {
            type: String,
            enum: ['present', 'absent'] as MarkStatus[],
            required: true,
        },
        marksObtained: {
            type: Number,
            min: 0,
            required: function (this: any) {
                return this.status === 'present';
            },
            validate: {
                validator: function (this: any, v: number) {
                    return this.status === 'absent' || v <= this.classTestTotal;
                },
                message: 'Marks obtained cannot exceed total marks',
            },
        },
        feedback: {
            type: String,
            trim: true,
        },
    },
    {
        timestamps: true,
        collection: 'marks',
    }
);

// Compound indexes
markSchema.index({ classTest: 1, 'student._id': 1 }, { unique: true });
markSchema.index({ course: 1, 'student.studentId': 1 });
markSchema.index({ course: 1, 'student.email': 1 });
markSchema.index({ classTest: 1, status: 1 });

export const Mark: Model<IMarkDocument> = mongoose.model<IMarkDocument>('Mark', markSchema);

// ============================================================================
// NOTE SCHEMA
// ============================================================================

const noteSchema = new Schema<INoteDocument>(
    {
        user: {
            _id: {
                type: Schema.Types.ObjectId,
                required: true,
                refPath: 'userModel',
            },
            email: {
                type: String,
                required: true,
                index: true,
            },
        },
        userModel: {
            type: String,
            required: true,
            enum: ['Student', 'Teacher'] as NoteUserModel[],
        },
        title: {
            type: String,
            required: true,
            trim: true,
        },
        description: {
            type: String,
            trim: true,
        },
        priority: {
            type: String,
            enum: ['high', 'medium', 'low'] as NotePriority[],
            default: 'medium',
        },
        completed: {
            type: Boolean,
            default: false,
            index: true,
        },
        dueDate: {
            type: Date,
            index: true,
        },
    },
    {
        timestamps: true,
        collection: 'notes',
    }
);

// Compound indexes
noteSchema.index({ 'user.email': 1, completed: 1, dueDate: 1 });
noteSchema.index({ 'user.email': 1, priority: 1 });

export const Note: Model<INoteDocument> = mongoose.model<INoteDocument>('Note', noteSchema);

// ============================================================================
// NOTIFICATION SCHEMA
// ============================================================================

const notificationSchema = new Schema<INotificationDocument>(
    {
        recipient: {
            type: Schema.Types.ObjectId,
            required: true,
            index: true,
            refPath: 'recipientModel',
        },
        recipientModel: {
            type: String,
            required: true,
            enum: ['Student', 'Teacher'],
            default: 'Student', // Default to Student for backward compatibility or most common case
        },
        type: {
            type: String,
            required: true,
            enum: [
                'course_enroll',
                'course_invitation',
                'attendance_marked',
                'ct_created',
                'ct_published',
                'mark_updated',
                'note_reminder',
            ] as NotificationType[],
        },
        title: {
            type: String,
            required: true,
            trim: true,
        },
        message: {
            type: String,
            required: true,
            trim: true,
        },
        data: {
            type: Schema.Types.Mixed,
        },
        read: {
            type: Boolean,
            default: false,
            index: true,
        },
    },
    {
        timestamps: true,
        collection: 'notifications',
    }
);

// Indexes
notificationSchema.index({ recipient: 1, read: 1 });
notificationSchema.index({ recipient: 1, createdAt: -1 });

export const Notification: Model<INotificationDocument> = mongoose.model<INotificationDocument>(
    'Notification',
    notificationSchema
);

// ============================================================================
// EXPORT ALL MODELS
// ============================================================================

export default {
    Student,
    Teacher,
    Course,
    CourseTeacher,
    StudentEnrollment,
    TeacherInvitation,
    AttendanceSession,
    AttendanceRecord,
    ClassTest,
    Mark,
    Note,
    Notification,
};