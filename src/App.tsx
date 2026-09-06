import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import type { Shipment } from "./types/shipment";
import type { CustomerDirectoryEntry } from "./types/customerDirectory";
import { useShipmentSync } from "./hooks/useShipmentSync";
import { useHashRoute } from "./hooks/useHashRoute";
import { useAirlineCatalog } from "./hooks/useAirlineCatalog";
import type { AirlineLabelOverrides } from "./utils/airlineLabelOverridesCore";
import { BottomNav, OpsLeftRail, PageSkeleton } from "./ui";
import type { MobileCargoCopyApi } from "./ui/BottomNav";
import { AppAuthGate } from "./components/AppAuthGate";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { formatLocalSessionDate } from "./utils/sessionDate";
import { useIsMobile } from "./hooks/useIsMobile";
import { useToast } from "./ui";

const loadCustomersPage = () =>
  import("./pages/CustomersPage").then((m) => ({ default: m.CustomersPage }));
const loadOpsStatsPage = () =>
  import("./pages/OpsStatsPage").then((m) => ({ default: m.OpsStatsPage }));
const loadScscH21CatalogPage = () =>
  import("./pages/ScscH21CatalogPage").then((m) => ({ default: m.ScscH21CatalogPage }));
const loadTcsH21CatalogPage = () =>
  import("./pages/TcsH21CatalogPage").then((m) => ({ default: m.TcsH21CatalogPage }));

const AirCargoTracking = lazy(() =>
  import("./components/AirCargoTracking").then((m) => ({ default: m.AirCargoTracking }))
);
const CustomersPage = lazy(loadCustomersPage);
const OpsStatsPage = lazy(loadOpsStatsPage);
const ScscH21CatalogPage = lazy(loadScscH21CatalogPage);
const TcsH21CatalogPage = lazy(loadTcsH21CatalogPage);
const PrintShippingLabel = lazy(() =>
  import("./components/PrintShippingLabel").then((m) => ({ default: m.PrintShippingLabel }))
);

type PrintJob = {
  shipment: Shipment;
  airlineLabelOverrides?: AirlineLabelOverrides | null;
  airlineReplaceDefaults?: boolean;
};

const EMPTY_CUSTOMERS: CustomerDirectoryEntry[] = [];

function AuthenticatedApp() {
  const todayYmd = formatLocalSessionDate(new Date());
  const fallback = useMemo(() => ({ rows: [] as Shipment[] }), []);
  const sync = useShipmentSync(fallback, { sessionDate: todayYmd });
  const airlineCatalog = useAirlineCatalog();
  const toast = useToast();
  const { route, navigate } = useHashRoute();
  const isMobile = useIsMobile();
  const [printJob, setPrintJob] = useState<PrintJob | null>(null);
  const [opsSessionYmd, setOpsSessionYmd] = useState(todayYmd);
  const [cargoCopyApi, setCargoCopyApi] = useState<MobileCargoCopyApi | null>(null);
  const [airlineSyncing, setAirlineSyncing] = useState(false);

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

  const prefetchScscH21 = useCallback(() => {
    void loadScscH21CatalogPage();
  }, []);

  const prefetchTcsH21 = useCallback(() => {
    void loadTcsH21CatalogPage();
  }, []);

  const onRequestPrint = useCallback(
    (shipment: Shipment) => {
      setPrintJob({
        shipment,
        airlineLabelOverrides: airlineCatalog.maps,
        airlineReplaceDefaults: airlineCatalog.fromCatalog,
      });
    },
    [airlineCatalog.fromCatalog, airlineCatalog.maps]
  );

  const onSyncAirlines = useCallback(async () => {
    const { dataSupabaseConfig, loadAirlineCatalogCache } = await import(
      "./utils/airlineCatalogFromSupabase"
    );
    if (!dataSupabaseConfig()) {
      toast.error(
        "Thiếu VITE_DATA_SUPABASE_URL / VITE_DATA_SUPABASE_ANON_KEY trong env",
        "Hãng bay"
      );
      return;
    }
    setAirlineSyncing(true);
    try {
      await airlineCatalog.refresh();
      const cached = loadAirlineCatalogCache();
      if (!cached) {
        toast.error("Không đồng bộ được hãng bay từ Supabase.", "Hãng bay");
        return;
      }
      const n = Object.keys(cached.maps.byFlightPrefix).length;
      toast.success(`Đã đồng bộ ${n} hãng bay từ Supabase`, "Hãng bay");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không đồng bộ được hãng bay.", "Hãng bay");
    } finally {
      setAirlineSyncing(false);
    }
  }, [airlineCatalog, toast]);

  const skeletonVariant =
    route === "customers" ? "customers" : route === "stats" ? "stats" : "ops";

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
            onPrefetchScscH21={prefetchScscH21}
            onPrefetchTcsH21={prefetchTcsH21}
            airlineSyncedAt={airlineCatalog.syncedAt}
            airlineSyncing={airlineSyncing || airlineCatalog.status === "loading"}
            onSyncAirlines={() => void onSyncAirlines()}
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
          ) : route === "scsc-h21" ? (
            <ScscH21CatalogPage onBack={() => navigate("ops")} />
          ) : route === "tcs-h21" ? (
            <TcsH21CatalogPage onBack={() => navigate("ops")} />
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
          onPrefetchScscH21={prefetchScscH21}
          onPrefetchTcsH21={prefetchTcsH21}
          cargoCopy={route === "ops" ? cargoCopyApi : null}
          airlineSyncedAt={airlineCatalog.syncedAt}
          airlineSyncing={airlineSyncing || airlineCatalog.status === "loading"}
          onSyncAirlines={() => void onSyncAirlines()}
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
              airlineLabelOverrides={printJob.airlineLabelOverrides}
              airlineReplaceDefaults={printJob.airlineReplaceDefaults}
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
