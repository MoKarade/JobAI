// app/loading.tsx — ce qu'on voit pendant qu'une page se charge.

export default function Chargement() {
  return (
    <main className="etat" role="status" aria-live="polite">
      <p>Chargement…</p>
    </main>
  );
}
