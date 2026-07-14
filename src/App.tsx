import { useState } from "react";
import type { Shipment } from "./types/shipment";
import { AirCargoTracking } from "./components/AirCargoTracking";
import { PrintShippingLabel } from "./components/PrintShippingLabel";
import type { AirlineLabelOverrides } from "./utils/airlineLabelOverridesCore";

type PrintJob = { shipment: Shipment; airlineLabelOverrides?: AirlineLabelOverrides | null };

export default function App() {
  const [printJob, setPrintJob] = useState<PrintJob | null>(null);

  return (
    <>
      <div className="no-print min-h-screen">
        <AirCargoTracking
          onRequestPrint={(shipment, airlineLabelOverrides) =>
            setPrintJob({ shipment, airlineLabelOverrides })
          }
        />
      </div>
      {printJob && (
        <PrintShippingLabel
          shipment={printJob.shipment}
          airlineLabelOverrides={printJob.airlineLabelOverrides}
          onClose={() => setPrintJob(null)}
        />
      )}
    </>
  );
}
