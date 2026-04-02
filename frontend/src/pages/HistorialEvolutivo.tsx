import { useState } from 'react'
import HistorialIndividual from './HistorialIndividual'
import Evolutivo from './Evolutivo'
import './HistorialEvolutivo.css'

export default function HistorialEvolutivo() {
  const [activeTab, setActiveTab] = useState<'historial' | 'evolutivo'>('historial')

  return (
    <div className="historial-evolutivo-page">
      <div className="tabs header-tabs">
        <button
          className={`tab-button ${activeTab === 'historial' ? 'active' : ''}`}
          onClick={() => setActiveTab('historial')}
        >
          Mi proceso
        </button>
        <button
          className={`tab-button ${activeTab === 'evolutivo' ? 'active' : ''}`}
          onClick={() => setActiveTab('evolutivo')}
        >
          Evolutivo
        </button>
      </div>

      <div className="tab-content">
        {activeTab === 'historial' && <HistorialIndividual />}
        {activeTab === 'evolutivo' && <Evolutivo />}
      </div>
    </div>
  )
}
