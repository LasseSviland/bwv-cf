import { Link } from "react-router-dom";

export const NotFoundPage = () => (
  <section className="not-found">
    <p className="eyebrow">404</p>
    <h1>This page isn’t in the cellar.</h1>
    <p>The link may be old, or the wine or monopoly may no longer exist.</p>
    <Link className="button button--primary" to="/">
      Return to overview
    </Link>
  </section>
);
