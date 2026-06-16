import { config } from "dotenv";
import { normalizeEmail, hashPassword } from "../utils/password";
import { userRepository } from "../repositories/user.repository";
import { connectDatabase, closeDatabase } from "../database/connection";

config();

const main = async (): Promise<void> => {
  const name = process.env.ADMIN_NAME?.trim();
  const email = process.env.ADMIN_EMAIL?.trim();
  const password = process.env.ADMIN_PASSWORD;

  if (!name || !email || !password) {
    console.error("Missing required environment variables: ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD");
    process.exit(1);
  }

  if (password.length < 8) {
    console.error("ADMIN_PASSWORD must be at least 8 characters.");
    process.exit(1);
  }

  await connectDatabase();

  try {
    const normalizedEmail = normalizeEmail(email);
    const existing = await userRepository.findByEmail(normalizedEmail);
    if (existing) {
      console.error(`Admin user already exists for email: ${normalizedEmail}`);
      process.exit(1);
    }

    const passwordHash = await hashPassword(password);
    const user = await userRepository.create({
      name,
      email: normalizedEmail,
      passwordHash,
      role: "ADMIN",
    });

    console.log(`Admin user created: ${user.email} (${user.id})`);
  } finally {
    await closeDatabase();
  }
};

void main().catch((error) => {
  console.error("Failed to create admin user:", error);
  process.exit(1);
});
