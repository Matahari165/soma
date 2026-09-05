export default function Loading() {
  return (
    <div id="main-page-content" role="status" aria-label="Chargement des repas">
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "24px 20px" }}>
        <div><h1>Repas</h1></div>
        <span className="system-loading__status" aria-hidden="true"><i /><i /><i /></span>
      </header>
    </div>
  );
}
