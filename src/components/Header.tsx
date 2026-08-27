export function Header() {
  return (
    <header className="app-header">
      <div className="app-header__inner">
        <picture>
          <source
            media="(prefers-color-scheme: light)"
            srcSet="/images/ask-arion-wordmark-purple-ui.png 1x, /images/ask-arion-wordmark-purple-ui-2x.png 2x"
          />
          <img
            src="/images/ask-arion-wordmark-white-ui.png"
            srcSet="/images/ask-arion-wordmark-white-ui.png 1x, /images/ask-arion-wordmark-white-ui-2x.png 2x"
            alt="Ask Arion"
            width="172"
            height="31"
            className="app-header__logo"
          />
        </picture>
      </div>
    </header>
  );
}
