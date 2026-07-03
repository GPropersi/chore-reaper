import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import NavBar from './NavBar';

function renderNavBar(isAdmin: boolean) {
  return render(
    <MemoryRouter>
      <NavBar rooms={[]} selectedRoom="all" onSelect={() => {}} isAdmin={isAdmin} />
    </MemoryRouter>,
  );
}

describe('NavBar', () => {
  it('renders an Admin entry when the current user is an admin', () => {
    renderNavBar(true);
    expect(screen.getByTestId('admin-nav-link')).toBeInTheDocument();
  });

  it('omits the Admin entry when the current user is not an admin', () => {
    renderNavBar(false);
    expect(screen.queryByTestId('admin-nav-link')).not.toBeInTheDocument();
  });
});
