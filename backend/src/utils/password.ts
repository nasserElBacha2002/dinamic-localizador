export const hashPassword = async (password: string): Promise<string> => {
  const bcrypt = await import("bcrypt");
  return bcrypt.hash(password, 12);
};

export const verifyPassword = async (password: string, passwordHash: string): Promise<boolean> => {
  const bcrypt = await import("bcrypt");
  return bcrypt.compare(password, passwordHash);
};

export const normalizeEmail = (email: string): string => email.trim().toLowerCase();
