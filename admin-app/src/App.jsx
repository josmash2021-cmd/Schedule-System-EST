import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import Login from './pages/Login.jsx';
import Layout from './components/Layout.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Workers from './pages/Workers.jsx';
import Appointments from './pages/Appointments.jsx';
import Settings from './pages/Settings.jsx';
import Tasks from './pages/Tasks.jsx';
import Team from './pages/Team.jsx';
import Repairs from './pages/Repairs.jsx';
import WorkerApp from './pages/WorkerApp.jsx';

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="app-loading"><span className="spinner spinner-lg" /></div>;
  }

  if (!user) return <Login />;

  // Contraseña temporal: forzar el cambio antes de cualquier otra cosa.
  if (user.must_change_password) return <Settings forced />;

  // Los trabajadores tienen su propia app móvil (reloj + tareas).
  if (user.role !== 'admin') return <WorkerApp />;

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/trabajadores" element={<Workers />} />
        <Route path="/tareas" element={<Tasks />} />
        <Route path="/equipo" element={<Team />} />
        <Route path="/reparaciones" element={<Repairs />} />
        <Route path="/citas" element={<Appointments />} />
        <Route path="/ajustes" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
