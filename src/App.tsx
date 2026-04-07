import { useState } from "react";
import type { Shipment } from "./types/shipment";
import { AirCargoTracking } from "./components/AirCargoTracking";
import { PrintShippingLabel } from "./components/PrintShippingLabel";

export default function App() {
  const [printTarget, setPrintTarget] = useState<Shipment | null>(null);

  return (
    <>
      <div className="no-print min-h-screen">
        <AirCargoTracking onRequestPrint={setPrintTarget} />
      </div>
      {printTarget && (
        <PrintShippingLabel shipment={printTarget} onClose={() => setPrintTarget(null)} />
      )}
    </>
  );
}
