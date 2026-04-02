import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import VistasAgregadas from './VistasAgregadas'
import VistasReduccion from './VistasReduccion'
import ParrillaGeneral from './ParrillaGeneral'
import './Vistas.css'

export default function Vistas() {
  const { user } = useAuth()
  const hasSuperpowers = Boolean(user?.hasSuperpowers)
  const [activeTab, setActiveTab] = useState<'agregadas' | 'reduccion' | 'parrilla'>('agregadas')

  return (
    <div className="vistas-page">
      <div className="page-header">
        <div>
          <h1>Vistas</h1>
          <p className="subtitle">
            {hasSuperpowers
              ? 'Equipo y compañía en un solo lugar.'
              : 'Vista general de tu equipo.'}
          </p>
        </div>
      </div>
      <div className="tabs header-tabs">
        <button
          className={`tab-button ${activeTab === 'agregadas' ? 'active' : ''}`}
          onClick={() => setActiveTab('agregadas')}
        >
          Equipo · Agregadas
        </button>
        <button
          className={`tab-button ${activeTab === 'reduccion' ? 'active' : ''}`}
          onClick={() => setActiveTab('reduccion')}
        >
          Equipo · Reducción
        </button>
        {hasSuperpowers && (
          <button
            className={`tab-button ${activeTab === 'parrilla' ? 'active' : ''}`}
            onClick={() => setActiveTab('parrilla')}
          >
            Compañía · Parrilla
          </button>
        )}
      </div>

      <div className="tab-content">
        {activeTab === 'agregadas' && <VistasAgregadas />}
        {activeTab === 'reduccion' && <VistasReduccion />}
        {activeTab === 'parrilla' && hasSuperpowers && <ParrillaGeneral />}
      </div>
    </div>
  )
}
