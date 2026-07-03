type MockChoreSpec = {
  name: string;
  room: string;
  daysAgo: number;
  duration: number;
  frequency: number;
  longTermTask?: boolean;
};

const MOCK_CHORES: MockChoreSpec[] = [
  { name: 'Wash dishes', room: 'Kitchen', daysAgo: 0, duration: 15, frequency: 1 },
  { name: 'Take out trash', room: 'Kitchen', daysAgo: 3, duration: 5, frequency: 2 },
  { name: 'Vacuum living room', room: 'Living Room', daysAgo: 2, duration: 20, frequency: 7 },
  { name: 'Clean bathroom', room: 'Bathroom', daysAgo: 10, duration: 30, frequency: 7 },
  { name: 'Change bed sheets', room: 'Bedroom', daysAgo: 5, duration: 15, frequency: 14 },
  { name: 'Mow the lawn', room: 'Yard', daysAgo: 20, duration: 60, frequency: 14 },
  { name: 'Organize garage', room: 'Garage', daysAgo: 40, duration: 90, frequency: 90, longTermTask: true },
  {
    name: 'Deep clean fridge',
    room: 'Kitchen',
    daysAgo: 60,
    duration: 45,
    frequency: 90,
    longTermTask: true,
  },
];

export type SeedMockChoresResult = { count: number };

export async function seedMockChores(
  db: D1Database,
  organizationId: number,
  now: Date = new Date(),
): Promise<SeedMockChoresResult> {
  const existing = await db
    .prepare('SELECT COUNT(*) as count FROM chores WHERE organization_id = ?')
    .bind(organizationId)
    .first<{ count: number }>();
  if (existing && existing.count > 0) {
    throw new Error(
      `Organization ${organizationId} already has ${existing.count} chore(s) — refusing to seed mock data on top of existing chores`,
    );
  }

  const statements = MOCK_CHORES.map((spec) => {
    const dateLastCompleted = new Date(now.getTime() - spec.daysAgo * 24 * 60 * 60 * 1000).toISOString();
    return db
      .prepare(
        `INSERT INTO chores
          (organization_id, name, room, date_last_completed, duration, frequency, long_term_task, version)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      )
      .bind(
        organizationId,
        spec.name,
        spec.room,
        dateLastCompleted,
        spec.duration,
        spec.frequency,
        spec.longTermTask ? 1 : 0,
      );
  });

  await db.batch(statements);
  return { count: statements.length };
}
