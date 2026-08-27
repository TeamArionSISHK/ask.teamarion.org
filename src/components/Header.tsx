export function Header() {
  return (
    <header className="app-header">
      <div className="app-header__inner">
        <picture>
          <source
            media="(prefers-color-scheme: light)"
            srcSet="/images/ask-arion-wordmark-purple.png"
          />
          <img
            src="/images/ask-arion-wordmark-white.png"
            alt="Ask Arion"
            width="3342"
            height="602"
            className="app-header__logo"
          />
        </picture>
      </div>
    </header>
  );
}
