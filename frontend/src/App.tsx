import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Colaboradores from './pages/Colaboradores'
import Periodos from './pages/Periodos'
import KPIs from './pages/KPIs'
import Asignaciones from './pages/Asignaciones'
import ArbolObjetivos from './pages/ArbolObjetivos'
import MiParrilla from './pages/MiParrilla'
import HistorialIndividual from './pages/HistorialIndividual'
import ConsolidadoColaborador from './pages/ConsolidadoColaborador'
import VistasAgregadas from './pages/VistasAgregadas'
import VistasReduccion from './pages/VistasReduccion'
import Auditoria from './pages/Auditoria'
import Configuracion from './pages/Configuracion'
import ParrillaGeneral from './pages/ParrillaGeneral'
import Evolutivo from './pages/Evolutivo'
import NotFound from './pages/NotFound'
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
  const token = localStorage.getItem('token')
  const expired = isTokenExpired(token)

  if (!token || expired) {
    if (expired) {
      localStorage.removeItem('token')
    }
    return <Navigate to="/login" replace />
  }
  return children
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <Layout>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/"
              element={
                <RequireAuth>
                  <Dashboard />
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
                  <HistorialIndividual />
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
    </QueryClientProvider>
  )
}

export default App
