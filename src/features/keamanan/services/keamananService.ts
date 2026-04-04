// backend/src/services/keamananService.ts
import { db } from '../../../db/drizzle';
import { keamanan_logs, type IncidentStatus } from '../../../db/schema';
import { eq } from 'drizzle-orm';
import ApiError from '../../../utils/apiError';

export const updateKeamananLogStatus = async (
  logId: string,
  userId: string,
  status: IncidentStatus,
  notes?: string
) => {
  const [existing] = await db
    .select()
    .from(keamanan_logs)
    .where(eq(keamanan_logs.id, logId))
    .limit(1);

  if (!existing) throw new ApiError(404, 'Log keamanan tidak ditemukan.');

  const [updated] = await db
    .update(keamanan_logs)
    .set({
      status,
      notes: notes || existing.notes,
      acknowledged_by: userId,
      acknowledged_at: new Date()
    })
    .where(eq(keamanan_logs.id, logId))
    .returning();

  return updated;
};
