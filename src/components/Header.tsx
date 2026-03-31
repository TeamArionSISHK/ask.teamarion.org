export function Header() {
  return (
    <header className="sticky top-0 z-20 border-b border-white/10 bg-[rgba(8,12,27,0.78)] backdrop-blur-xl">
      <div className="mx-auto flex max-w-5xl items-center px-6 py-4">
        <div className="flex items-center">
          <picture>
            <source
              media="(prefers-color-scheme: light)"
              srcSet="/images/ask-arion-wordmark-purple.png"
            />
            <img
              src="/images/ask-arion-wordmark-white.png"
              alt="Ask Arion"
              className="h-8 w-auto"
            />
          </picture>
        </div>
      </div>
    </header>
  );
}
