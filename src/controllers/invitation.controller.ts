import { TeacherInvitation, CourseTeacher, Teacher, Course } from '../models';
import { ISendInvitationDTO } from '../types';
import { AuthRequest } from '../middleware/auth.middleware';
import { Response } from 'express';
import { notificationQueue, QUEUE_EVENTS } from '../config/queue';

export class InvitationController {
  // Send invitation
  static async sendInvitation(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { courseId, recipientEmail }: ISendInvitationDTO = req.body;
      const senderId = req.user!.userId;

      // Get sender details
      const sender = await Teacher.findById(senderId);
      if (!sender) {
        res.status(404).json({ success: false, message: 'Sender not found' });
        return;
      }

      // Get recipient details
      const recipient = await Teacher.findOne({ email: recipientEmail });
      if (!recipient) {
        res.status(404).json({ success: false, message: 'Recipient not found' });
        return;
      }

      // Get course details
      const course = await Course.findById(courseId);
      if (!course) {
        res.status(404).json({ success: false, message: 'Course not found' });
        return;
      }

      // Check if already a member
      const existing = await CourseTeacher.findOne({
        course: courseId,
        teacher: recipient._id,
      });

      if (existing) {
        res.status(400).json({ success: false, message: 'Already a member of this course' });
        return;
      }

      // Check for existing pending invitation
      const pendingInvitation = await TeacherInvitation.findOne({
        course: courseId,
        'recipient.teacher': recipient._id,
        status: 'pending',
      });

      if (pendingInvitation) {
        res.status(400).json({ success: false, message: 'Invitation already sent' });
        return;
      }

      // Create invitation
      const invitation = await TeacherInvitation.create({
        course: courseId,
        sender: {
          teacher: senderId,
          email: sender.email,
          name: sender.name,
        },
        recipient: {
          teacher: recipient._id,
          email: recipient.email,
        },
        status: 'pending',
      });

      // ✅ Send notification to recipient
      try {
        await notificationQueue.add(QUEUE_EVENTS.SEND_USER, {
          email: recipientEmail,
          title: `Course Invitation: ${course.name}`,
          body: `${sender.name} has invited you to join ${course.code} - ${course.name} as a teacher.`,
          data: {
            courseId: courseId,
            invitationId: invitation._id.toString(),
            type: 'course_invitation',
            courseCode: course.code,
            courseName: course.name,
            senderName: sender.name,
            senderEmail: sender.email,
          },
        });
      } catch (notifError) {
        console.error('Failed to send invitation notification:', notifError);
      }

      res.status(201).json({
        success: true,
        message: 'Invitation sent',
        data: invitation,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // Get pending invitations for teacher
  static async getPendingInvitations(req: AuthRequest, res: Response): Promise<void> {
    try {
      const teacherId = req.user!.userId;

      const invitations = await TeacherInvitation.find({
        'recipient.teacher': teacherId,
        status: 'pending',
      })
        .populate('course')
        .sort({ createdAt: -1 });

      res.json({ success: true, data: invitations });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // Accept invitation
  static async acceptInvitation(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { invitationId } = req.params;
      const teacherId = req.user!.userId;

      const invitation = await TeacherInvitation.findById(invitationId).populate('course');
      if (!invitation) {
        res.status(404).json({ success: false, message: 'Invitation not found' });
        return;
      }

      // Verify it's for this teacher
      if (!invitation.recipient.teacher.equals(teacherId)) {
        res.status(403).json({ success: false, message: 'Not authorized' });
        return;
      }

      if (invitation.status !== 'pending') {
        res.status(400).json({ success: false, message: 'Invitation already responded to' });
        return;
      }

      // Get course and recipient details for notifications
      const course = invitation.course as any;
      const recipient = await Teacher.findById(teacherId);

      // Update invitation
      invitation.status = 'accepted';
      invitation.respondedAt = new Date();
      await invitation.save();

      // Add teacher to course
      await CourseTeacher.create({
        course: invitation.course,
        teacher: teacherId,
        teacherEmail: invitation.recipient.email,
        role: 'teacher',
        isActive: true,
      });

      // ✅ Notify the sender that their invitation was accepted
      try {
        await notificationQueue.add(QUEUE_EVENTS.SEND_USER, {
          email: invitation.sender.email,
          title: `Invitation Accepted: ${course.name}`,
          body: `${recipient?.name || invitation.recipient.email} has accepted your invitation to join ${course.code} - ${course.name}.`,
          data: {
            courseId: invitation.course.toString(),
            invitationId: invitationId,
            type: 'invitation_accepted',
            courseCode: course.code,
            courseName: course.name,
            recipientName: recipient?.name,
            recipientEmail: invitation.recipient.email,
          },
        });
      } catch (notifError) {
        console.error('Failed to send invitation acceptance notification:', notifError);
      }

      // ✅ Also notify the recipient (confirmation)
      try {
        await notificationQueue.add(QUEUE_EVENTS.SEND_USER, {
          email: invitation.recipient.email,
          title: `Welcome to ${course.name}`,
          body: `You are now a teacher in ${course.code} - ${course.name}. You can start managing the course.`,
          data: {
            courseId: invitation.course.toString(),
            type: 'invitation_accepted_confirmation',
            courseCode: course.code,
            courseName: course.name,
          },
        });
      } catch (notifError) {
        console.error('Failed to send confirmation notification:', notifError);
      }

      res.json({ success: true, message: 'Invitation accepted' });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // Reject invitation
  static async rejectInvitation(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { invitationId } = req.params;
      const teacherId = req.user!.userId;

      const invitation = await TeacherInvitation.findById(invitationId).populate('course');
      if (!invitation) {
        res.status(404).json({ success: false, message: 'Invitation not found' });
        return;
      }

      if (!invitation.recipient.teacher.equals(teacherId)) {
        res.status(403).json({ success: false, message: 'Not authorized' });
        return;
      }

      if (invitation.status !== 'pending') {
        res.status(400).json({ success: false, message: 'Invitation already responded to' });
        return;
      }

      // Get course and recipient details for notification
      const course = invitation.course as any;
      const recipient = await Teacher.findById(teacherId);

      invitation.status = 'rejected';
      invitation.respondedAt = new Date();
      await invitation.save();

      // ✅ Notify the sender that their invitation was rejected
      try {
        await notificationQueue.add(QUEUE_EVENTS.SEND_USER, {
          email: invitation.sender.email,
          title: `Invitation Declined: ${course.name}`,
          body: `${recipient?.name || invitation.recipient.email} has declined your invitation to join ${course.code} - ${course.name}.`,
          data: {
            courseId: invitation.course.toString(),
            invitationId: invitationId,
            type: 'invitation_rejected',
            courseCode: course.code,
            courseName: course.name,
            recipientName: recipient?.name,
            recipientEmail: invitation.recipient.email,
          },
        });
      } catch (notifError) {
        console.error('Failed to send invitation rejection notification:', notifError);
      }

      res.json({ success: true, message: 'Invitation rejected' });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
}