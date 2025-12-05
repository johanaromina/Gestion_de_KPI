import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Colaboradores from './pages/Colaboradores'
import Periodos from './pages/Periodos'
import KPIs from './pages/KPIs'
import Asignaciones from './pages/Asignaciones'
import ArbolObjetivos from './pages/ArbolObjetivos'
import MiParrilla from './pages/MiParrilla'
import HistorialIndividual from './pages/HistorialIndividual'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <Layout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/colaboradores" element={<Colaboradores />} />
            <Route path="/periodos" element={<Periodos />} />
            <Route path="/kpis" element={<KPIs />} />
            <Route path="/asignaciones" element={<Asignaciones />} />
            <Route path="/arbol-objetivos" element={<ArbolObjetivos />} />
            <Route path="/mi-parrilla" element={<MiParrilla />} />
            <Route path="/mi-parrilla/:collaboratorId/:periodId" element={<MiParrilla />} />
            <Route path="/historial/:collaboratorId?" element={<HistorialIndividual />} />
          </Routes>
        </Layout>
      </Router>
    </QueryClientProvider>
  )
}

export default App

