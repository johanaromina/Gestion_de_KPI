import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import HttpBackend from 'i18next-http-backend'
import LanguageDetector from 'i18next-browser-languagedetector'

i18n
  .use(HttpBackend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: 'es',
    supportedLngs: ['es', 'en'],
    defaultNS: 'common',
    ns: ['common', 'layout', 'auth', 'dashboard', 'assignments', 'grid', 'okr', 'week', 'analytics', 'views', 'checkins', 'input', 'executive', 'history', 'audit', 'collaborators', 'curation', 'kpis', 'periods', 'account', 'security', 'config', 'landing', 'datasource', 'import', 'marketplace', 'organigrama'],
    backend: {
      loadPath: '/locales/{{lng}}/{{ns}}.json',
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'i18n-lang',
    },
    interpolation: {
      escapeValue: false,
    },
  })

export default i18n
