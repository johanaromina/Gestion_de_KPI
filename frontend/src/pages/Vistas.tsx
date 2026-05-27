import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../hooks/useAuth'
import VistasAgregadas from './VistasAgregadas'
import VistasReduccion from './VistasReduccion'
import ParrillaGeneral from './ParrillaGeneral'
import './Vistas.css'

export default function Vistas() {
  const { t } = useTranslation('views')
  const { user } = useAuth()
  const hasSuperpowers = Boolean(user?.hasSuperpowers)
  const [activeTab, setActiveTab] = useState<'agregadas' | 'reduccion' | 'parrilla'>('agregadas')

  return (
    <div className="vistas-page">
      <div className="page-header">
        <div>
          <h1>{t('title')}</h1>
          <p className="subtitle">
            {hasSuperpowers
              ? t('subtitle_superpowers')
              : t('subtitle_team')}
          </p>
        </div>
      </div>
      <div className="tabs header-tabs">
        <button
          className={`tab-button ${activeTab === 'agregadas' ? 'active' : ''}`}
          onClick={() => setActiveTab('agregadas')}
        >
          {t('tabs.aggregated')}
        </button>
        <button
          className={`tab-button ${activeTab === 'reduccion' ? 'active' : ''}`}
          onClick={() => setActiveTab('reduccion')}
        >
          {t('tabs.reduction')}
        </button>
        {hasSuperpowers && (
          <button
            className={`tab-button ${activeTab === 'parrilla' ? 'active' : ''}`}
            onClick={() => setActiveTab('parrilla')}
          >
            {t('tabs.company_grid')}
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
