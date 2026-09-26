import { Link } from "react-router-dom";

import { EmptyState } from "../components/AsyncState";
import { useDocumentTitle } from "../hooks/useDocumentTitle";

export default function NotFoundPage() {
  useDocumentTitle("Not found");
  return (
    <section className="page">
      <h1>Page not found</h1>
      <EmptyState message="There's nothing at this address.">
        <p>
          <Link to="/">Go to the overview</Link>
        </p>
      </EmptyState>
    </section>
  );
}
