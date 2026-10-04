import { useEffect } from 'react';
import { Link } from 'react-router-dom';

export function NotFoundPage() {
  useEffect(() => {
    document.title = 'Page not found · Grain Desk';
  }, []);

  return (
    <section className="animate-fade-up border-b border-rule pb-6">
      <h1 className="text-2xl font-bold sm:text-3xl">Page not found</h1>
      <p className="mt-2 text-base text-ink">
        That page doesn’t exist.{' '}
        <Link to="/" className="font-medium text-gold-deep underline underline-offset-4 hover:text-navy">
          Go to the Overview
        </Link>
        .
      </p>
    </section>
  );
}
