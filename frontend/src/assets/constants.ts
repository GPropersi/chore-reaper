export const statusColors: { threshold: number; color: string }[] = [
  { threshold: 0.5, color: 'bg-green-500' },
  { threshold: 0.2, color: 'bg-yellow-500' },
  { threshold: 0, color: 'bg-orange-500' },
  { threshold: -Infinity, color: 'bg-red-500' },
];
