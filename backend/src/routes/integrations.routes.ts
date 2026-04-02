import { Router } from 'express'
import {
  testIntegrationJql,
  listAuthProfiles,
  createAuthProfile,
  updateAuthProfile,
  listTemplates,
  createTemplate,
  updateTemplate,
  listTargets,
  createTarget,
  updateTarget,
  listTemplateRuns,
  archiveRun,
  deleteRun,
  archiveRuns,
  deleteRuns,
  runTemplate,
  runTarget,
  testTemplate,
  getNextCronRun,
  listIntegrations,
  getIntegrationById,
  createIntegration,
  updateIntegration,
  updateIntegrationStatus,
  runIntegration,
  listIntegrationRuns,
} from '../controllers/integrations.controller'
import { authenticate, requirePermission } from '../middleware/auth.middleware'

const router = Router()

router.use(authenticate)

// Plantillas (nuevo modelo escalable)
router.get('/templates', requirePermission('config.view', 'config.manage'), listTemplates)
router.post('/templates', requirePermission('config.manage'), createTemplate)
router.put('/templates/:id', requirePermission('config.manage'), updateTemplate)
router.post('/templates/:id/run', requirePermission('measurement_run_ingest', 'config.manage'), runTemplate)
router.get('/runs', requirePermission('config.view', 'config.manage', 'measurement_read'), listTemplateRuns)
router.patch('/runs/:id/archive', requirePermission('config.manage'), archiveRun)
router.delete('/runs/:id', requirePermission('config.manage'), deleteRun)
router.post('/runs/archive', requirePermission('config.manage'), archiveRuns)
router.post('/runs/delete', requirePermission('config.manage'), deleteRuns)
router.post('/templates/test', requirePermission('config.manage'), testTemplate)
router.get('/cron/next', requirePermission('config.view', 'config.manage', 'measurement_read'), getNextCronRun)

// Targets
router.get('/targets', requirePermission('config.view', 'config.manage', 'measurement_read'), listTargets)
router.post('/targets', requirePermission('config.manage'), createTarget)
router.put('/targets/:id', requirePermission('config.manage'), updateTarget)
router.post('/targets/:id/run', requirePermission('measurement_run_ingest', 'config.manage'), runTarget)

// Auth profiles
router.get('/auth-profiles', requirePermission('config.view', 'config.manage'), listAuthProfiles)
router.post('/auth-profiles', requirePermission('config.manage'), createAuthProfile)
router.put('/auth-profiles/:id', requirePermission('config.manage'), updateAuthProfile)

// Legacy endpoints
router.post('/test-jql', requirePermission('config.manage'), testIntegrationJql)
router.get('/', requirePermission('config.view', 'config.manage'), listIntegrations)
router.get('/:id', requirePermission('config.view', 'config.manage'), getIntegrationById)
router.post('/', requirePermission('config.manage'), createIntegration)
router.put('/:id', requirePermission('config.manage'), updateIntegration)
router.patch('/:id/status', requirePermission('config.manage'), updateIntegrationStatus)
router.post('/:id/run', requirePermission('measurement_run_ingest', 'config.manage'), runIntegration)
router.get('/:id/runs', requirePermission('config.view', 'config.manage', 'measurement_read'), listIntegrationRuns)

export default router
