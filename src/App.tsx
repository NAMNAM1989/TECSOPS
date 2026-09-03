import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import type { Shipment } from "./types/shipment";
import type { CustomerDirectoryEntry } from "./types/customerDirectory";
import { useShipmentSync } from "./hooks/useShipmentSync";
import { useHashRoute } from "./hooks/useHashRoute";
import type { AirlineLabelOverrides } from "./utils/airlineLabelOverridesCore";
import { BottomNav, OpsLeftRail, PageSkeleton } from "./ui";
import type { MobileCargoCopyApi } from "./ui/BottomNav";
import { AppAuthGate } from "./components/AppAuthGate";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { formatLocalSessionDate } from "./utils/sessionDate";
import { useIsMobile } from "./hooks/useIsMobile";

const loadCustomersPage = () =>
  import("./pages/CustomersPage").then((m) => ({ default: m.CustomersPage }));
const loadOpsStatsPage = () =>
  import("./pages/OpsStatsPage").then((m) => ({ default: m.OpsStatsPage }));
const loadAirlinesLabelsPage = () =>
  import("./pages/AirlinesLabelsPage").then((m) => ({ default: m.AirlinesLabelsPage }));
const loadScscH21CatalogPage = () =>
  import("./pages/ScscH21CatalogPage").then((m) => ({ default: m.ScscH21CatalogPage }));

const AirCargoTracking = lazy(() =>
  import("./components/AirCargoTracking").then((m) => ({ default: m.AirCargoTracking }))
);
const CustomersPage = lazy(loadCustomersPage);
const OpsStatsPage = lazy(loadOpsStatsPage);
const AirlinesLabelsPage = lazy(loadAirlinesLabelsPage);
const ScscH21CatalogPage = lazy(loadScscH21CatalogPage);
const PrintShippingLabel = lazy(() =>
  import("./components/PrintShippingLabel").then((m) => ({ default: m.PrintShippingLabel }))
);

type PrintJob = { shipment: Shipment; airlineLabelOverrides?: AirlineLabelOverrides | null };

const EMPTY_CUSTOMERS: CustomerDirectoryEntry[] = [];

function AuthenticatedApp() {
  const todayYmd = formatLocalSessionDate(new Date());
  const fallback = useMemo(() => ({ rows: [] as Shipment[] }), []);
  const sync = useShipmentSync(fallback, { sessionDate: todayYmd });
  const { route, navigate } = useHashRoute();
  const isMobile = useIsMobile();
  const [printJob, setPrintJob] = useState<PrintJob | null>(null);
  const [opsSessionYmd, setOpsSessionYmd] = useState(todayYmd);
  const [cargoCopyApi, setCargoCopyApi] = useState<MobileCargoCopyApi | null>(null);

  useEffect(() => {
    if (route === "stats") {
      void sync.setSyncScope({ full: true });
      return;
    }
    void sync.setSyncScope({ sessionDate: opsSessionYmd });
    // Chỉ đổi khi route / ngày phiên — không phụ thuộc identity setSyncScope.
  }, [route, opsSessionYmd]);

  const prefetchCustomers = useCallback(() => {
    void loadCustomersPage();
  }, []);

  const prefetchStats = useCallback(() => {
    void loadOpsStatsPage();
  }, []);

  const prefetchAirlines = useCallback(() => {
    void loadAirlinesLabelsPage();
  }, []);

  const prefetchScscH21 = useCallback(() => {
    void loadScscH21CatalogPage();
  }, []);

  const onRequestPrint = useCallback(
    (shipment: Shipment, airlineLabelOverrides?: AirlineLabelOverrides | null) => {
      setPrintJob({ shipment, airlineLabelOverrides });
    },
    []
  );

  const skeletonVariant =
    route === "customers"
      ? "customers"
      : route === "stats"
        ? "stats"
        : route === "airlines" || route === "scsc-h21"
          ? "ops"
          : "ops";

  return (
    <>
      <div
        className={`no-print grid min-h-screen bg-ui-background ${
          isMobile ? "" : "md:grid-cols-[72px_1fr]"
        }`}
      >
        {!isMobile ? (
          <OpsLeftRail
            active={route}
            onNavigate={navigate}
            onPrefetchCustomers={prefetchCustomers}
            onPrefetchStats={prefetchStats}
            onPrefetchAirlines={prefetchAirlines}
            onPrefetchScscH21={prefetchScscH21}
          />
        ) : null}
        <div
          className={`min-w-0 ${
            isMobile ? "pb-[calc(5rem+env(safe-area-inset-bottom))]" : ""
          }`}
        >
          <Suspense fallback={<PageSkeleton variant={skeletonVariant} />}>
          {route === "customers" ? (
            <CustomersPage
              initial={sync.state?.customers ?? EMPTY_CUSTOMERS}
              ready={sync.state != null && sync.status !== "loading"}
              syncStatus={sync.status}
              socketConnected={sync.socketConnected}
              customersMaxSyncedAt={sync.state?.syncMeta?.customersMaxSyncedAt ?? null}
              onSave={async (customers) => {
                await sync.mutate({ action: "SET_CUSTOMERS", customers });
              }}
              onBack={() => navigate("ops")}
            />
          ) : route === "stats" ? (
            <OpsStatsPage
              rows={sync.state?.rows ?? fallback.rows}
              ready={sync.state != null && sync.status !== "loading"}
              syncStatus={sync.status}
              socketConnected={sync.socketConnected}
              onNavigateOps={() => navigate("ops")}
              onNavigateCustomers={() => navigate("customers")}
            />
          ) : route === "airlines" ? (
            <AirlinesLabelsPage
              value={sync.state?.airlineLabelOverrides}
              flightSamples={(sync.state?.rows ?? fallback.rows).map((r) => r.flight)}
              ready={sync.state != null && sync.status !== "loading"}
              syncStatus={sync.status}
              socketConnected={sync.socketConnected}
              onSave={async (overrides) => {
                await sync.mutate({ action: "SET_AIRLINE_LABEL_OVERRIDES", overrides });
              }}
              onBack={() => navigate("ops")}
            />
          ) : route === "scsc-h21" ? (
            <ScscH21CatalogPage onBack={() => navigate("ops")} />
          ) : (
            <AirCargoTracking
              sync={sync}
              onSessionDateChange={setOpsSessionYmd}
              onRequestPrint={onRequestPrint}
              onCargoCopyApiChange={setCargoCopyApi}
            />
          )}
        </Suspense>
        </div>
      </div>
      {isMobile ? (
        <BottomNav
          active={route}
          onNavigate={navigate}
          onPrefetchCustomers={prefetchCustomers}
          onPrefetchStats={prefetchStats}
          onPrefetchAirlines={prefetchAirlines}
          onPrefetchScscH21={prefetchScscH21}
          cargoCopy={route === "ops" ? cargoCopyApi : null}
        />
      ) : null}
      {printJob ? (
        <AppErrorBoundary
          key={printJob.shipment.id}
          onError={() => setPrintJob(null)}
          fallback={
            <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4">
              <div className="w-full max-w-md rounded-2xl border border-ui-border bg-ui-surface p-5 shadow-md">
                <h2 className="text-base font-semibold text-ui-text">Không mở được bản in</h2>
                <p className="mt-2 text-sm text-ui-text-muted">
                  Đã đóng cửa sổ in để Ops tiếp tục. Thử lại In tem trên cùng lô.
                </p>
                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setPrintJob(null)}
                    className="rounded-full bg-apple-blue px-4 py-2 text-sm font-semibold text-white"
                  >
                    Đóng
                  </button>
                </div>
              </div>
            </div>
          }
        >
          <Suspense fallback={null}>
            <PrintShippingLabel
              shipment={printJob.shipment}
              airlineLabelOverrides={
                sync.state?.airlineLabelOverrides ?? printJob.airlineLabelOverrides
              }
              onClose={() => setPrintJob(null)}
            />
          </Suspense>
        </AppErrorBoundary>
      ) : null}
    </>
  );
}

export default function App() {
  return (
    <AppAuthGate>
      <AuthenticatedApp />
    </AppAuthGate>
  );
}
