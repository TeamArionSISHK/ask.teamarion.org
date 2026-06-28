import ClassicAskApp from './ClassicAskApp';

const DEFAULT_NEW_UI_URL = 'https://teamarion.org/ask';
const FORWARDED_PARAMS = new Set(['event', 'prompt', 'lang']);

function isClassicMode() {
  if (typeof window === 'undefined') {
    return true;
  }

  return new URLSearchParams(window.location.search).get('ui')?.toLowerCase() === 'classic';
}

function buildRedirectTarget() {
  const target = new URL(import.meta.env.VITE_ASK_ARION_NEW_UI_URL ?? DEFAULT_NEW_UI_URL);
  const currentParams = new URLSearchParams(window.location.search);

  currentParams.forEach((value, key) => {
    if (FORWARDED_PARAMS.has(key) && value.trim()) {
      target.searchParams.set(key, value);
    }
  });

  return target.toString();
}

export default function App() {
  if (isClassicMode()) {
    return <ClassicAskApp />;
  }

  if (typeof window !== 'undefined') {
    window.location.replace(buildRedirectTarget());
  }

  return (
    <main className="app-shell" aria-live="polite">
      <p>Opening Ask Arion...</p>
    </main>
  );
}