
// ============================================================================
// NOTE CONTROLLER (controllers/note.controller.ts)
// ============================================================================

import { Note } from '../models';
import { ICreateNoteDTO, IUpdateNoteDTO } from '../types';
import { AuthRequest } from '../middleware/auth.middleware';
import { Response } from 'express';

export class NoteController {
  // Create note
  static async createNote(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { title, description, priority, dueDate }: ICreateNoteDTO = req.body;
      const userId = req.user!.userId;
      const userEmail = req.user!.email;
      const userModel = req.user!.role === 'student' ? 'Student' : 'Teacher';

      const note = await Note.create({
        user: {
          _id: userId,
          email: userEmail,
        },
        userModel,
        title,
        description,
        priority: priority || 'medium',
        dueDate: dueDate ? new Date(dueDate) : undefined,
      });

      res.status(201).json({ success: true, message: 'Note created', data: note });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // Get user notes
  static async getUserNotes(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userEmail = req.user!.email;
      const { completed, priority } = req.query;

      const query: any = { 'user.email': userEmail };
      if (completed !== undefined) query.completed = completed === 'true';
      if (priority) query.priority = priority;

      const notes = await Note.find(query).sort({ createdAt: -1 });

      res.json({ success: true, data: notes });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // Get note by ID
  static async getNoteById(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { noteId } = req.params;
      const userEmail = req.user!.email;

      const note = await Note.findOne({
        _id: noteId,
        'user.email': userEmail,
      });

      if (!note) {
        res.status(404).json({ success: false, message: 'Note not found' });
        return;
      }

      res.json({ success: true, data: note });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // Update note
  static async updateNote(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { noteId } = req.params;
      const updates: IUpdateNoteDTO = req.body;
      const userEmail = req.user!.email;

      const note = await Note.findOne({
        _id: noteId,
        'user.email': userEmail,
      });

      if (!note) {
        res.status(404).json({ success: false, message: 'Note not found' });
        return;
      }

      Object.assign(note, updates);
      await note.save();

      res.json({ success: true, message: 'Note updated', data: note });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // Delete note
  static async deleteNote(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { noteId } = req.params;
      const userEmail = req.user!.email;

      const result = await Note.deleteOne({
        _id: noteId,
        'user.email': userEmail,
      });

      if (result.deletedCount === 0) {
        res.status(404).json({ success: false, message: 'Note not found' });
        return;
      }

      res.json({ success: true, message: 'Note deleted' });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // Toggle note completion
  static async toggleNoteCompletion(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { noteId } = req.params;
      const userEmail = req.user!.email;

      const note = await Note.findOne({
        _id: noteId,
        'user.email': userEmail,
      });

      if (!note) {
        res.status(404).json({ success: false, message: 'Note not found' });
        return;
      }

      note.completed = !note.completed;
      await note.save();

      res.json({ success: true, message: 'Note status toggled', data: note });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
}
