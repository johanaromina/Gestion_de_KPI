import { Router } from 'express';
import { getSubPeriods, getSubPeriodById, createSubPeriod, updateSubPeriod, deleteSubPeriod, } from '../controllers/sub-periods.controller';
const router = Router();
router.get('/', getSubPeriods);
router.get('/:id', getSubPeriodById);
router.post('/', createSubPeriod);
router.put('/:id', updateSubPeriod);
router.delete('/:id', deleteSubPeriod);
export default router;
//# sourceMappingURL=sub-periods.routes.js.map