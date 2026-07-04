import { describe, it, expect, afterEach } from 'vitest';
import { writeChoresCache, readChoresCache, clearChoresCache } from './choresCache';

const sampleChores = [
  {
    id: 1,
    name: 'Vacuum',
    room: 'Living Room',
    dateLastCompleted: '2026-06-01T00:00:00.000Z',
    duration: 20,
    frequency: 7,
    version: 1,
  },
];

afterEach(async () => {
  await clearChoresCache();
});

describe('choresCache', () => {
  it('returns the previously-written chores on a later read (simulated reload)', async () => {
    await writeChoresCache(sampleChores);

    const result = await readChoresCache();

    expect(result).toEqual(sampleChores);
  });

  it('returns undefined when nothing has been written yet', async () => {
    const result = await readChoresCache();

    expect(result).toBeUndefined();
  });

  it('overwrites the previous entry on a subsequent write', async () => {
    await writeChoresCache(sampleChores);
    const updated = [
      ...sampleChores,
      {
        id: 2,
        name: 'Dishes',
        room: 'Kitchen',
        dateLastCompleted: '2026-06-20T00:00:00.000Z',
        duration: 5,
        frequency: 1,
        version: 1,
      },
    ];
    await writeChoresCache(updated);

    const result = await readChoresCache();

    expect(result).toEqual(updated);
  });
});
