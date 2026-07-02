import type { User } from "../types/auth";

export const platformAdminService = {
  isPlatformAdmin(user: Pick<User, "isPlatformAdmin"> | null | undefined): boolean {
    return Boolean(user?.isPlatformAdmin);
  },
};
