import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Outlet, useOutletContext, useNavigate } from 'react-router-dom';
import type { Room } from '@customTypes/SharedTypes';
import NavBar from './components/nav/NavBar';
import AdminPanel from './components/admin/AdminPanel';
import ChoresView from './components/chore/ChoresView';
import { apiFetch, setCurrentOrgId } from './utils/api';

type Membership = {
  organizationId: number;
  organizationName: string;
  organizationTimezone: string;
  role: 'admin' | 'member';
};

type Me = {
  id: number;
  email: string;
  timezone: string;
  memberships: Membership[];
  currentOrganizationId: number;
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

  function load(): Promise<Me | null> {
    return apiFetch('/api/me')
      .then((res) => (res.ok ? (res.json() as Promise<Me>) : null))
      .then((fetched) => {
        if (fetched) {
          localStorage.setItem(ME_CACHE_KEY, JSON.stringify(fetched));
          // Keep apiFetch's outgoing X-Org-Id in sync with whatever the
          // backend actually resolved — matters on first-ever login, where
          // no org was pre-selected and the backend picked the single-org
          // fallback itself.
          setCurrentOrgId(fetched.currentOrganizationId);
        }
        setMe(fetched);
        return fetched;
      })
      .catch(() => {
        const cached = localStorage.getItem(ME_CACHE_KEY);
        const fallback = cached ? (JSON.parse(cached) as Me) : null;
        setMe(fallback);
        return fallback;
      });
  }

  useEffect(() => {
    load().finally(() => setLoading(false));
    // Runs once on mount only — org switches are driven by switchOrg below,
    // not by re-running this effect.
  }, []);

  function updateOrgTimezone(organizationTimezone: string) {
    setMe((prev) => {
      if (!prev) return prev;
      const updated = {
        ...prev,
        memberships: prev.memberships.map((m) =>
          m.organizationId === prev.currentOrganizationId ? { ...m, organizationTimezone } : m,
        ),
      };
      localStorage.setItem(ME_CACHE_KEY, JSON.stringify(updated));
      return updated;
    });
  }

  function switchOrg(organizationId: number) {
    setCurrentOrgId(organizationId);
    setLoading(true);
    load().finally(() => setLoading(false));
  }

  return { me, loading, updateOrgTimezone, switchOrg };
}

type LayoutContext = {
  selectedRoom: string;
  rooms: Room[];
  onRoomsChange: (rooms: Room[]) => void;
};

type LayoutProps = {
  isAdmin: boolean;
  memberships: Membership[];
  currentOrganizationId: number | undefined;
  onSwitchOrg: (organizationId: number) => void;
};

function Layout({ isAdmin, memberships, currentOrganizationId, onSwitchOrg }: LayoutProps) {
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
      <NavBar
        rooms={rooms}
        selectedRoom={selectedRoom}
        onSelect={handleSelectRoom}
        isAdmin={isAdmin}
        memberships={memberships}
        currentOrganizationId={currentOrganizationId}
        onSwitchOrg={onSwitchOrg}
      />
      <Outlet context={{ selectedRoom, rooms, onRoomsChange: setRooms } satisfies LayoutContext} />
    </div>
  );
}

function Home({ me, currentMembership }: { me: Me | null; currentMembership: Membership | undefined }) {
  const { selectedRoom, rooms } = useOutletContext<LayoutContext>();
  if (!me || !currentMembership) return null;
  return (
    <div className="p-4">
      <ChoresView
        organizationTimezone={currentMembership.organizationTimezone}
        timezone={me.timezone}
        selectedRoom={selectedRoom}
        rooms={rooms}
      />
    </div>
  );
}

function AdminRoute({
  me,
  currentMembership,
  onOrgTimezoneChange,
}: {
  me: Me | null;
  currentMembership: Membership | undefined;
  onOrgTimezoneChange: (timezone: string) => void;
}) {
  const { rooms, onRoomsChange } = useOutletContext<LayoutContext>();
  if (!me || !currentMembership) return null;
  if (currentMembership.role !== 'admin') {
    return <div className="p-4 text-gray-400">Access denied.</div>;
  }
  return (
    <AdminPanel
      rooms={rooms}
      onRoomsChange={onRoomsChange}
      organizationId={currentMembership.organizationId}
      organizationTimezone={currentMembership.organizationTimezone}
      onOrgTimezoneChange={onOrgTimezoneChange}
    />
  );
}

function App() {
  const { me, loading, updateOrgTimezone, switchOrg } = useMe();
  const currentMembership = me?.memberships.find((m) => m.organizationId === me.currentOrganizationId);

  if (loading) return null;

  return (
    <BrowserRouter>
      <Routes>
        <Route
          element={
            <Layout
              // Remounts Layout (and everything nested under it) on an org
              // switch, so each child's mount-time fetch naturally reloads
              // org-scoped data instead of needing bespoke invalidation.
              key={me?.currentOrganizationId}
              isAdmin={currentMembership?.role === 'admin'}
              memberships={me?.memberships ?? []}
              currentOrganizationId={me?.currentOrganizationId}
              onSwitchOrg={switchOrg}
            />
          }
        >
          <Route path="/" element={<Home me={me} currentMembership={currentMembership} />} />
          <Route
            path="/admin"
            element={
              <AdminRoute
                me={me}
                currentMembership={currentMembership}
                onOrgTimezoneChange={updateOrgTimezone}
              />
            }
          />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
