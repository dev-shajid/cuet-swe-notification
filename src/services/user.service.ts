import { Student, Teacher } from '../models';
import { extractStudentIdFromEmail, getRole } from '../utils/role';

export interface AppUser {
  email: string;
  name: string;
  image?: string;
  role?: 'student' | 'teacher';
  studentId?: number;
  batch?: string;
  department?: string;
  expoPushToken?: string;
}

// Save user to MongoDB
export const saveUser = async (user: AppUser): Promise<AppUser | null> => {
  try {
    const { email, name, image } = user;
    const role = getRole(email);
    if (!role) return null;

    if (role === 'teacher') {
      let teacher = await Teacher.findOne({ email });
      if (!teacher) {
        teacher = new Teacher({
          email,
          name,
          image: image || '',
          department: user.department || 'CSE',
        });
        await teacher.save();
      }
      return teacher.toObject();
    } else {
      // student
      const studentId = extractStudentIdFromEmail(email);
      if (!studentId) return null;

      let student = await Student.findOne({ email });
      if (!student) {
        student = new Student({
          email,
          name,
          image: image || '',
          role,
          studentId,
          batch: user.batch || '2021',
          department: user.department || 'CSE',
        });
        await student.save();
      }
      return student.toObject();
    }
  } catch (error) {
    console.error('❌ Error saving user:', error);
    return null;
  }
};

// Fetch user by email
export const getUserByEmail = async (email: string): Promise<AppUser | null> => {
  try {
    const role = getRole(email);
    if (!role) return null;

    if (role === 'teacher') {
      const teacher = await Teacher.findOne({ email });
      if (!teacher) return null;
      return {...teacher.toObject(), role };
    } else {
      const student = await Student.findOne({ email });
      if (!student) return null;
      return {...student.toObject(), role };
    }
  } catch (error) {
    console.error('❌ Error fetching user:', error);
    return null;
  }
};

// Save or update push token for user
export const savePushToken = async (email: string, pushToken: string): Promise<boolean> => {
  try {
    const role = getRole(email);
    if (!role) return false;

    if (role === 'teacher') {
      await Teacher.findOneAndUpdate(
        { email },
        { expoPushToken: pushToken },
        { new: true }
      );
    } else {
      await Student.findOneAndUpdate(
        { email },
        { expoPushToken: pushToken },
        { new: true }
      );
    }

    return true;
  } catch (error) {
    console.error('❌ Error saving push token:', error);
    return false;
  }
};

// Remove push token for user
export const removePushToken = async (email: string): Promise<boolean> => {
  try {
    const role = getRole(email);
    if (!role) return false;

    if (role === 'teacher') {
      await Teacher.findOneAndUpdate(
        { email },
        { expoPushToken: '' },
        { new: true }
      );
    } else {
      await Student.findOneAndUpdate(
        { email },
        { expoPushToken: '' },
        { new: true }
      );
    }

    return true;
  } catch (error) {
    console.error('❌ Error removing push token:', error);
    return false;
  }
};
