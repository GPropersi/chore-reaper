// Declarations only — no runtime values. Every consumer imports these with
// `import type`, so nothing is emitted at runtime. If a runtime export (enum,
// const, function) is ever needed, rename this back to SharedTypes.ts.
export interface Chore {
  id: number;
  name: string;
  details?: string | null;
  roomId: number;
  dateLastCompleted: Date;
  duration: number;
  frequency: number;
  urgency?: 'low' | 'medium' | 'high';
  longTermTask?: boolean;
}

export type SwipeStyle = 'ios' | 'android';

export interface Room {
  id: number;
  householdId: number;
  name: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  warning?: string;
}

export interface AdminUserHousehold {
  id: number;
  name: string;
}

export interface AdminUser {
  id: number;
  email: string;
  timezone: string | null;
  isAdmin: boolean;
  households: AdminUserHousehold[];
}

export interface HouseholdListItem {
  id: number;
  name: string;
}

export interface Household {
  id: number;
  name: string;
  timezone: string;
}

export interface JoinRequest {
  id: number;
  householdId: number;
  householdName: string;
  requestedEmail: string;
  requestedByEmail: string;
  status: 'pending' | 'approved' | 'denied';
  createdAt: string;
}
