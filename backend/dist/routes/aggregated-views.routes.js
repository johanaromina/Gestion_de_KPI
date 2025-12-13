import { Router } from 'express';
import { getAggregatedByDirection, getAggregatedByManagement, getAggregatedByLeadership, getAggregatedByArea, } from '../controllers/aggregated-views.controller';
const router = Router();
router.get('/direction', getAggregatedByDirection);
router.get('/management', getAggregatedByManagement);
router.get('/leadership', getAggregatedByLeadership);
router.get('/area', getAggregatedByArea);
export default router;
//# sourceMappingURL=aggregated-views.routes.js.map