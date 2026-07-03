import { Link } from 'react-router-dom';
import RoomTab from './RoomTab';

type NavBarProps = {
  rooms: string[];
  selectedRoom: string;
  onSelect: (room: string) => void;
  isAdmin?: boolean;
};

export default function NavBar({ rooms, selectedRoom, onSelect, isAdmin = false }: NavBarProps) {
  return (
    <div id="NavBar" className="border-b border-gray-700 flex-shrink-0">
      <div className="container mx-auto flex items-center justify-between space-x-1 overflow-x-auto scrollbar-none">
        <div className="flex space-x-1">
          <RoomTab label="All" value="all" isActive={selectedRoom === 'all'} onClick={onSelect} />
          {rooms.map((room) => (
            <RoomTab
              key={room}
              label={room}
              value={room}
              isActive={selectedRoom === room}
              onClick={onSelect}
            />
          ))}
        </div>
        {isAdmin && (
          <Link
            to="/admin"
            data-testid="admin-nav-link"
            className="px-4 sm:px-6 min-h-[44px] py-3 text-sm sm:text-base font-medium flex items-center text-gray-400 hover:text-gray-200"
          >
            Admin
          </Link>
        )}
      </div>
    </div>
  );
}
