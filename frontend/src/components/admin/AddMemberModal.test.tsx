import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AddMemberModal from './AddMemberModal';

afterEach(() => {
  cleanup();
});

describe('AddMemberModal', () => {
  it('renders the error message when present', () => {
    render(<AddMemberModal onSubmit={vi.fn()} onCancel={vi.fn()} error="Something went wrong" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong');
  });

  it('does not show the request-join button when canRequestJoin is false', () => {
    render(<AddMemberModal onSubmit={vi.fn()} onCancel={vi.fn()} error="403 error" canRequestJoin={false} />);
    expect(screen.queryByRole('button', { name: 'Ask an admin to add this person' })).not.toBeInTheDocument();
  });

  it('shows the request-join button when canRequestJoin is true, and calls onRequestJoin with the current email', async () => {
    const user = userEvent.setup();
    const onRequestJoin = vi.fn();
    render(
      <AddMemberModal
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        error="doesn't have an account yet"
        canRequestJoin={true}
        onRequestJoin={onRequestJoin}
      />,
    );

    await user.type(screen.getByLabelText('Email'), 'new@example.com');
    await user.click(screen.getByRole('button', { name: 'Ask an admin to add this person' }));

    expect(onRequestJoin).toHaveBeenCalledWith('new@example.com');
  });

  it('shows a confirmation instead of the request button once requestSubmitted is true', () => {
    render(
      <AddMemberModal onSubmit={vi.fn()} onCancel={vi.fn()} canRequestJoin={true} requestSubmitted={true} />,
    );

    expect(screen.getByText('Request sent — an admin will review it.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ask an admin to add this person' })).not.toBeInTheDocument();
  });
});
