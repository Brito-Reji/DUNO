import { Routes, Route } from 'react-router-dom'
import Home from './components/Home'
import Room from './components/Room'


function App() {
  return (
    <div className="app-container">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/room/:roomId" element={<Room />} />

      </Routes>
    </div>
  )
}

export default App
