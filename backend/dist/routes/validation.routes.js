import { Router } from 'express';
import { validateConsistency, validatePeriodConsistency, } from '../controllers/validation.controller';
const router = Router();
router.get('/consistency', validateConsistency);
router.get('/period/:periodId/consistency', validatePeriodConsistency);
export default router;
//# sourceMappingURL=validation.routes.js.map