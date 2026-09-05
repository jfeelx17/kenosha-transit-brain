import Head from 'next/head';
import dynamic from 'next/dynamic';

// MapLibre needs window/WebGL, so the map is client-only.
const MapView = dynamic(() => import('../components/MapView'), {
  ssr: false,
  loading: () => <div className="boot">Loading Kenosha Loop…</div>,
});

export default function Home() {
  return (
    <>
      <Head>
        <title>Kenosha Loop</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="description" content="Live Kenosha Transit bus map with next-bus predictions and a crowd meter." />
      </Head>
      <MapView />
    </>
  );
}
