import { Suspense, lazy } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import { DialogProvider } from './components/Dialog'
import Layout from './components/Layout'
import { useAuth } from './hooks/useAuth'

const Login = lazy(() => import('./pages/Login'))
const ResetPassword = lazy(() => import('./pages/ResetPassword'))
const Register = lazy(() => import('./pages/Register'))
const SsoCallback = lazy(() => import('./pages/SsoCallback'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const TableroEjecutivo = lazy(() => import('./pages/TableroEjecutivo'))
const Colaboradores = lazy(() => import('./pages/Colaboradores'))
const Periodos = lazy(() => import('./pages/Periodos'))
const KPIs = lazy(() => import('./pages/KPIs'))
const Asignaciones = lazy(() => import('./pages/Asignaciones'))
const AsignacionesScope = lazy(() => import('./pages/AsignacionesScope'))
const InputDatos = lazy(() => import('./pages/InputDatos'))
const Curaduria = lazy(() => import('./pages/Curaduria'))
const ArbolObjetivos = lazy(() => import('./pages/ArbolObjetivos'))
const MiParrilla = lazy(() => import('./pages/MiParrilla'))
const MiCuenta = lazy(() => import('./pages/MiCuenta'))
const HistorialEvolutivo = lazy(() => import('./pages/HistorialEvolutivo'))
const Vistas = lazy(() => import('./pages/Vistas'))
const ConsolidadoColaborador = lazy(() => import('./pages/ConsolidadoColaborador'))
const VistasAgregadas = lazy(() => import('./pages/VistasAgregadas'))
const VistasReduccion = lazy(() => import('./pages/VistasReduccion'))
const Auditoria = lazy(() => import('./pages/Auditoria'))
const Configuracion = lazy(() => import('./pages/Configuracion'))
const DataSourceMappings = lazy(() => import('./pages/DataSourceMappings'))
const Seguridad = lazy(() => import('./pages/Seguridad'))
const ParrillaGeneral = lazy(() => import('./pages/ParrillaGeneral'))
const Evolutivo = lazy(() => import('./pages/Evolutivo'))
const NotFound = lazy(() => import('./pages/NotFound'))
const MapaRiesgo = lazy(() => import('./pages/MapaRiesgo'))
const Simulador = lazy(() => import('./pages/Simulador'))
const CheckIns = lazy(() => import('./pages/CheckIns'))
const MarketplaceKPI = lazy(() => import('./pages/MarketplaceKPI'))
const Landing = lazy(() => import('./pages/Landing'))
const OKRBoard = lazy(() => import('./pages/OKRBoard'))
const Organigrama = lazy(() => import('./pages/Organigrama'))
const ImportarDatos = lazy(() => import('./pages/ImportarDatos'))
const OKRCrear = lazy(() => import('./pages/OKRCrear'))
const OKRAlineacion = lazy(() => import('./pages/OKRAlineacion'))
const OKRDetalle = lazy(() => import('./pages/OKRDetalle'))
const MiSemana = lazy(() => import('./pages/MiSemana'))
const Analytics = lazy(() => import('./pages/Analytics'))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})

const RequireAuth = ({ children }: { children: JSX.Element }) => {
  const { user, isLoading, error } = useAuth()
  if (isLoading) return null
  if (!user || error) return <Navigate to="/login" replace />
  return children
}

const HomeRoute = () => {
  const { user, isLoading } = useAuth()
  if (isLoading) return null
  if (user) return <Dashboard />
  return <Landing />
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <DialogProvider>
      <Router>
        <Layout>
          <Suspense fallback={null}>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/sso/callback" element={<SsoCallback />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/register" element={<Register />} />
              <Route path="/landing" element={<Landing />} />
              <Route path="/" element={<HomeRoute />} />
              <Route
                path="/analytics"
                element={
                  <RequireAuth>
                    <Analytics />
                  </RequireAuth>
                }
              />
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
                path="/mi-semana"
                element={
                  <RequireAuth>
                    <MiSemana />
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
                path="/organigrama"
                element={
                  <RequireAuth>
                    <Organigrama />
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
                path="/importar-datos"
                element={
                  <RequireAuth>
                    <ImportarDatos />
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
                path="/okr"
                element={
                  <RequireAuth>
                    <OKRBoard />
                  </RequireAuth>
                }
              />
              <Route
                path="/okr/nuevo"
                element={
                  <RequireAuth>
                    <OKRCrear />
                  </RequireAuth>
                }
              />
              <Route
                path="/okr/alineacion"
                element={
                  <RequireAuth>
                    <OKRAlineacion />
                  </RequireAuth>
                }
              />
              <Route
                path="/okr/:id/editar"
                element={
                  <RequireAuth>
                    <OKRCrear />
                  </RequireAuth>
                }
              />
              <Route
                path="/okr/:id"
                element={
                  <RequireAuth>
                    <OKRDetalle />
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
          </Suspense>
        </Layout>
      </Router>
      </DialogProvider>
    </QueryClientProvider>
  )
}

export default App
