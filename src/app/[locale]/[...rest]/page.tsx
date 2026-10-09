import { notFound } from 'next/navigation';

// Sends unknown paths to the translated [locale]/not-found page instead of the bare default.
export default function CatchAllPage() {
  notFound();
}
