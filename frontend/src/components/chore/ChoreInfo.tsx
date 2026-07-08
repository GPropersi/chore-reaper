type ChoreInfoProps = {
  name: string;
};

export default function ChoreInfo({ name }: ChoreInfoProps) {
  return <div className="font-medium text-white line-clamp-2 min-w-0 text-left leading-tight">{name}</div>;
}
