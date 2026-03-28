// backend/src/api/routes/areaRoutes.ts
import { Router } from 'express';
import { z } from 'zod';
import * as areaController from '../controllers/areaController';
import { roleBasedAuth } from '../middlewares/authMiddleware';
import { validate } from '../middlewares/validateRequest';

const router = Router();
const adminOnly = roleBasedAuth(['admin', 'super_admin']);

const createAreaSchema = z.object({
  body: z.object({
    name: z.string().min(1, { message: 'Nama area wajib diisi.' }),
    warehouse_id: z.string().uuid({ message: 'Warehouse ID harus berupa UUID yang valid.' }),
  }),
});

const updateAreaSchema = z.object({
  body: z.object({
    name: z.string().min(1, { message: 'Nama area wajib diisi.' }).optional(),
  }),
  params: z.object({
    id: z.string().uuid({ message: 'ID harus berupa UUID yang valid.' }),
  }),
});

router.get('/', areaController.listAreas);
router.post('/', adminOnly, validate(createAreaSchema), areaController.createArea);
router.put('/:id', adminOnly, validate(updateAreaSchema), areaController.updateArea);
router.delete('/:id', adminOnly, areaController.deleteArea);

export default router;
