import { NavLink } from 'react-router-dom';
import type { Room } from '@customTypes/SharedTypes';
import RoomTab from './RoomTab';

type Membership = {
  organizationId: number;
  organizationName: string;
};

type NavBarProps = {
  rooms: Room[];
  selectedRoom: string;
  onSelect: (room: string) => void;
  isAdmin?: boolean;
  memberships?: Membership[];
  currentOrganizationId?: number;
  onSwitchOrg?: (organizationId: number) => void;
};

export default function NavBar({
  rooms,
  selectedRoom,
  onSelect,
  isAdmin = false,
  memberships = [],
  currentOrganizationId,
  onSwitchOrg,
}: NavBarProps) {
  return (
    <div id="NavBar" className="border-b border-gray-700 flex-shrink-0">
      <div className="container mx-auto flex items-center justify-between space-x-1 overflow-x-auto scrollbar-none">
        <div className="flex items-center space-x-1">
          {/* Only rendered for the (still uncommon) case of belonging to more
              than one org — no UI change at all for the common single-org
              case. */}
          {memberships.length > 1 && onSwitchOrg && (
            <select
              aria-label="Organization"
              value={currentOrganizationId}
              onChange={(e) => onSwitchOrg(Number(e.target.value))}
              className="bg-gray-800 text-gray-200 text-sm rounded px-2 py-1 mr-2"
            >
              {memberships.map((m) => (
                <option key={m.organizationId} value={m.organizationId}>
                  {m.organizationName}
                </option>
              ))}
            </select>
          )}
          <RoomTab label="All" value="all" isActive={selectedRoom === 'all'} onClick={onSelect} />
          {rooms.map((room) => (
            <RoomTab
              key={room.id}
              label={room.name}
              value={String(room.id)}
              isActive={selectedRoom === String(room.id)}
              onClick={onSelect}
            />
          ))}
        </div>
        {isAdmin && (
          <NavLink
            to="/admin"
            data-testid="admin-nav-link"
            className={({ isActive }) =>
              `px-4 sm:px-6 min-h-[44px] py-3 text-sm sm:text-base font-medium flex items-center ${
                isActive
                  ? 'border-b-2 border-indigo-500 text-indigo-400'
                  : 'text-gray-400 hover:text-gray-200'
              }`
            }
          >
            Admin
          </NavLink>
        )}
      </div>
    </div>
  );
}
