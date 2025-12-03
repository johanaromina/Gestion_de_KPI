import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Colaboradores from './pages/Colaboradores'
import Periodos from './pages/Periodos'
import KPIs from './pages/KPIs'
import Asignaciones from './pages/Asignaciones'
import ArbolObjetivos from './pages/ArbolObjetivos'

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
          </Routes>
        </Layout>
      </Router>
    </QueryClientProvider>
  )
}

export default App

