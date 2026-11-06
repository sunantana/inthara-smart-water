import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, apiFetch } from '../../api/client';
import { useAuthSession } from '../../lib/auth';
import { getTodayDateString } from '../../lib/date';
import Toast from '../../components/ui/Toast';

const DELIVERY_ZONES: readonly string[] = [
  'โซนในเมือง',
  'โซนท่าอิฐ',
  'โซนลับแล',
  'โซนพิชัย',
  'โซนตรอน',
  'โซนทองแสนขัน',
  'โซนน้ำปาด',
  'โซนฟากท่า',
  'โซนบ้านโคก',
];

interface FactoryLocation {
  lat: number;
  lng: number;
  name: string;
}

interface VehicleDto {
  id: number;
  plate: string;
  name: string;
  brand?: string | null;
  model?: string | null;
  maxBottles189L: number;
  maxPacks: number;
  fuelRateKmPerLiter: number;
  dieselPriceSatPerLiter: number;
  defaultDriverId?: number | null;
}

interface DriverDto {
  id: number;
  code: string;
  name: string;
  nickname?: string | null;
  phone?: string | null;
}

interface PlannedQuantities {
  'FG-189L': number;
  'FG-350ML': number;
  'FG-600ML': number;
  'FG-1500ML': number;
  totalSat?: number;
}

interface RouteStopItem {
  customerId: number;
  customerCode: string;
  customerName: string;
  phone?: string | null;
  zone?: string | null;
  address?: string | null;
  lat: number | null;
  lng: number | null;
  seq: number;
  distanceFromPrevKm: number;
  quantities: PlannedQuantities;
  planned?: PlannedQuantities;
  totalSat?: number;
}

interface TmsPlanResponse {
  date: string;
  zone: string | null;
  factory: FactoryLocation;
  totalStops: number;
  totalOrders: number;
  totalDistanceKm: number;
  estimatedTimeMin: number;
  total189L: number;
  totalPacks: number;
  totalRevenueSat: number;
  stops: RouteStopItem[];
  vehicles: VehicleDto[];
  drivers: DriverDto[];
}

interface TripRowDto {
  id: number;
  code: string;
  tripDate: string;
  departedTime?: string | null;
  vehicleId?: number | null;
  vehiclePlate?: string | null;
  vehicleName?: string | null;
  vehicleMaxBottles189L?: number | null;
  vehicleMaxPacks?: number | null;
  driverId?: number | null;
  driverCode?: string | null;
  driverName?: string | null;
  stopsCount: number;
  totalDistanceKm: number;
  estimatedTimeMin: number;
  total189L: number;
  totalPacks: number;
  estimatedFuelCostSat: number;
  totalRevenueSat: number;
  status: 'planned' | 'in_progress' | 'completed' | 'cancelled';
  warnings?: string[];
  stops?: RouteStopItem[];
}

function haversineKmClient(
  lat1: number | null | undefined,
  lng1: number | null | undefined,
  lat2: number | null | undefined,
  lng2: number | null | undefined,
): number {
  if (
    lat1 === null ||
    lat1 === undefined ||
    lng1 === null ||
    lng1 === undefined ||
    lat2 === null ||
    lat2 === undefined ||
    lng2 === null ||
    lng2 === undefined
  ) {
    return 0;
  }
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
  return R * c;
}

function recalculateClientStops(factory: FactoryLocation, stops: RouteStopItem[]) {
  let curLat = factory.lat;
  let curLng = factory.lng;
  let rawTotalKm = 0;

  const updated = stops.map((st, idx) => {
    const hasCoords = st.lat !== null && st.lng !== null && Number.isFinite(st.lat) && Number.isFinite(st.lng);
    const legRaw = hasCoords ? haversineKmClient(curLat, curLng, st.lat, st.lng) : 0;
    const legKm = Math.round(legRaw * 100) / 100;
    rawTotalKm += legRaw;
    if (hasCoords && st.lat !== null && st.lng !== null) {
      curLat = st.lat;
      curLng = st.lng;
    }
    return {
      ...st,
      seq: idx + 1,
      distanceFromPrevKm: legKm,
    };
  });

  const totalDistanceKm = Math.round(rawTotalKm * 100) / 100;
  const estimatedTimeMin = Math.round((totalDistanceKm / 40) * 60 + updated.length * 10);

  return {
    stops: updated,
    totalDistanceKm,
    estimatedTimeMin,
  };
}

function formatBaht(satang: number): string {
  return (Number(satang || 0) / 100).toLocaleString('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  planned: { label: 'วางแผนแล้ว', cls: 'bg-sky-100 text-sky-800 border-sky-200' },
  in_progress: { label: 'กำลังจัดส่ง', cls: 'bg-amber-100 text-amber-800 border-amber-200' },
  completed: { label: 'ปิดทริปแล้ว', cls: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  cancelled: { label: 'ยกเลิก', cls: 'bg-rose-100 text-rose-800 border-rose-200' },
};

export function TmsPage() {
  const { user } = useAuthSession();
  const canEdit = user?.role === 'admin' || user?.role === 'manager' || user?.role === 'staff';

  const todayIso = useMemo(() => getTodayDateString(), []);
  const [selectedDate, setSelectedDate] = useState<string>(todayIso);
  const [selectedZone, setSelectedZone] = useState<string>('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(
    null,
  );

  const [factory, setFactory] = useState<FactoryLocation>({
    lat: 17.816882513503195,
    lng: 100.36169257553256,
    name: 'โรงงานน้ำดื่มอินทรา (Inthara Factory)',
  });

  const [stops, setStops] = useState<RouteStopItem[]>([]);
  const [totalDistanceKm, setTotalDistanceKm] = useState<number>(0);
  const [estimatedTimeMin, setEstimatedTimeMin] = useState<number>(0);

  const [vehicles, setVehicles] = useState<VehicleDto[]>([]);
  const [drivers, setDrivers] = useState<DriverDto[]>([]);

  const [selectedVehicleId, setSelectedVehicleId] = useState<number | ''>('');
  const [selectedDriverId, setSelectedDriverId] = useState<number | ''>('');
  const [departedTime, setDepartedTime] = useState<string>('08:00');

  const [savedTrips, setSavedTrips] = useState<TripRowDto[]>([]);
  const [activeTripDetail, setActiveTripDetail] = useState<TripRowDto | null>(null);

  const [loadingPlan, setLoadingPlan] = useState<boolean>(false);
  const [optimizing, setOptimizing] = useState<boolean>(false);
  const [savingTrip, setSavingTrip] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);

  const loadPlanAndTrips = useCallback(async () => {
    setLoadingPlan(true);
    setErrorMessage(null);
    try {
      const qs = new URLSearchParams({ date: selectedDate });
      if (selectedZone) qs.set('zone', selectedZone);

      const [planRes, tripsRes] = await Promise.all([
        apiFetch<TmsPlanResponse>(`/tms/plan?${qs.toString()}`),
        apiFetch<{ data: TripRowDto[] }>(`/tms/trips?limit=25`),
      ]);

      if (planRes.factory) setFactory(planRes.factory);
      setStops(planRes.stops || []);
      setTotalDistanceKm(planRes.totalDistanceKm || 0);
      setEstimatedTimeMin(planRes.estimatedTimeMin || 0);
      setVehicles(planRes.vehicles || []);
      setDrivers(planRes.drivers || []);

      if (planRes.vehicles?.length > 0 && selectedVehicleId === '') {
        setSelectedVehicleId(planRes.vehicles[0].id);
        if (planRes.vehicles[0].defaultDriverId) {
          setSelectedDriverId(planRes.vehicles[0].defaultDriverId);
        }
      }
      if (planRes.drivers?.length > 0 && selectedDriverId === '') {
        setSelectedDriverId(planRes.drivers[0].id);
      }

      setSavedTrips(tripsRes.data || []);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'ไม่สามารถโหลดข้อมูลวางแผนเส้นทางได้');
    } finally {
      setLoadingPlan(false);
    }
  }, [selectedDate, selectedZone, selectedVehicleId, selectedDriverId]);

  useEffect(() => {
    void loadPlanAndTrips();
  }, [loadPlanAndTrips]);

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [factory.lat, factory.lng],
      zoom: 12,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    const group = L.layerGroup().addTo(map);
    mapInstanceRef.current = map;
    layerGroupRef.current = group;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      layerGroupRef.current = null;
    };
  }, [factory.lat, factory.lng]);

  // Update markers & route polyline when factory or stops change
  useEffect(() => {
    const map = mapInstanceRef.current;
    const group = layerGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();

    const factoryIcon = L.divIcon({
      className: 'inthara-factory-pin',
      html: `<div style="background:#0f172a;color:#fff;border:2px solid #38bdf8;border-radius:9999px;width:34px;height:34px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;box-shadow:0 2px 6px rgba(0,0,0,0.35);">🏭</div>`,
      iconSize: [34, 34],
      iconAnchor: [17, 17],
    });

    L.marker([factory.lat, factory.lng], { icon: factoryIcon })
      .bindPopup(`<strong>${factory.name}</strong><br/>พิกัดเริ่มต้น: ${factory.lat.toFixed(5)}, ${factory.lng.toFixed(5)}`)
      .addTo(group);

    const latLngPoints: L.LatLngExpression[] = [[factory.lat, factory.lng]];

    stops.forEach((st, idx) => {
      if (st.lat !== null && st.lng !== null && Number.isFinite(st.lat) && Number.isFinite(st.lng)) {
        const seqNum = idx + 1;
        latLngPoints.push([st.lat, st.lng]);

        const stopIcon = L.divIcon({
          className: 'inthara-stop-pin',
          html: `<div style="background:#0284c7;color:#fff;border:2px solid #fff;border-radius:9999px;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;box-shadow:0 2px 5px rgba(0,0,0,0.3);">${seqNum}</div>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });

        const q = st.quantities || st.planned || { 'FG-189L': 0, 'FG-350ML': 0, 'FG-600ML': 0, 'FG-1500ML': 0 };
        L.marker([st.lat, st.lng], { icon: stopIcon })
          .bindPopup(
            `<div style="min-width:180px">
              <strong>ป้ายที่ ${seqNum}: ${st.customerName}</strong> (${st.customerCode})<br/>
              <span style="color:#475569;font-size:12px">ห่างจุดก่อนหน้า: ${st.distanceFromPrevKm} กม.</span><br/>
              <span style="font-size:12px">ถัง 18.9L: <b>${q['FG-189L'] || 0}</b> | แพ็ค: <b>${(q['FG-350ML'] || 0) + (q['FG-600ML'] || 0) + (q['FG-1500ML'] || 0)}</b></span>
            </div>`,
          )
          .addTo(group);
      }
    });

    if (latLngPoints.length > 1) {
      L.polyline(latLngPoints, {
        color: '#0284c7',
        weight: 4,
        opacity: 0.85,
        dashArray: '8, 6',
      }).addTo(group);

      const bounds = L.latLngBounds(latLngPoints);
      map.fitBounds(bounds, { padding: [36, 36], maxZoom: 15 });
    } else {
      map.setView([factory.lat, factory.lng], 12);
    }
  }, [factory, stops]);

  const handleOptimizeNearestNeighbor = async () => {
    if (stops.length === 0) return;
    setOptimizing(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const res = await apiFetch<{
        orderedStops: RouteStopItem[];
        totalDistanceKm: number;
        estimatedTimeMin: number;
      }>('/tms/optimize', {
        method: 'POST',
        body: JSON.stringify({
          start: factory,
          stops,
        }),
      });

      setStops(res.orderedStops || []);
      setTotalDistanceKm(res.totalDistanceKm || 0);
      setEstimatedTimeMin(res.estimatedTimeMin || 0);
      const optMsg = `จัดลำดับเส้นทางอัตโนมัติ (Nearest-Neighbor) สำเร็จ — ระยะทางรวม ${res.totalDistanceKm} กม. (ประมาณ ${res.estimatedTimeMin} นาที)`;
      setSuccessMessage(optMsg);
      setToast({ message: optMsg, type: 'success' });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'จัดลำดับเส้นทางไม่สำเร็จ';
      setErrorMessage(errMsg);
      setToast({ message: errMsg, type: 'error' });
    } finally {
      setOptimizing(false);
    }
  };

  const moveStop = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= stops.length || fromIndex === toIndex) return;
    const next = [...stops];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);

    const recalc = recalculateClientStops(factory, next);
    setStops(recalc.stops);
    setTotalDistanceKm(recalc.totalDistanceKm);
    setEstimatedTimeMin(recalc.estimatedTimeMin);
  };

  const summaryMetrics = useMemo(() => {
    let total189L = 0;
    let totalPacks = 0;
    let totalRevenueSat = 0;

    for (const st of stops) {
      const q = st.quantities || st.planned || { 'FG-189L': 0, 'FG-350ML': 0, 'FG-600ML': 0, 'FG-1500ML': 0 };
      total189L += Number(q['FG-189L'] || 0);
      totalPacks +=
        Number(q['FG-350ML'] || 0) +
        Number(q['FG-600ML'] || 0) +
        Number(q['FG-1500ML'] || 0);
      totalRevenueSat += Number(st.totalSat ?? q.totalSat ?? 0);
    }

    const selectedVehicle = vehicles.find((v) => v.id === Number(selectedVehicleId)) || null;
    const estimatedFuelCostSat =
      selectedVehicle && selectedVehicle.fuelRateKmPerLiter > 0
        ? Math.round(
            (totalDistanceKm / selectedVehicle.fuelRateKmPerLiter) *
              selectedVehicle.dieselPriceSatPerLiter,
          )
        : 0;

    const max189L = selectedVehicle?.maxBottles189L || 0;
    const maxPacks = selectedVehicle?.maxPacks || 0;
    const pct189L = max189L > 0 ? Math.round((total189L / max189L) * 100) : 0;
    const pctPacks = maxPacks > 0 ? Math.round((totalPacks / maxPacks) * 100) : 0;

    const isOverCapacity =
      (max189L > 0 && total189L > max189L) || (maxPacks > 0 && totalPacks > maxPacks);
    const isNearCapacity =
      !isOverCapacity &&
      ((max189L > 0 && total189L >= Math.ceil(max189L * 0.9)) ||
        (maxPacks > 0 && totalPacks >= Math.ceil(maxPacks * 0.9)));

    return {
      total189L,
      totalPacks,
      totalRevenueSat,
      selectedVehicle,
      estimatedFuelCostSat,
      max189L,
      maxPacks,
      pct189L,
      pctPacks,
      isOverCapacity,
      isNearCapacity,
    };
  }, [stops, vehicles, selectedVehicleId, totalDistanceKm]);

  const handleCreateTrip = async () => {
    if (stops.length === 0) {
      setErrorMessage('ไม่มีจุดจอดในแผนเส้นทาง ไม่สามารถบันทึกทริปได้');
      return;
    }

    setSavingTrip(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const created = await apiFetch<TripRowDto>('/tms/trips', {
        method: 'POST',
        body: JSON.stringify({
          tripDate: selectedDate,
          departedTime: departedTime || null,
          vehicleId: selectedVehicleId ? Number(selectedVehicleId) : null,
          driverId: selectedDriverId ? Number(selectedDriverId) : null,
          stops: stops.map((st, idx) => ({
            customerId: st.customerId,
            seq: idx + 1,
            planned: {
              ...(st.quantities || st.planned),
              totalSat: st.totalSat ?? st.planned?.totalSat ?? 0,
            },
          })),
        }),
      });

      const warnSuffix =
        created.warnings && created.warnings.length > 0
          ? ` (${created.warnings.join(' | ')})`
          : '';
      const sMsg = `บันทึกทริป ${created.code} สำเร็จ!${warnSuffix}`;
      setSuccessMessage(sMsg);
      setToast({ message: sMsg, type: 'success' });
      setActiveTripDetail(created);
      await loadPlanAndTrips();
    } catch (err) {
      const errMsg = err instanceof ApiError ? `[${err.status}] ${err.message}` : (err instanceof Error ? err.message : 'บันทึกทริปไม่สำเร็จ');
      setErrorMessage(errMsg);
      setToast({ message: errMsg, type: 'error' });
    } finally {
      setSavingTrip(false);
    }
  };

  const handleInspectTrip = async (tripId: number) => {
    setErrorMessage(null);
    try {
      const detail = await apiFetch<TripRowDto>(`/tms/trips/${tripId}`);
      setActiveTripDetail(detail);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'ไม่สามารถโหลดรายละเอียดทริปได้';
      setErrorMessage(errMsg);
      setToast({ message: errMsg, type: 'error' });
    }
  };

  const handleReorderSavedTripStop = async (fromIdx: number, toIdx: number) => {
    if (!activeTripDetail || !activeTripDetail.stops) return;
    if (toIdx < 0 || toIdx >= activeTripDetail.stops.length || fromIdx === toIdx) return;

    const reordered = [...activeTripDetail.stops];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);

    try {
      const updated = await apiFetch<TripRowDto>(`/tms/trips/${activeTripDetail.id}/stops`, {
        method: 'PUT',
        body: JSON.stringify({
          stops: reordered.map((st, idx) => ({
            customerId: st.customerId,
            seq: idx + 1,
            planned: st.planned || st.quantities,
          })),
        }),
      });
      setActiveTripDetail(updated);
      const reMsg = `อัปเดตลำดับจุดจอดทริป ${updated.code} สำเร็จ — ระยะทางใหม่ ${updated.totalDistanceKm} กม. (${updated.estimatedTimeMin} นาที)`;
      setSuccessMessage(reMsg);
      setToast({ message: reMsg, type: 'success' });
      await loadPlanAndTrips();
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'เปลี่ยนลำดับจุดจอดทริปไม่สำเร็จ';
      setErrorMessage(errMsg);
      setToast({ message: errMsg, type: 'error' });
    }
  };

  const handleCompleteTrip = async (tripId: number) => {
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const updated = await apiFetch<TripRowDto & { linkedCheckins?: number }>(
        `/tms/trips/${tripId}/complete`,
        { method: 'POST' },
      );
      setActiveTripDetail(updated);
      const cMsg = `ปิดทริป ${updated.code} เรียบร้อยแล้ว (ผูกประวัติส่งน้ำ ${updated.linkedCheckins ?? 0} รายการ)`;
      setSuccessMessage(cMsg);
      setToast({ message: cMsg, type: 'success' });
      await loadPlanAndTrips();
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'ปิดทริปไม่สำเร็จ';
      setErrorMessage(errMsg);
      setToast({ message: errMsg, type: 'error' });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Filter Controls */}
      <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">
            วางแผนเส้นทางรถส่งน้ำ (TMS — Transportation Management)
          </h2>
          <p className="text-sm text-slate-600">
            คำนวณระยะทาง Haversine จากโรงงาน จัดลำดับ Nearest-Neighbor ตรวจสอบความจุรถและค่าน้ำมันอัตโนมัติ
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600">วันที่จัดส่ง</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="mt-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-sky-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600">กรองตามโซน</label>
            <select
              value={selectedZone}
              onChange={(e) => setSelectedZone(e.target.value)}
              className="mt-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-sky-500 focus:outline-none"
            >
              <option value="">ทุกโซนจัดส่ง</option>
              {DELIVERY_ZONES.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
          </div>

          <div className="pt-4">
            <button
              type="button"
              onClick={handleOptimizeNearestNeighbor}
              disabled={optimizing || stops.length === 0}
              className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-sky-700 disabled:opacity-50"
            >
              <span>🧭</span>
              <span>{optimizing ? 'กำลังคำนวณ...' : 'จัดเส้นทางอัตโนมัติ (Nearest-Neighbor)'}</span>
            </button>
          </div>
        </div>
      </div>

      {errorMessage && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">
          ⚠️ {errorMessage}
        </div>
      )}

      {successMessage && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          ✅ {successMessage}
        </div>
      )}

      {/* Map + Stop Sequence & Trip Builder */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left 7 Cols: Leaflet Map + KPI Strip */}
        <div className="space-y-4 lg:col-span-7">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
              <div className="text-xs text-slate-500">จำนวนป้ายจอด</div>
              <div className="mt-1 text-xl font-bold text-slate-900">{stops.length} ป้าย</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
              <div className="text-xs text-slate-500">ระยะทางรวม (Haversine)</div>
              <div className="mt-1 text-xl font-bold text-sky-700">{totalDistanceKm.toFixed(2)} กม.</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
              <div className="text-xs text-slate-500">เวลาเดินทาง+จอดส่ง</div>
              <div className="mt-1 text-xl font-bold text-amber-700">{estimatedTimeMin} นาที</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
              <div className="text-xs text-slate-500">ค่าน้ำมันโดยประมาณ</div>
              <div className="mt-1 text-xl font-bold text-emerald-700">
                ฿{formatBaht(summaryMetrics.estimatedFuelCostSat)}
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5 text-xs text-slate-600">
              <span>
                🏭 จุดเริ่มต้น: <strong>{factory.name}</strong> ({factory.lat.toFixed(5)}, {factory.lng.toFixed(5)})
              </span>
              <span>ลากสลับลำดับป้ายด้านขวาเพื่ออัปเดตเส้นทาง</span>
            </div>
            <div ref={mapContainerRef} className="h-[430px] w-full bg-slate-100" />
          </div>
        </div>

        {/* Right 5 Cols: Vehicle/Driver Assignment + Capacity Check + Draggable Stop List */}
        <div className="space-y-4 lg:col-span-5">
          {/* Trip Configuration & Capacity Card */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-900">
              🚛 กำหนดรถขนส่ง & พนักงานขับรถ (บันทึกทริป)
            </h3>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700">เลือกรถขนส่ง</label>
                <select
                  value={selectedVehicleId}
                  onChange={(e) => {
                    const val = e.target.value ? Number(e.target.value) : '';
                    setSelectedVehicleId(val);
                    const veh = vehicles.find((v) => v.id === val);
                    if (veh?.defaultDriverId) setSelectedDriverId(veh.defaultDriverId);
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium"
                >
                  <option value="">-- ไม่ระบุรถ --</option>
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.plate} — {v.name} (จุ {v.maxBottles189L} ถัง / {v.maxPacks} แพ็ค)
                    </option>
                  ))}
                </select>
                {/* Quick Vehicle selection chips */}
                {vehicles.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {vehicles.map((v) => {
                      const isSel = selectedVehicleId === v.id;
                      return (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => {
                            setSelectedVehicleId(v.id);
                            if (v.defaultDriverId) setSelectedDriverId(v.defaultDriverId);
                          }}
                          className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition-all ${
                            isSel
                              ? 'border-sky-600 bg-sky-50 text-sky-800 ring-2 ring-sky-500/30 font-bold'
                              : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          🚛 {v.plate}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">เวลาออกรถ</label>
                <input
                  type="time"
                  value={departedTime}
                  onChange={(e) => setDepartedTime(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700">พนักงานขับรถ</label>
              <select
                value={selectedDriverId}
                onChange={(e) => setSelectedDriverId(e.target.value ? Number(e.target.value) : '')}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium"
              >
                <option value="">-- ไม่ระบุคนขับ --</option>
                {drivers.map((d) => (
                  <option key={d.id} value={d.id}>
                    [{d.code}] {d.name} {d.nickname ? `(${d.nickname})` : ''}
                  </option>
                ))}
              </select>
              {/* Quick Driver selection chips */}
              {drivers.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {drivers.map((d) => {
                    const isSel = selectedDriverId === d.id;
                    return (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => setSelectedDriverId(d.id)}
                        className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition-all ${
                          isSel
                            ? 'border-sky-600 bg-sky-50 text-sky-800 ring-2 ring-sky-500/30 font-bold'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        👷 {d.nickname || d.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Capacity Progress Bars */}
            {summaryMetrics.selectedVehicle && (
              <div className="space-y-2.5 rounded-lg bg-slate-50 p-3 border border-slate-200">
                <div>
                  <div className="flex justify-between text-xs font-medium">
                    <span>ความจุถัง 18.9L</span>
                    <span
                      className={
                        summaryMetrics.total189L > summaryMetrics.max189L
                          ? 'font-bold text-rose-600'
                          : 'text-slate-700'
                      }
                    >
                      {summaryMetrics.total189L} / {summaryMetrics.max189L} ถัง ({summaryMetrics.pct189L}%)
                    </span>
                  </div>
                  <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                    <div
                      className={`h-full transition-all ${
                        summaryMetrics.total189L > summaryMetrics.max189L
                          ? 'bg-rose-600'
                          : summaryMetrics.pct189L >= 90
                            ? 'bg-amber-500'
                            : 'bg-sky-600'
                      }`}
                      style={{ width: `${Math.min(100, summaryMetrics.pct189L)}%` }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs font-medium">
                    <span>ความจุน้ำแพ็ค (รวม 350/600/1500ml)</span>
                    <span
                      className={
                        summaryMetrics.totalPacks > summaryMetrics.maxPacks
                          ? 'font-bold text-rose-600'
                          : 'text-slate-700'
                      }
                    >
                      {summaryMetrics.totalPacks} / {summaryMetrics.maxPacks} แพ็ค ({summaryMetrics.pctPacks}%)
                    </span>
                  </div>
                  <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                    <div
                      className={`h-full transition-all ${
                        summaryMetrics.totalPacks > summaryMetrics.maxPacks
                          ? 'bg-rose-600'
                          : summaryMetrics.pctPacks >= 90
                            ? 'bg-amber-500'
                            : 'bg-emerald-600'
                      }`}
                      style={{ width: `${Math.min(100, summaryMetrics.pctPacks)}%` }}
                    />
                  </div>
                </div>

                {summaryMetrics.isOverCapacity && (
                  <div className="rounded bg-rose-100 px-2.5 py-1.5 text-xs font-semibold text-rose-800">
                    ⛔ จำนวนบรรทุกเกินความจุสูงสุดของรถ! ระบบจะไม่อนุญาตให้บันทึกทริป (409 Conflict)
                  </div>
                )}
                {summaryMetrics.isNearCapacity && (
                  <div className="rounded bg-amber-100 px-2.5 py-1.5 text-xs font-semibold text-amber-800">
                    ⚠️ จำนวนบรรทุกถึง 90% ของความจุรถ โปรดตรวจสอบน้ำหนักบรรทุกก่อนออกรถ
                  </div>
                )}
              </div>
            )}

            {/* Sticky Trip Action Bar */}
            <div className="sticky bottom-0 -mx-4 -mb-4 mt-2 p-3 bg-white/95 backdrop-blur-xs border-t border-slate-200 rounded-b-xl flex flex-wrap items-center justify-between gap-3 shadow-sm">
              <div className="text-xs text-slate-600">
                ยอดขายรวมในทริป:{' '}
                <strong className="text-sm font-bold font-mono text-slate-900">
                  ฿{formatBaht(summaryMetrics.totalRevenueSat)}
                </strong>
              </div>
              {canEdit && (
                <button
                  type="button"
                  onClick={handleCreateTrip}
                  disabled={savingTrip || stops.length === 0 || summaryMetrics.isOverCapacity}
                  className="min-h-[44px] rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                >
                  {savingTrip ? 'กำลังบันทึก...' : '💾 บันทึกทริปจัดส่ง'}
                </button>
              )}
            </div>
          </div>

          {/* Stop Sequence List (Drag-and-drop + Up/Down buttons) */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">
                📍 ลำดับจุดจอด ({stops.length} ป้าย)
              </h3>
              <span className="text-xs text-slate-500">ลากวาง (Drag & Drop) หรือกด ⬆️⬇️</span>
            </div>

            {loadingPlan ? (
              <div className="py-8 text-center text-sm text-slate-500">กำลังโหลดใบเส้นทาง...</div>
            ) : stops.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 py-8 text-center text-sm text-slate-500">
                ไม่มีออเดอร์ค้างส่งในวันที่ {selectedDate} {selectedZone ? `(โซน ${selectedZone})` : ''}
              </div>
            ) : (
              <div className="max-h-[290px] space-y-2 overflow-y-auto pr-1">
                {stops.map((st, idx) => {
                  const q = st.quantities || st.planned || { 'FG-189L': 0, 'FG-350ML': 0, 'FG-600ML': 0, 'FG-1500ML': 0 };
                  const packs =
                    (q['FG-350ML'] || 0) + (q['FG-600ML'] || 0) + (q['FG-1500ML'] || 0);
                  return (
                    <div
                      key={`${st.customerId}-${idx}`}
                      draggable
                      onDragStart={() => setDragIndex(idx)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => {
                        if (dragIndex !== null && dragIndex !== idx) {
                          moveStop(dragIndex, idx);
                        }
                        setDragIndex(null);
                      }}
                      className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs hover:border-sky-300 cursor-grab"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-600 font-bold text-white">
                          {idx + 1}
                        </span>
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-slate-900">
                            {st.customerName}{' '}
                            <span className="font-normal text-slate-500">({st.customerCode})</span>
                          </div>
                          <div className="text-slate-500">
                            +{st.distanceFromPrevKm.toFixed(2)} กม. • ถัง 18.9L:{' '}
                            <b className="text-slate-800">{q['FG-189L'] || 0}</b> • แพ็ค:{' '}
                            <b className="text-slate-800">{packs}</b>
                          </div>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => moveStop(idx, idx - 1)}
                          disabled={idx === 0}
                          title="เลื่อนขึ้น"
                          className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-slate-700 hover:bg-slate-100 disabled:opacity-30"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => moveStop(idx, idx + 1)}
                          disabled={idx === stops.length - 1}
                          title="เลื่อนลง"
                          className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-slate-700 hover:bg-slate-100 disabled:opacity-30"
                        >
                          ↓
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Saved Trips Table & Active Trip Inspector */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-7">
          <h3 className="mb-3 text-base font-bold text-slate-900">
            📋 ประวัติทริปจัดส่งที่บันทึกไว้ ({savedTrips.length} ทริปล่าสุด)
          </h3>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-3 py-2 font-semibold">รหัสทริป</th>
                  <th className="px-3 py-2 font-semibold">วันที่</th>
                  <th className="px-3 py-2 font-semibold">รถ / คนขับ</th>
                  <th className="px-3 py-2 font-semibold text-right">ป้าย / ระยะทาง</th>
                  <th className="px-3 py-2 font-semibold text-right">บรรทุก</th>
                  <th className="px-3 py-2 font-semibold">สถานะ</th>
                  <th className="px-3 py-2 font-semibold text-right">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {savedTrips.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                      ยังไม่มีทริปที่บันทึกไว้
                    </td>
                  </tr>
                ) : (
                  savedTrips.map((tr) => {
                    const badge = STATUS_BADGE[tr.status] || STATUS_BADGE.planned;
                    return (
                      <tr key={tr.id} className="hover:bg-slate-50">
                        <td className="px-3 py-2.5 font-mono font-semibold text-sky-700">
                          {tr.code}
                        </td>
                        <td className="px-3 py-2.5 text-slate-700">{tr.tripDate}</td>
                        <td className="px-3 py-2.5 text-slate-700">
                          <div className="font-medium">{tr.vehiclePlate || '-'}</div>
                          <div className="text-slate-500">{tr.driverName || '-'}</div>
                        </td>
                        <td className="px-3 py-2.5 text-right text-slate-700">
                          <div>{tr.stopsCount} ป้าย</div>
                          <div className="text-slate-500">
                            {tr.totalDistanceKm} กม. ({tr.estimatedTimeMin} นาที)
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-right text-slate-700">
                          <div>18.9L: {tr.total189L}</div>
                          <div className="text-slate-500">แพ็ค: {tr.totalPacks}</div>
                        </td>
                        <td className="px-3 py-2.5">
                          <span
                            className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold ${badge.cls}`}
                          >
                            {badge.label}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => handleInspectTrip(tr.id)}
                            className="rounded border border-sky-200 bg-sky-50 px-2.5 py-1 font-semibold text-sky-700 hover:bg-sky-100"
                          >
                            ดูรายละเอียด
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Active Trip Detail & Stop Reorder Panel */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-5">
          {!activeTripDetail ? (
            <div className="flex h-full min-h-[220px] items-center justify-center text-center text-sm text-slate-500">
              คลิก &ldquo;ดูรายละเอียด&rdquo; จากตารางทริปด้านซ้าย เพื่อตรวจสอบจุดจอด สลับลำดับป้าย หรือกดปิดทริป
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start justify-between border-b border-slate-100 pb-3">
                <div>
                  <h4 className="text-base font-bold text-slate-900">
                    ทริป {activeTripDetail.code} ({activeTripDetail.tripDate})
                  </h4>
                  <p className="text-xs text-slate-600">
                    รถ: {activeTripDetail.vehiclePlate || '-'} • คนขับ:{' '}
                    {activeTripDetail.driverName || '-'}
                  </p>
                </div>

                {activeTripDetail.status !== 'completed' &&
                  activeTripDetail.status !== 'cancelled' && (
                    <button
                      type="button"
                      onClick={() => handleCompleteTrip(activeTripDetail.id)}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                    >
                      ✅ ปิดทริป (Complete)
                    </button>
                  )}
              </div>

              <div className="grid grid-cols-3 gap-2 rounded-lg bg-slate-50 p-3 text-xs">
                <div>
                  <span className="text-slate-500">ระยะทางรวม:</span>
                  <div className="font-bold text-slate-900">
                    {activeTripDetail.totalDistanceKm} กม.
                  </div>
                </div>
                <div>
                  <span className="text-slate-500">เวลาประมาณ:</span>
                  <div className="font-bold text-slate-900">
                    {activeTripDetail.estimatedTimeMin} นาที
                  </div>
                </div>
                <div>
                  <span className="text-slate-500">ค่าน้ำมัน:</span>
                  <div className="font-bold text-emerald-700">
                    ฿{formatBaht(activeTripDetail.estimatedFuelCostSat)}
                  </div>
                </div>
              </div>

              <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                {(activeTripDetail.stops || []).map((st, idx, arr) => (
                  <div
                    key={`${st.customerId}-${st.seq}`}
                    className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-xs"
                  >
                    <div>
                      <span className="font-bold text-sky-700">#{st.seq}</span>{' '}
                      <span className="font-semibold text-slate-900">{st.customerName}</span>{' '}
                      <span className="text-slate-500">
                        (+{st.distanceFromPrevKm} กม.)
                      </span>
                    </div>

                    {canEdit && activeTripDetail.status === 'planned' && (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => handleReorderSavedTripStop(idx, idx - 1)}
                          className="rounded border border-slate-300 px-1.5 py-0.5 hover:bg-slate-100 disabled:opacity-30"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          disabled={idx === arr.length - 1}
                          onClick={() => handleReorderSavedTripStop(idx, idx + 1)}
                          className="rounded border border-slate-300 px-1.5 py-0.5 hover:bg-slate-100 disabled:opacity-30"
                        >
                          ↓
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      <Toast message={toast?.message ?? null} type={toast?.type} onClose={() => setToast(null)} />
    </div>
  );
}

export default TmsPage;
