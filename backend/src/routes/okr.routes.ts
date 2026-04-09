import { Router } from 'express'
import {
  getObjectives,
  getObjective,
  createObjective,
  updateObjective,
  deleteObjective,
  getKeyResults,
  createKeyResult,
  updateKeyResult,
  deleteKeyResult,
  getCheckIns,
  createCheckIn,
  getAlignmentTree,
  getTreeLinks,
  addTreeLink,
  removeTreeLink,
  getDataSources,
} from '../controllers/okr.controller'
import { authenticate, authorize } from '../middleware/auth.middleware'

const router = Router()

router.use(authenticate)

// Alignment tree
router.get('/alignment-tree', getAlignmentTree)

// Objectives
router.get('/', getObjectives)
router.post('/', createObjective)
router.get('/:id', getObjective)
router.put('/:id', updateObjective)
router.delete('/:id', authorize('admin', 'director', 'manager'), deleteObjective)

// Key Results de un objetivo
router.get('/:objectiveId/key-results', getKeyResults)
router.post('/:objectiveId/key-results', createKeyResult)
router.put('/:objectiveId/key-results/:krId', updateKeyResult)
router.delete('/:objectiveId/key-results/:krId', deleteKeyResult)

// Check-ins de un KR
router.get('/key-results/:krId/check-ins', getCheckIns)
router.post('/key-results/:krId/check-ins', createCheckIn)

// Fuentes de datos (trazabilidad)
router.get('/:id/data-sources', getDataSources)

// Vinculos con Arbol de Objetivos
router.get('/:id/tree-links', getTreeLinks)
router.post('/:id/tree-links', authorize('admin', 'director', 'manager'), addTreeLink)
router.delete('/:id/tree-links/:treeId', authorize('admin', 'director', 'manager'), removeTreeLink)

export default router
