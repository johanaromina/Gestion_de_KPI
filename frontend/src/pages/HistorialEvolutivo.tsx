import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import HistorialIndividual from './HistorialIndividual'
import Evolutivo from './Evolutivo'
import './HistorialEvolutivo.css'

export default function HistorialEvolutivo() {
  const { t } = useTranslation('history')
  const [activeTab, setActiveTab] = useState<'historial' | 'evolutivo'>('historial')

  return (
    <div className="historial-evolutivo-page">
      <div className="tabs header-tabs">
        <button
          className={`tab-button ${activeTab === 'historial' ? 'active' : ''}`}
          onClick={() => setActiveTab('historial')}
        >
          {t('tabs.process')}
        </button>
        <button
          className={`tab-button ${activeTab === 'evolutivo' ? 'active' : ''}`}
          onClick={() => setActiveTab('evolutivo')}
        >
          {t('tabs.evolution')}
        </button>
      </div>

      <div className="tab-content">
        {activeTab === 'historial' && <HistorialIndividual />}
        {activeTab === 'evolutivo' && <Evolutivo />}
      </div>
    </div>
  )
}
