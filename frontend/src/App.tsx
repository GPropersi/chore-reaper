import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Outlet } from 'react-router-dom';
import NavBar from './components/nav/NavBar';
import AdminPanel from './components/admin/AdminPanel';

type Me = {
  id: number;
  email: string;
  role: 'admin' | 'member';
  organizationId: number;
  organizationTimezone: string;
  timezone: string;
};

function useMe() {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/me')
      .then((res) => (res.ok ? (res.json() as Promise<Me>) : null))
      .then(setMe)
      .finally(() => setLoading(false));
  }, []);

  return { me, loading };
}

function Layout({ isAdmin }: { isAdmin: boolean }) {
  return (
    <div>
      <NavBar rooms={[]} selectedRoom="all" onSelect={() => {}} isAdmin={isAdmin} />
      <Outlet />
    </div>
  );
}

function Home() {
  return <div className="p-4 text-gray-400">Chores coming soon.</div>;
}

function AdminRoute({ me }: { me: Me | null }) {
  if (!me) return null;
  if (me.role !== 'admin') {
    return <div className="p-4 text-gray-400">Access denied.</div>;
  }
  return <AdminPanel />;
}

function App() {
  const { me, loading } = useMe();

  if (loading) return null;

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout isAdmin={me?.role === 'admin'} />}>
          <Route path="/" element={<Home />} />
          <Route path="/admin" element={<AdminRoute me={me} />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
