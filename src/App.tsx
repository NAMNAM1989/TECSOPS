import { useState } from "react";
import type { Shipment } from "./types/shipment";
import { AirCargoTracking } from "./components/AirCargoTracking";
import { PrintShippingLabel } from "./components/PrintShippingLabel";
import { SitePasswordGate } from "./components/SitePasswordGate";

export default function App() {
  const [printTarget, setPrintTarget] = useState<Shipment | null>(null);

  return (
    <SitePasswordGate>
      <div className="no-print min-h-screen">
        <AirCargoTracking onRequestPrint={setPrintTarget} />
      </div>
      {printTarget && (
        <PrintShippingLabel shipment={printTarget} onClose={() => setPrintTarget(null)} />
      )}
    </SitePasswordGate>
  );
}
