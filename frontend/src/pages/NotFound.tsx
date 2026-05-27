import { useTranslation } from 'react-i18next'

export default function NotFound() {
  const { t } = useTranslation('common')
  return (
    <div style={{ padding: '32px' }}>
      <h1 style={{ marginBottom: '8px' }}>{t('not_found.title')}</h1>
      <p>{t('not_found.text')}</p>
    </div>
  )
}
