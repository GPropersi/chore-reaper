import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Outlet, useOutletContext, useNavigate } from 'react-router-dom';
import type { Room } from '@customTypes/SharedTypes';
import NavBar from './components/nav/NavBar';
import AdminPanel from './components/admin/AdminPanel';
import ChoresView from './components/chore/ChoresView';
import { apiFetch } from './utils/api';

type Me = {
  id: number;
  email: string;
  role: 'admin' | 'member';
  organizationId: number;
  organizationTimezone: string;
  timezone: string;
};

type ApiResponse<T> = { success: boolean; data?: T; error?: string };

function useRooms() {
  const [rooms, setRooms] = useState<Room[]>([]);

  useEffect(() => {
    apiFetch('/api/rooms')
      .then((res) => res.json() as Promise<ApiResponse<Room[]>>)
      .then((body) => setRooms(body.data ?? []))
      .catch(() => {});
  }, []);

  return { rooms, setRooms };
}

const ME_CACHE_KEY = 'me-cache-v1';

function useMe() {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/api/me')
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

  function updateOrgTimezone(organizationTimezone: string) {
    setMe((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, organizationTimezone };
      localStorage.setItem(ME_CACHE_KEY, JSON.stringify(updated));
      return updated;
    });
  }

  return { me, loading, updateOrgTimezone };
}

type LayoutContext = {
  selectedRoom: string;
  rooms: Room[];
  onRoomsChange: (rooms: Room[]) => void;
};

function Layout({ isAdmin }: { isAdmin: boolean }) {
  const { rooms, setRooms } = useRooms();
  const [selectedRoom, setSelectedRoom] = useState('all');
  const navigate = useNavigate();

  // Room tabs are also the only way back to Home from any other page (e.g.
  // Admin) — there's no separate home/logo link, so selecting a room must
  // navigate, not just update the filter state.
  function handleSelectRoom(room: string) {
    setSelectedRoom(room);
    navigate('/');
  }

  return (
    <div>
      <NavBar rooms={rooms} selectedRoom={selectedRoom} onSelect={handleSelectRoom} isAdmin={isAdmin} />
      <Outlet context={{ selectedRoom, rooms, onRoomsChange: setRooms } satisfies LayoutContext} />
    </div>
  );
}

function Home({ me }: { me: Me | null }) {
  const { selectedRoom, rooms } = useOutletContext<LayoutContext>();
  if (!me) return null;
  return (
    <div className="p-4">
      <ChoresView
        organizationTimezone={me.organizationTimezone}
        timezone={me.timezone}
        selectedRoom={selectedRoom}
        rooms={rooms}
      />
    </div>
  );
}

function AdminRoute({
  me,
  onOrgTimezoneChange,
}: {
  me: Me | null;
  onOrgTimezoneChange: (timezone: string) => void;
}) {
  const { rooms, onRoomsChange } = useOutletContext<LayoutContext>();
  if (!me) return null;
  if (me.role !== 'admin') {
    return <div className="p-4 text-gray-400">Access denied.</div>;
  }
  return (
    <AdminPanel
      rooms={rooms}
      onRoomsChange={onRoomsChange}
      organizationId={me.organizationId}
      organizationTimezone={me.organizationTimezone}
      onOrgTimezoneChange={onOrgTimezoneChange}
    />
  );
}

function App() {
  const { me, loading, updateOrgTimezone } = useMe();

  if (loading) return null;

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout isAdmin={me?.role === 'admin'} />}>
          <Route path="/" element={<Home me={me} />} />
          <Route path="/admin" element={<AdminRoute me={me} onOrgTimezoneChange={updateOrgTimezone} />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
