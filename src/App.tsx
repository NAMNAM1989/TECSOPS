import { lazy, Suspense, useCallback, useMemo, useState } from "react";
import type { Shipment } from "./types/shipment";
import type { CustomerDirectoryEntry } from "./types/customerDirectory";
import { loadRows } from "./utils/shipmentStorage";
import { useShipmentSync } from "./hooks/useShipmentSync";
import { useHashRoute } from "./hooks/useHashRoute";
import type { AirlineLabelOverrides } from "./utils/airlineLabelOverridesCore";

const loadCustomersPage = () =>
  import("./pages/CustomersPage").then((m) => ({ default: m.CustomersPage }));

const AirCargoTracking = lazy(() =>
  import("./components/AirCargoTracking").then((m) => ({ default: m.AirCargoTracking }))
);
const CustomersPage = lazy(loadCustomersPage);
const PrintShippingLabel = lazy(() =>
  import("./components/PrintShippingLabel").then((m) => ({ default: m.PrintShippingLabel }))
);

type PrintJob = { shipment: Shipment; airlineLabelOverrides?: AirlineLabelOverrides | null };

const EMPTY_CUSTOMERS: CustomerDirectoryEntry[] = [];

function PageLoading() {
  return (
    <div className="mx-auto max-w-[1600px] px-4 py-16 text-center text-apple-secondary">
      <p className="font-semibold text-apple-label">Đang tải…</p>
    </div>
  );
}

export default function App() {
  const fallback = useMemo(() => ({ rows: loadRows() ?? [] }), []);
  const sync = useShipmentSync(fallback);
  const { route, navigate } = useHashRoute();
  const [printJob, setPrintJob] = useState<PrintJob | null>(null);

  const prefetchCustomers = useCallback(() => {
    void loadCustomersPage();
  }, []);

  return (
    <>
      <div className="no-print min-h-screen">
        <Suspense fallback={<PageLoading />}>
          {route === "customers" ? (
            <CustomersPage
              initial={sync.state?.customers ?? EMPTY_CUSTOMERS}
              ready={sync.state != null && sync.status !== "loading"}
              syncStatus={sync.status}
              socketConnected={sync.socketConnected}
              onSave={async (customers) => {
                await sync.mutate({ action: "SET_CUSTOMERS", customers });
              }}
              onBack={() => navigate("ops")}
            />
          ) : (
            <AirCargoTracking
              sync={sync}
              onNavigateCustomers={() => navigate("customers")}
              onPrefetchCustomers={prefetchCustomers}
              onRequestPrint={(shipment, airlineLabelOverrides) =>
                setPrintJob({ shipment, airlineLabelOverrides })
              }
            />
          )}
        </Suspense>
      </div>
      {printJob ? (
        <Suspense fallback={null}>
          <PrintShippingLabel
            shipment={printJob.shipment}
            airlineLabelOverrides={printJob.airlineLabelOverrides}
            onClose={() => setPrintJob(null)}
          />
        </Suspense>
      ) : null}
    </>
  );
}
