import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<div>Gestión de KPI - Aplicación en construcción</div>} />
      </Routes>
    </Router>
  )
}

export default App

