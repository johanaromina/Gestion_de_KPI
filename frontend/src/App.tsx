import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import { DialogProvider } from './components/Dialog'
import Layout from './components/Layout'
import Login from './pages/Login'
import ResetPassword from './pages/ResetPassword'
import Register from './pages/Register'
import SsoCallback from './pages/SsoCallback'
import Dashboard from './pages/Dashboard'
import TableroEjecutivo from './pages/TableroEjecutivo'
import Colaboradores from './pages/Colaboradores'
import Periodos from './pages/Periodos'
import KPIs from './pages/KPIs'
import Asignaciones from './pages/Asignaciones'
import AsignacionesScope from './pages/AsignacionesScope'
import InputDatos from './pages/InputDatos'
import Curaduria from './pages/Curaduria'
import ArbolObjetivos from './pages/ArbolObjetivos'
import MiParrilla from './pages/MiParrilla'
import MiCuenta from './pages/MiCuenta'
import HistorialEvolutivo from './pages/HistorialEvolutivo'
import Vistas from './pages/Vistas'
import ConsolidadoColaborador from './pages/ConsolidadoColaborador'
import VistasAgregadas from './pages/VistasAgregadas'
import VistasReduccion from './pages/VistasReduccion'
import Auditoria from './pages/Auditoria'
import Configuracion from './pages/Configuracion'
import DataSourceMappings from './pages/DataSourceMappings'
import Seguridad from './pages/Seguridad'
import ParrillaGeneral from './pages/ParrillaGeneral'
import Evolutivo from './pages/Evolutivo'
import NotFound from './pages/NotFound'
import MapaRiesgo from './pages/MapaRiesgo'
import Simulador from './pages/Simulador'
import CheckIns from './pages/CheckIns'
import MarketplaceKPI from './pages/MarketplaceKPI'
import Landing from './pages/Landing'
import { isTokenExpired } from './hooks/useAuth'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})

const RequireAuth = ({ children }: { children: JSX.Element }) => {
  const token = localStorage.getItem('token') || sessionStorage.getItem('token')
  const expired = isTokenExpired(token)

  if (!token || expired) {
    if (expired) {
      localStorage.removeItem('token')
      sessionStorage.removeItem('token')
    }
    return <Navigate to="/login" replace />
  }
  return children
}

const HomeRoute = () => {
  const token = localStorage.getItem('token') || sessionStorage.getItem('token')
  const expired = isTokenExpired(token)
  if (token && !expired) return <Dashboard />
  return <Landing />
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <DialogProvider>
      <Router>
        <Layout>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/sso/callback" element={<SsoCallback />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/register" element={<Register />} />
            <Route path="/" element={<HomeRoute />} />
            <Route
              path="/tablero-ejecutivo"
              element={
                <RequireAuth>
                  <TableroEjecutivo />
                </RequireAuth>
              }
            />
            <Route
              path="/mapa-riesgo"
              element={
                <RequireAuth>
                  <MapaRiesgo />
                </RequireAuth>
              }
            />
            <Route
              path="/simulador"
              element={
                <RequireAuth>
                  <Simulador />
                </RequireAuth>
              }
            />
            <Route
              path="/check-ins"
              element={
                <RequireAuth>
                  <CheckIns />
                </RequireAuth>
              }
            />
            <Route
              path="/marketplace-kpi"
              element={
                <RequireAuth>
                  <MarketplaceKPI />
                </RequireAuth>
              }
            />
            <Route
              path="/colaboradores"
              element={
                <RequireAuth>
                  <Colaboradores />
                </RequireAuth>
              }
            />
            <Route
              path="/periodos"
              element={
                <RequireAuth>
                  <Periodos />
                </RequireAuth>
              }
            />
            <Route
              path="/kpis"
              element={
                <RequireAuth>
                  <KPIs />
                </RequireAuth>
              }
            />
            <Route
              path="/asignaciones"
              element={
                <RequireAuth>
                  <Asignaciones />
                </RequireAuth>
              }
            />
            <Route
              path="/asignaciones-scope"
              element={
                <RequireAuth>
                  <AsignacionesScope />
                </RequireAuth>
              }
            />
            <Route
              path="/asignaciones-macro"
              element={<Navigate to="/asignaciones-scope" replace />}
            />
            <Route
              path="/input-datos"
              element={
                <RequireAuth>
                  <InputDatos />
                </RequireAuth>
              }
            />
            <Route
              path="/curaduria"
              element={
                <RequireAuth>
                  <Curaduria />
                </RequireAuth>
              }
            />
            <Route
              path="/arbol-objetivos"
              element={
                <RequireAuth>
                  <ArbolObjetivos />
                </RequireAuth>
              }
            />
            <Route
              path="/mi-parrilla"
              element={
                <RequireAuth>
                  <MiParrilla />
                </RequireAuth>
              }
            />
            <Route
              path="/mi-cuenta"
              element={
                <RequireAuth>
                  <MiCuenta />
                </RequireAuth>
              }
            />
            <Route
              path="/mi-parrilla/:collaboratorId/:periodId"
              element={
                <RequireAuth>
                  <MiParrilla />
                </RequireAuth>
              }
            />
            <Route
              path="/historial/:collaboratorId?"
              element={
                <RequireAuth>
                  <HistorialEvolutivo />
                </RequireAuth>
              }
            />
            <Route
              path="/vistas"
              element={
                <RequireAuth>
                  <Vistas />
                </RequireAuth>
              }
            />
            <Route
              path="/vistas-agregadas"
              element={
                <RequireAuth>
                  <VistasAgregadas />
                </RequireAuth>
              }
            />
            <Route
              path="/vistas-reduccion"
              element={
                <RequireAuth>
                  <VistasReduccion />
                </RequireAuth>
              }
            />
            <Route
              path="/evolutivo"
              element={
                <RequireAuth>
                  <Evolutivo />
                </RequireAuth>
              }
            />
            <Route
              path="/auditoria"
              element={
                <RequireAuth>
                  <Auditoria />
                </RequireAuth>
              }
            />
            <Route
              path="/configuracion"
              element={
                <RequireAuth>
                  <Configuracion />
                </RequireAuth>
              }
            />
            <Route
              path="/mappings-externos"
              element={
                <RequireAuth>
                  <DataSourceMappings />
                </RequireAuth>
              }
            />
            <Route
              path="/seguridad"
              element={
                <RequireAuth>
                  <Seguridad />
                </RequireAuth>
              }
            />
            <Route
              path="/consolidado"
              element={
                <RequireAuth>
                  <ConsolidadoColaborador />
                </RequireAuth>
              }
            />
            <Route
              path="/parrilla-general"
              element={
                <RequireAuth>
                  <ParrillaGeneral />
                </RequireAuth>
              }
            />
            <Route
              path="*"
              element={
                <RequireAuth>
                  <NotFound />
                </RequireAuth>
              }
            />
          </Routes>
        </Layout>
      </Router>
      </DialogProvider>
    </QueryClientProvider>
  )
}

export default App
