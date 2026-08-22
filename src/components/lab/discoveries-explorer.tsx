import type { PersonalLabSnapshot } from "@/services/personal-lab";

import { CorrelationMatrix } from "./correlation-matrix";

export function DiscoveriesExplorer({ data }: { data: PersonalLabSnapshot }) {
  return <div className="discoveries-page" id="main-page-content">
    <header className="discoveries-hero"><h1>Analyses</h1></header>
    <CorrelationMatrix matrix={data.matrix} />
  </div>;
}
