import { Router } from 'express'
import { getEvolution } from '../controllers/evolution.controller.js'

const router = Router()

router.get('/evolution', getEvolution)

export default router

