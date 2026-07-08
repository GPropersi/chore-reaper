import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Outlet, useOutletContext, useNavigate } from 'react-router-dom';
import type { Room } from '@customTypes/SharedTypes';
import NavBar from './components/nav/NavBar';
import AdminPanel from './components/admin/AdminPanel';
import ChoresView from './components/chore/ChoresView';
import { apiFetch, setCurrentHouseholdId } from './utils/api';

type Membership = {
  householdId: number;
  householdName: string;
  householdTimezone: string;
};

type Me = {
  id: number;
  email: string;
  timezone: string;
  isAdmin: boolean;
  memberships: Membership[];
  currentHouseholdId: number;
};

type ApiResponse<T> = { success: boolean; data?: T; error?: string };

const ROOMS_CACHE_KEY = 'rooms-cache-v1';

function useRooms() {
  const [rooms, setRooms] = useState<Room[]>([]);

  useEffect(() => {
    apiFetch('/api/rooms')
      .then((res) => res.json() as Promise<ApiResponse<Room[]>>)
      .then((body) => {
        const fetched = body.data ?? [];
        localStorage.setItem(ROOMS_CACHE_KEY, JSON.stringify(fetched));
        setRooms(fetched);
      })
      .catch(() => {
        // Mirrors useMe's cache fallback below — without this, a single
        // transient failure on first load left room tabs permanently empty
        // for that page life (only chores/me had a fallback, so refresh was
        // the only recovery).
        const cached = localStorage.getItem(ROOMS_CACHE_KEY);
        if (cached) setRooms(JSON.parse(cached) as Room[]);
      });
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
          // Keep apiFetch's outgoing X-Household-Id in sync with whatever the
          // backend actually resolved — matters on first-ever login, where no
          // household was pre-selected and the backend picked the
          // single-household fallback itself.
          setCurrentHouseholdId(fetched.currentHouseholdId);
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
    // Runs once on mount only — household switches are driven by
    // switchHousehold below, not by re-running this effect.
  }, []);

  function updateHouseholdTimezone(householdTimezone: string) {
    setMe((prev) => {
      if (!prev) return prev;
      const updated = {
        ...prev,
        memberships: prev.memberships.map((m) =>
          m.householdId === prev.currentHouseholdId ? { ...m, householdTimezone } : m,
        ),
      };
      localStorage.setItem(ME_CACHE_KEY, JSON.stringify(updated));
      return updated;
    });
  }

  function switchHousehold(householdId: number) {
    setCurrentHouseholdId(householdId);
    setLoading(true);
    load().finally(() => setLoading(false));
  }

  return { me, loading, updateHouseholdTimezone, switchHousehold };
}

type LayoutContext = {
  selectedRoom: string;
  rooms: Room[];
  onRoomsChange: (rooms: Room[]) => void;
};

type LayoutProps = {
  isAdmin: boolean;
  memberships: Membership[];
  currentHouseholdId: number | undefined;
  onSwitchHousehold: (householdId: number) => void;
};

function Layout({ isAdmin, memberships, currentHouseholdId, onSwitchHousehold }: LayoutProps) {
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
        currentHouseholdId={currentHouseholdId}
        onSwitchHousehold={onSwitchHousehold}
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
        householdTimezone={currentMembership.householdTimezone}
        selectedRoom={selectedRoom}
        rooms={rooms}
      />
    </div>
  );
}

function AdminRoute({
  me,
  currentMembership,
  onHouseholdTimezoneChange,
}: {
  me: Me | null;
  currentMembership: Membership | undefined;
  onHouseholdTimezoneChange: (timezone: string) => void;
}) {
  const { rooms, onRoomsChange } = useOutletContext<LayoutContext>();
  if (!me || !currentMembership) return null;
  return (
    <AdminPanel
      rooms={rooms}
      onRoomsChange={onRoomsChange}
      householdId={currentMembership.householdId}
      householdTimezone={currentMembership.householdTimezone}
      onHouseholdTimezoneChange={onHouseholdTimezoneChange}
      isAdmin={me.isAdmin}
    />
  );
}

function App() {
  const { me, loading, updateHouseholdTimezone, switchHousehold } = useMe();
  const currentMembership = me?.memberships.find((m) => m.householdId === me.currentHouseholdId);

  if (loading) return null;

  return (
    <BrowserRouter>
      <Routes>
        <Route
          element={
            <Layout
              // Remounts Layout (and everything nested under it) on a
              // household switch, so each child's mount-time fetch naturally
              // reloads household-scoped data instead of needing bespoke
              // invalidation.
              key={me?.currentHouseholdId}
              isAdmin={me?.isAdmin ?? false}
              memberships={me?.memberships ?? []}
              currentHouseholdId={me?.currentHouseholdId}
              onSwitchHousehold={switchHousehold}
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
                onHouseholdTimezoneChange={updateHouseholdTimezone}
              />
            }
          />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
