import type { AccessClaims } from '../identity/token.service.js';
import type { PrismaService } from '../infra/prisma.service.js';

export const ADMIN_ROLES = ['tomcom_admin', 'super_admin'] as const;

/**
 * FR-908: the batches a staff member may see. Admins see all (null); a trainer sees only the
 * batches they are assigned to. Every admin query filters through this.
 */
export async function batchScope(
  prisma: PrismaService,
  auth: AccessClaims,
): Promise<string[] | null> {
  if ((ADMIN_ROLES as readonly string[]).includes(auth.role)) return null;
  const rows = await prisma.db.batchTrainer.findMany({
    where: { trainerId: auth.userId },
    select: { batchId: true },
  });
  return rows.map((r) => r.batchId);
}

/** Masks a phone number for staff screens: only the last four digits show. */
export const maskPhone = (e164: string) => `${e164.slice(0, 3)} •••••• ${e164.slice(-4)}`;
