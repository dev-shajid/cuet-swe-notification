import { UserRole } from "../types";

export const extractStudentIdFromEmail = (email: string): number | null => {
    if (!email) return null;
    const lower = email.toLowerCase().trim();
    // Strict pattern: leading 'u' followed by 7 digits then domain
    const match = lower.match(/^u(\d{7})@student\.cuet\.ac\.bd$/);
    if (match) {
        return parseInt(match[1], 10);
    }
    return null;
};

export const getStudentEmailFromId = (studentId: number): string => {
    return `u${studentId}@student.cuet.ac.bd`;
};

export const getRole = (email: string): UserRole | null => {
    if (!email) return null;
    const e = email.toLowerCase().trim();
    // Use strict student email pattern: u1234567@student.cuet.ac.bd
    if (extractStudentIdFromEmail(e) !== null) {
        return 'student';
    }
        if (
        e === 'sajidislam729@gmail.com' ||
        e == 'mahirsalahin01@gmail.com' ||
        e == 'shajidislam.ctg.bd@gmail.com' ||
        e == 's11096875@gmail.com' ||
        e == 'shamsniloy75@gmail.com' ||
        e.endsWith('@cuet.ac.bd')
    ) {
        return 'teacher';
    }
    return null;
};