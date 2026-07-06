import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Outlet, useOutletContext } from 'react-router-dom';
import NavBar from './components/nav/NavBar';
import AdminPanel from './components/admin/AdminPanel';
import ChoresView from './components/chore/ChoresView';

type Me = {
  id: number;
  email: string;
  role: 'admin' | 'member';
  organizationId: number;
  organizationTimezone: string;
  timezone: string;
};

const ME_CACHE_KEY = 'me-cache-v1';

function useMe() {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/me')
      .then((res) => (res.ok ? (res.json() as Promise<Me>) : null))
      .then((fetched) => {
        if (fetched) localStorage.setItem(ME_CACHE_KEY, JSON.stringify(fetched));
        setMe(fetched);
      })
      .catch(() => {
        const cached = localStorage.getItem(ME_CACHE_KEY);
        setMe(cached ? (JSON.parse(cached) as Me) : null);
      })
      .finally(() => setLoading(false));
  }, []);

  return { me, loading };
}

type LayoutContext = {
  selectedRoom: string;
  onRoomsChange: (rooms: string[]) => void;
};

function Layout({ isAdmin }: { isAdmin: boolean }) {
  const [rooms, setRooms] = useState<string[]>([]);
  const [selectedRoom, setSelectedRoom] = useState('all');

  return (
    <div>
      <NavBar rooms={rooms} selectedRoom={selectedRoom} onSelect={setSelectedRoom} isAdmin={isAdmin} />
      <Outlet context={{ selectedRoom, onRoomsChange: setRooms } satisfies LayoutContext} />
    </div>
  );
}

function Home({ me }: { me: Me | null }) {
  const { selectedRoom, onRoomsChange } = useOutletContext<LayoutContext>();
  if (!me) return null;
  return (
    <div className="p-4">
      <ChoresView
        organizationTimezone={me.organizationTimezone}
        timezone={me.timezone}
        selectedRoom={selectedRoom}
        onRoomsChange={onRoomsChange}
      />
    </div>
  );
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
          <Route path="/" element={<Home me={me} />} />
          <Route path="/admin" element={<AdminRoute me={me} />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
