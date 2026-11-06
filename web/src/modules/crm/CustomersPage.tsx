import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ApiError, api } from '../../api/client';
import { useAuthSession } from '../../lib/auth';
import { findModule } from '../../lib/modules';
import { bahtToSatang, formatBaht, satangToBaht } from '../../lib/money';
import Toast from '../../components/ui/Toast';
import type { PriceTierItem } from '../pricing/PriceTiersPage';

const moduleMeta = findModule('CRM');

export type CustomerType = 'person' | 'shop' | 'organization';
export type CustomerSku = 'FG-189L' | 'FG-350ML' | 'FG-600ML' | 'FG-1500ML';

export interface CustomerItem {
  id: number;
  code: string;
  customerType: CustomerType;
  name: string;
  contactPerson: string | null;
  phone: string | null;
  taxId: string | null;
  branchType: string | null;
  zone: string | null;
  houseNo: string | null;
  moo: string | null;
  subdistrict: string | null;
  district: string | null;
  province: string | null;
  postalCode: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  priceTierId: number | null;
  priceTierName: string | null;
  outstandingBottles: number;
  balanceSat: number;
  creditTermDays: number;
  isActive: boolean;
  prices: Record<CustomerSku, number>;
  createdAt: string;
  updatedAt: string;
}

export interface PriceHistoryItem {
  id: number;
  customerId: number;
  sku: CustomerSku;
  oldPriceSat: number | null;
  newPriceSat: number;
  changedBy: number | null;
  changedByUsername: string | null;
  changedByName: string | null;
  createdAt: string;
}

export interface CustomerOrderSummary {
  id: number;
  code: string;
  status: string;
  deliveryDate: string;
  totalSat: number;
  paidSat: number;
}

export interface CustomerDetailResponse extends CustomerItem {
  recentOrders: CustomerOrderSummary[];
  priceHistory: PriceHistoryItem[];
}

interface PaginatedCustomers {
  data: CustomerItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export const CUSTOMER_TYPE_LABELS: Record<CustomerType, string> = {
  person: 'บุคคลทั่วไป',
  shop: 'ร้านค้าปลีก-ส่ง',
  organization: 'หน่วยงาน/องค์กร',
};

// พิกัดโรงงานอินธารา (ต.จริม อ.ท่าปลา จ.อุตรดิตถ์)
const DEFAULT_FACTORY_COORDS: [number, number] = [17.816883, 100.361693];

interface LeafletPinPickerProps {
  lat: number | null;
  lng: number | null;
  onChange: (lat: number, lng: number) => void;
  onClear?: () => void;
}

function LeafletPinPicker({ lat, lng, onChange, onClear }: LeafletPinPickerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.CircleMarker | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const hasCoords = lat !== null && lng !== null && Number.isFinite(lat) && Number.isFinite(lng);
    const initialCenter: [number, number] = hasCoords ? [lat, lng] : DEFAULT_FACTORY_COORDS;

    const map = L.map(containerRef.current, { center: initialCenter, zoom: 13 });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors',
    }).addTo(map);

    let marker: L.CircleMarker | null = null;
    if (hasCoords) {
      marker = L.circleMarker(initialCenter, {
        radius: 9,
        color: '#0f766e',
        fillColor: '#14b8a6',
        fillOpacity: 0.9,
        weight: 2,
      }).addTo(map);
    }

    map.on('click', (ev: L.LeafletMouseEvent) => {
      const nextLat = Number(ev.latlng.lat.toFixed(6));
      const nextLng = Number(ev.latlng.lng.toFixed(6));
      if (!markerRef.current) {
        markerRef.current = L.circleMarker([nextLat, nextLng], {
          radius: 9,
          color: '#0f766e',
          fillColor: '#14b8a6',
          fillOpacity: 0.9,
          weight: 2,
        }).addTo(map);
      } else {
        markerRef.current.setLatLng([nextLat, nextLng]);
      }
      onChange(nextLat, nextLng);
    });

    mapRef.current = map;
    markerRef.current = marker;

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;
    const hasCoords = lat !== null && lng !== null && Number.isFinite(lat) && Number.isFinite(lng);

    if (hasCoords) {
      if (!markerRef.current) {
        markerRef.current = L.circleMarker([lat, lng], {
          radius: 9,
          color: '#0f766e',
          fillColor: '#14b8a6',
          fillOpacity: 0.9,
          weight: 2,
        }).addTo(mapRef.current);
      } else {
        markerRef.current.setLatLng([lat, lng]);
      }
      mapRef.current.setView([lat, lng], mapRef.current.getZoom());
    } else {
      if (markerRef.current) {
        markerRef.current.remove();
        markerRef.current = null;
      }
    }
  }, [lat, lng]);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
      <div ref={containerRef} className="h-56 w-full" />
      <div className="flex items-center justify-between bg-slate-50 px-3 py-1.5 text-[11px] text-slate-500 dark:bg-slate-800/80 dark:text-slate-400">
        <span>คลิกบนแผนที่เพื่อปักหมุด หรือวางลิงก์ Google Maps ด้านบน</span>
        {(lat !== null || lng !== null) && onClear && (
          <button
            type="button"
            onClick={onClear}
            className="font-medium text-rose-600 hover:text-rose-700 dark:text-rose-400"
          >
            ล้างพิกัด
          </button>
        )}
      </div>
    </div>
  );
}

export default function CustomersPage() {
  const { id: routeCustomerId } = useParams<{ id?: string }>();
  const { user } = useAuthSession();
  const queryClient = useQueryClient();

  const canWrite = user?.role === 'admin' || user?.role === 'manager';
  const isAdmin = user?.role === 'admin';

  // ตัวกรองตารางลูกค้า
  const [search, setSearch] = useState('');
  const [zoneFilter, setZoneFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [activeFilter, setActiveFilter] = useState<'1' | '0' | 'all'>('1');
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);

  // Toast แจ้งเตือน
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Modal สร้าง/แก้ไขลูกค้า
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<CustomerItem | null>(null);
  const [customerType, setCustomerType] = useState<CustomerType>('shop');
  const [name, setName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [phone, setPhone] = useState('');
  const [taxId, setTaxId] = useState('');
  const [branchType, setBranchType] = useState('สำนักงานใหญ่');
  const [zone, setZone] = useState('');
  const [houseNo, setHouseNo] = useState('');
  const [moo, setMoo] = useState('');
  const [subdistrict, setSubdistrict] = useState('จริม');
  const [district, setDistrict] = useState('ท่าปลา');
  const [province, setProvince] = useState('อุตรดิตถ์');
  const [postalCode, setPostalCode] = useState('53150');
  const [address, setAddress] = useState('');
  const [latText, setLatText] = useState('');
  const [lngText, setLngText] = useState('');
  const [gmapsUrl, setGmapsUrl] = useState('');
  const [resolvingUrl, setResolvingUrl] = useState(false);
  const [priceTierId, setPriceTierId] = useState<string>('');
  const [price189Baht, setPrice189Baht] = useState('15');
  const [price350Baht, setPrice350Baht] = useState('35');
  const [price600Baht, setPrice600Baht] = useState('35');
  const [price1500Baht, setPrice1500Baht] = useState('35');
  const [creditTermDays, setCreditTermDays] = useState('0');
  const [formError, setFormError] = useState<string | null>(null);

  const listQuery = useQuery({
    queryKey: ['customers', search, zoneFilter, typeFilter, activeFilter, page],
    enabled: !routeCustomerId,
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: '50',
        active: activeFilter,
      });
      if (search.trim()) params.set('search', search.trim());
      if (zoneFilter.trim()) params.set('zone', zoneFilter.trim());
      if (typeFilter) params.set('type', typeFilter);
      return api.get<PaginatedCustomers>(`/customers?${params.toString()}`);
    },
  });

  const detailQuery = useQuery({
    queryKey: ['customer-detail', routeCustomerId],
    enabled: Boolean(routeCustomerId),
    queryFn: () => api.get<CustomerDetailResponse>(`/customers/${routeCustomerId}`),
  });

  const ledgerQuery = useQuery({
    queryKey: ['customer-ledger', routeCustomerId],
    enabled: Boolean(routeCustomerId),
    queryFn: () =>
      api.get<{
        items: Array<{
          id: number;
          entryType: string;
          amountSat: number;
          signedAmountSat: number;
          refType: string | null;
          refId: string | null;
          note: string;
          createdByName: string | null;
          createdAt: string;
        }>;
      }>(`/customers/${routeCustomerId}/ledger?limit=50`),
  });

  const [depType, setDepType] = useState<'in' | 'use' | 'refund'>('in');
  const [depAmountBaht, setDepAmountBaht] = useState<string>('');
  const [depNote, setDepNote] = useState<string>('');
  const [depError, setDepError] = useState<string>('');

  const depositMutation = useMutation({
    mutationFn: async () => {
      if (!routeCustomerId) throw new Error('ไม่พบรหัสลูกค้า');
      const amountSat = bahtToSatang(depAmountBaht || '0');
      if (amountSat <= 0) throw new Error('จำนวนเงินมัดจำต้องมากกว่า 0 บาท');
      return api.post(`/customers/${routeCustomerId}/deposit`, {
        type: depType,
        amountSat,
        note: depNote.trim(),
      });
    },
    onSuccess: () => {
      setDepAmountBaht('');
      setDepNote('');
      setDepError('');
      queryClient.invalidateQueries({ queryKey: ['customer-detail', routeCustomerId] });
      queryClient.invalidateQueries({ queryKey: ['customer-ledger', routeCustomerId] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
    onError: (err) => {
      setDepError(
        err instanceof ApiError || err instanceof Error
          ? err.message
          : 'ไม่สามารถบันทึกรายการมัดจำได้',
      );
    },
  });

  const tiersQuery = useQuery({
    queryKey: ['price-tiers'],
    queryFn: () => api.get<{ data: PriceTierItem[] }>('/price-tiers?active=1'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/customers/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      if (routeCustomerId) {
        queryClient.invalidateQueries({ queryKey: ['customer-detail', routeCustomerId] });
      }
    },
  });

  // รวบรวมรายชื่อโซนที่มีอยู่แล้วจากข้อมูลลูกค้า (Distinct Zones)
  const existingZones = useMemo(() => {
    const set = new Set<string>();
    (listQuery.data?.data ?? []).forEach((c) => {
      if (c.zone && c.zone.trim()) {
        set.add(c.zone.trim());
      }
    });
    if (set.size === 0) {
      set.add('โซนท่าปลา - ต.จริม');
    }
    return Array.from(set).sort();
  }, [listQuery.data?.data]);

  // ค้นหา Price Tier ที่เลือก
  const selectedTier = useMemo(() => {
    if (!priceTierId) return null;
    return (tiersQuery.data?.data ?? []).find((t) => String(t.id) === priceTierId) ?? null;
  }, [priceTierId, tiersQuery.data?.data]);

  // คำนวณป้ายกำกับสถานะราคา (ตาม tier / ปรับแล้ว / กำหนดราคาเอง)
  const priceStatus = useMemo(() => {
    if (!selectedTier) {
      return {
        label: 'กำหนดราคาเอง',
        type: 'custom',
        badgeClass:
          'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600',
      };
    }
    const t189 = satangToBaht(selectedTier.price189lSat);
    const t350 = satangToBaht(selectedTier.price350mlSat);
    const t600 = satangToBaht(selectedTier.price600mlSat);
    const t1500 = satangToBaht(selectedTier.price1500mlSat);

    const matchesTier =
      Number(price189Baht) === t189 &&
      Number(price350Baht) === t350 &&
      Number(price600Baht) === t600 &&
      Number(price1500Baht) === t1500;

    if (matchesTier) {
      return {
        label: `ตาม tier: ${selectedTier.name}`,
        type: 'tier',
        badgeClass:
          'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600',
      };
    } else {
      return {
        label: 'ปรับแล้ว',
        type: 'modified',
        badgeClass:
          'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-700 font-semibold',
      };
    }
  }, [selectedTier, price189Baht, price350Baht, price600Baht, price1500Baht]);

  // กล่องตัวอย่าง Live Address Preview
  const liveAddressPreview = useMemo(() => {
    const parts: string[] = [];
    if (houseNo.trim()) parts.push(`บ้านเลขที่ ${houseNo.trim()}`);
    if (moo.trim()) parts.push(`หมู่ ${moo.trim()}`);
    if (subdistrict.trim()) parts.push(`ต.${subdistrict.trim()}`);
    if (district.trim()) parts.push(`อ.${district.trim()}`);
    if (province.trim()) parts.push(`จ.${province.trim()}`);
    if (postalCode.trim()) parts.push(postalCode.trim());
    const standard = parts.join(' ');
    if (address.trim()) {
      return standard ? `${standard} (${address.trim()})` : address.trim();
    }
    return standard || 'ยังไม่ได้ระบุที่อยู่';
  }, [houseNo, moo, subdistrict, district, province, postalCode, address]);

  function handleClearAddress() {
    setHouseNo('');
    setMoo('');
    setSubdistrict('');
    setDistrict('');
    setProvince('');
    setPostalCode('');
    setAddress('');
  }

  function handleDefaultAddress() {
    setSubdistrict('จริม');
    setDistrict('ท่าปลา');
    setProvince('อุตรดิตถ์');
    setPostalCode('53150');
  }

  function openCreateForm() {
    setEditingCustomer(null);
    setCustomerType('shop');
    setName('');
    setContactPerson('');
    setPhone('');
    setTaxId('');
    setBranchType('สำนักงานใหญ่');
    setZone('');
    setHouseNo('');
    setMoo('');
    setSubdistrict('จริม');
    setDistrict('ท่าปลา');
    setProvince('อุตรดิตถ์');
    setPostalCode('53150');
    setAddress('');
    setLatText('');
    setLngText('');
    setGmapsUrl('');
    setPriceTierId('');
    setPrice189Baht('15');
    setPrice350Baht('35');
    setPrice600Baht('35');
    setPrice1500Baht('35');
    setCreditTermDays('0');
    setFormError(null);
    setFormOpen(true);
  }

  function openEditForm(c: CustomerItem) {
    setEditingCustomer(c);
    setCustomerType(c.customerType);
    setName(c.name);
    setContactPerson(c.contactPerson ?? '');
    setPhone(c.phone ?? '');
    setTaxId(c.taxId ?? '');
    setBranchType(c.branchType ?? 'สำนักงานใหญ่');
    setZone(c.zone ?? '');
    setHouseNo(c.houseNo ?? '');
    setMoo(c.moo ?? '');
    setSubdistrict(c.subdistrict ?? '');
    setDistrict(c.district ?? '');
    setProvince(c.province ?? '');
    setPostalCode(c.postalCode ?? '');
    setAddress(c.address ?? '');
    setLatText(c.lat != null ? String(c.lat) : '');
    setLngText(c.lng != null ? String(c.lng) : '');
    setGmapsUrl('');
    setPriceTierId(c.priceTierId != null ? String(c.priceTierId) : '');
    setPrice189Baht(String(satangToBaht(c.prices['FG-189L'])));
    setPrice350Baht(String(satangToBaht(c.prices['FG-350ML'])));
    setPrice600Baht(String(satangToBaht(c.prices['FG-600ML'])));
    setPrice1500Baht(String(satangToBaht(c.prices['FG-1500ML'])));
    setCreditTermDays(String(c.creditTermDays ?? 0));
    setFormError(null);
    setFormOpen(true);
  }

  function handleTierChange(nextTierId: string) {
    setPriceTierId(nextTierId);
    const tier = (tiersQuery.data?.data ?? []).find((t) => String(t.id) === nextTierId);
    if (tier) {
      setPrice189Baht(String(satangToBaht(tier.price189lSat)));
      setPrice350Baht(String(satangToBaht(tier.price350mlSat)));
      setPrice600Baht(String(satangToBaht(tier.price600mlSat)));
      setPrice1500Baht(String(satangToBaht(tier.price1500mlSat)));
    }
  }

  async function handleResolveGmapsUrl() {
    if (!gmapsUrl.trim()) return;
    setResolvingUrl(true);
    setFormError(null);
    try {
      const res = await api.post<{ lat: number; lng: number }>('/customers/resolve-gmaps-url', {
        url: gmapsUrl.trim(),
      });
      setLatText(String(res.lat));
      setLngText(String(res.lng));
    } catch (err) {
      setFormError(
        err instanceof ApiError ? err.message : 'ไม่สามารถแปลงลิงก์ Google Maps เป็นพิกัดได้',
      );
    } finally {
      setResolvingUrl(false);
    }
  }

  async function handleSaveCustomer(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);

    const hasGps = latText.trim() !== '' && lngText.trim() !== '';
    if (!hasGps) {
      const confirmed = window.confirm(
        'ยังไม่ได้ระบุพิกัด GPS จะไม่ปรากฏบนแผนที่ TMS — บันทึกเลยไหม?',
      );
      if (!confirmed) {
        return;
      }
    }

    setSaving(true);
    try {
      const pricesPayload = {
        'FG-189L': bahtToSatang(price189Baht),
        'FG-350ML': bahtToSatang(price350Baht),
        'FG-600ML': bahtToSatang(price600Baht),
        'FG-1500ML': bahtToSatang(price1500Baht),
      };

      const baseBody = {
        customerType,
        name: name.trim(),
        contactPerson: contactPerson.trim() || null,
        phone: phone.trim() || null,
        taxId: taxId.trim() || null,
        branchType: branchType.trim() || null,
        zone: zone.trim() || null,
        houseNo: houseNo.trim() || null,
        moo: moo.trim() || null,
        subdistrict: subdistrict.trim() || null,
        district: district.trim() || null,
        province: province.trim() || null,
        postalCode: postalCode.trim() || null,
        address: address.trim() || null,
        lat: hasGps ? Number(latText) : null,
        lng: hasGps ? Number(lngText) : null,
        priceTierId: priceTierId ? Number(priceTierId) : null,
        creditTermDays: Number(creditTermDays || 0),
      };

      let savedCode = '';
      if (editingCustomer) {
        await api.put(`/customers/${editingCustomer.id}`, baseBody);
        await api.put(`/customers/${editingCustomer.id}/prices`, { prices: pricesPayload });
        savedCode = editingCustomer.code;
      } else {
        const res = await api.post<{ id: number; code: string }>('/customers', {
          ...baseBody,
          prices: pricesPayload,
        });
        savedCode = res.code;
      }

      setFormOpen(false);
      setPage(1);
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      if (routeCustomerId) {
        queryClient.invalidateQueries({ queryKey: ['customer-detail', routeCustomerId] });
      }
      setToastMessage(`บันทึกลูกค้า ${savedCode} สำเร็จ`);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'บันทึกข้อมูลลูกค้าไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  }

  async function handleExportExcel() {
    setExporting(true);
    try {
      const params = new URLSearchParams({ active: activeFilter });
      if (search.trim()) params.set('search', search.trim());
      if (zoneFilter.trim()) params.set('zone', zoneFilter.trim());
      if (typeFilter) params.set('type', typeFilter);
      await api.download(`/customers/export?${params.toString()}`, 'Inthara_Customers.xlsx');
    } finally {
      setExporting(false);
    }
  }

  // ==================== มุมมองหน้ารายละเอียดลูกค้า (/customers/:id) ====================
  if (routeCustomerId) {
    const detail = detailQuery.data;

    return (
      <section className="space-y-4">
        <Toast message={toastMessage} onClose={() => setToastMessage(null)} />

        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link
            to="/customers"
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            ← กลับหน้ารายชื่อลูกค้า
          </Link>

          {detail && canWrite && (
            <button
              type="button"
              onClick={() => openEditForm(detail)}
              className="rounded-lg bg-brand-700 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-600 dark:bg-brand-600 dark:hover:bg-brand-500"
            >
              แก้ไขข้อมูล / ปรับราคาเฉพาะราย
            </button>
          )}
        </div>

        {detailQuery.isPending && (
          <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-850 dark:text-slate-400">
            กำลังโหลดข้อมูลลูกค้า…
          </p>
        )}

        {detailQuery.isError && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
            ไม่พบข้อมูลลูกค้า หรือเกิดข้อผิดพลาดในการโหลดข้อมูล
          </div>
        )}

        {detail && (
          <>
            <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-850">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-brand-700 px-2.5 py-0.5 font-mono text-xs font-semibold text-white">
                      {detail.code}
                    </span>
                    <span className="rounded bg-slate-100 px-2.5 py-0.5 text-xs text-slate-700 dark:bg-slate-700 dark:text-slate-300">
                      {CUSTOMER_TYPE_LABELS[detail.customerType] ?? detail.customerType}
                    </span>
                    {detail.isActive ? (
                      <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                        ใช้งานปกติ
                      </span>
                    ) : (
                      <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700 dark:bg-red-950/50 dark:text-red-300">
                        ระงับใช้งาน
                      </span>
                    )}
                  </div>
                  <h1 className="mt-2 text-xl font-bold text-slate-800 dark:text-slate-100">
                    {detail.name}
                  </h1>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                    {detail.address ?? '-'}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3 text-right sm:grid-cols-3">
                  <div className="rounded-xl bg-amber-50 p-3 dark:bg-amber-950/30">
                    <p className="text-xs text-amber-800 dark:text-amber-300">ถัง 18.9L ค้างส่ง</p>
                    <p className="mt-1 font-mono text-lg font-bold text-amber-900 dark:text-amber-200">
                      {detail.outstandingBottles} ใบ
                    </p>
                  </div>
                  <div className="rounded-xl bg-emerald-50 p-3 dark:bg-emerald-950/30">
                    <p className="text-xs text-emerald-800 dark:text-emerald-300">
                      ยอดมัดจำ/เครดิต (Balance)
                    </p>
                    <p className="mt-1 font-mono text-lg font-bold text-emerald-900 dark:text-emerald-200">
                      {formatBaht(detail.balanceSat, true)}
                    </p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
                    <p className="text-xs text-slate-500 dark:text-slate-400">เครดิตเทอม</p>
                    <p className="mt-1 font-mono text-lg font-bold text-slate-800 dark:text-slate-100">
                      {detail.creditTermDays} วัน
                    </p>
                  </div>
                </div>
              </div>

              <dl className="mt-4 grid gap-3 border-t border-slate-100 pt-4 text-xs sm:grid-cols-4 dark:border-slate-800">
                <div>
                  <dt className="text-slate-400 dark:text-slate-500">ผู้ติดต่อ</dt>
                  <dd className="mt-0.5 font-medium text-slate-700 dark:text-slate-200">
                    {detail.contactPerson ?? '-'}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-400 dark:text-slate-500">เบอร์โทรศัพท์</dt>
                  <dd className="mt-0.5 font-mono font-medium text-slate-700 dark:text-slate-200">
                    {detail.phone ?? '-'}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-400 dark:text-slate-500">โซนจัดส่ง</dt>
                  <dd className="mt-0.5 font-medium text-slate-700 dark:text-slate-200">
                    {detail.zone ?? '-'}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-400 dark:text-slate-500">พิกัด GPS (lat, lng)</dt>
                  <dd className="mt-0.5 font-mono text-slate-700 dark:text-slate-200">
                    {detail.lat != null && detail.lng != null
                      ? `${detail.lat}, ${detail.lng}`
                      : '-'}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-850">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    ราคาเฉพาะรายต่อ SKU (อ้างอิงในใบสั่งซื้อเสมอ)
                  </h2>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    Tier: {detail.priceTierName ?? 'กำหนดเอง'}
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      ถัง 18.9 ลิตร (FG-189L)
                    </p>
                    <p className="mt-1 font-mono text-base font-bold text-brand-700 dark:text-brand-400">
                      {formatBaht(detail.prices['FG-189L'], true)}
                    </p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      แพ็ค 350 ml (FG-350ML)
                    </p>
                    <p className="mt-1 font-mono text-base font-bold text-brand-700 dark:text-brand-400">
                      {formatBaht(detail.prices['FG-350ML'], true)}
                    </p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      แพ็ค 600 ml (FG-600ML)
                    </p>
                    <p className="mt-1 font-mono text-base font-bold text-brand-700 dark:text-brand-400">
                      {formatBaht(detail.prices['FG-600ML'], true)}
                    </p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      แพ็ค 1,500 ml (FG-1500ML)
                    </p>
                    <p className="mt-1 font-mono text-base font-bold text-brand-700 dark:text-brand-400">
                      {formatBaht(detail.prices['FG-1500ML'], true)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-850">
                <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                  ประวัติการสั่งซื้อ 5 รายการล่าสุด (CRM-7)
                </h2>
                {detail.recentOrders.length === 0 ? (
                  <p className="mt-4 text-xs text-slate-400 dark:text-slate-500">
                    ยังไม่มีประวัติออเดอร์สำหรับลูกค้ารายนี้
                  </p>
                ) : (
                  <ul className="mt-3 divide-y divide-slate-100 text-xs dark:divide-slate-800">
                    {detail.recentOrders.map((ord) => (
                      <li key={ord.id} className="flex items-center justify-between py-2">
                        <div>
                          <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                            {ord.code}
                          </span>
                          <span className="ml-2 text-slate-500 dark:text-slate-400">
                            ส่งวันที่ {ord.deliveryDate}
                          </span>
                        </div>
                        <div className="font-mono font-medium text-slate-700 dark:text-slate-300">
                          {formatBaht(ord.totalSat, true)} ({ord.status})
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-850">
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                ประวัติการเปลี่ยนแปลงราคาต่อหน่วย (SRS PRC-3)
              </h2>
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-left text-xs dark:divide-slate-800">
                  <thead className="bg-slate-50 font-semibold text-slate-600 dark:bg-slate-800/80 dark:text-slate-300">
                    <tr>
                      <th className="px-3 py-2">วันที่-เวลา</th>
                      <th className="px-3 py-2">รหัสสินค้า (SKU)</th>
                      <th className="px-3 py-2 text-right">ราคาเดิม (บาท)</th>
                      <th className="px-3 py-2 text-right">ราคาใหม่ (บาท)</th>
                      <th className="px-3 py-2">ผู้แก้ไข</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {detail.priceHistory.map((h) => (
                      <tr key={h.id}>
                        <td className="px-3 py-2 font-mono text-slate-500 dark:text-slate-400">
                          {h.createdAt}
                        </td>
                        <td className="px-3 py-2 font-mono font-semibold text-slate-800 dark:text-slate-200">
                          {h.sku}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-slate-500 dark:text-slate-400">
                          {h.oldPriceSat != null ? formatBaht(h.oldPriceSat, true) : '-'}
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-semibold text-emerald-700 dark:text-emerald-400">
                          {formatBaht(h.newPriceSat, true)}
                        </td>
                        <td className="px-3 py-2 text-slate-600 dark:text-slate-300">
                          {h.changedByName || h.changedByUsername || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* สมุดบัญชีลูกค้า (Customer Ledger) & จัดการเงินมัดจำ (SRS FIN-1) */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-850">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    สมุดบัญชีลูกค้า (Customer Ledger) & เงินมัดจำ (SRS FIN-1)
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    ประวัติความเคลื่อนไหวทางการเงินทั้งหมดของลูกค้า (ตั้งหนี้, รับชำระ,
                    รับ/ใช้/คืนเงินมัดจำ)
                  </p>
                </div>
                <span className="rounded-lg bg-emerald-50 px-3 py-1.5 font-mono text-xs font-bold text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
                  มัดจำคงเหลือ: {formatBaht(detail.balanceSat, true)}
                </span>
              </div>

              {/* ฟอร์มทำรายการมัดจำด่วน */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setDepError('');
                  depositMutation.mutate();
                }}
                className="mt-4 flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs dark:border-slate-800 dark:bg-slate-800/60"
              >
                <div>
                  <label className="mb-1 block font-semibold text-slate-700 dark:text-slate-300">
                    ประเภทรายการมัดจำ
                  </label>
                  <select
                    value={depType}
                    onChange={(e) => setDepType(e.target.value as 'in' | 'use' | 'refund')}
                    className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  >
                    <option value="in">รับเงินมัดจำเพิ่ม (in)</option>
                    <option value="use">หักใช้เงินมัดจำ (use)</option>
                    <option value="refund">คืนเงินมัดจำ (refund)</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block font-semibold text-slate-700 dark:text-slate-300">
                    จำนวนเงิน (บาท)
                  </label>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                    inputMode="decimal"
                    value={depAmountBaht}
                    onChange={(e) => setDepAmountBaht(e.target.value)}
                    placeholder="0.00"
                    className="w-32 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  />
                </div>
                <div className="flex-1">
                  <label className="mb-1 block font-semibold text-slate-700 dark:text-slate-300">
                    หมายเหตุ
                  </label>
                  <input
                    type="text"
                    value={depNote}
                    onChange={(e) => setDepNote(e.target.value)}
                    placeholder="ระบุรายละเอียด..."
                    className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  />
                </div>
                <button
                  type="submit"
                  disabled={depositMutation.isPending}
                  className="rounded-lg bg-sky-600 px-4 py-1.5 font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
                >
                  {depositMutation.isPending ? 'กำลังบันทึก...' : 'บันทึกมัดจำ'}
                </button>
              </form>

              {depError && (
                <p className="mt-2 text-xs font-semibold text-rose-600 dark:text-rose-400">
                  {depError}
                </p>
              )}

              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-left text-xs dark:divide-slate-800">
                  <thead className="bg-slate-50 font-semibold text-slate-600 dark:bg-slate-800/80 dark:text-slate-300">
                    <tr>
                      <th className="px-3 py-2">วันที่-เวลา</th>
                      <th className="px-3 py-2">ประเภท (entry_type)</th>
                      <th className="px-3 py-2 text-right">จำนวนเงิน (บาท)</th>
                      <th className="px-3 py-2">เอกสารอ้างอิง</th>
                      <th className="px-3 py-2">หมายเหตุ</th>
                      <th className="px-3 py-2">ผู้บันทึก</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {(ledgerQuery.data?.items ?? []).length === 0 ? (
                      <tr>
                        <td
                          colSpan={6}
                          className="px-3 py-6 text-center text-slate-400 dark:text-slate-500"
                        >
                          ยังไม่มีรายการเคลื่อนไหวในสมุดบัญชีลูกค้า
                        </td>
                      </tr>
                    ) : (
                      (ledgerQuery.data?.items ?? []).map((l) => (
                        <tr key={l.id}>
                          <td className="px-3 py-2 font-mono text-slate-500 dark:text-slate-400">
                            {l.createdAt}
                          </td>
                          <td className="px-3 py-2 font-mono font-semibold text-slate-800 dark:text-slate-200">
                            {l.entryType}
                          </td>
                          <td
                            className={`px-3 py-2 text-right font-mono font-bold ${
                              l.entryType === 'order_debt'
                                ? 'text-rose-700 dark:text-rose-400'
                                : l.entryType === 'deposit_use' || l.entryType === 'deposit_refund'
                                  ? 'text-amber-700 dark:text-amber-400'
                                  : 'text-emerald-700 dark:text-emerald-400'
                            }`}
                          >
                            {formatBaht(l.amountSat, true)}
                          </td>
                          <td className="px-3 py-2 font-mono text-slate-600 dark:text-slate-400">
                            {l.refType && l.refId ? `${l.refType}: ${l.refId}` : '-'}
                          </td>
                          <td className="px-3 py-2 text-slate-600 dark:text-slate-400">
                            {l.note || '-'}
                          </td>
                          <td className="px-3 py-2 text-slate-600 dark:text-slate-400">
                            {l.createdByName || '-'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </section>
    );
  }

  // ==================== มุมมองตารางทะเบียนลูกค้า (/customers) ====================
  const customers = listQuery.data?.data ?? [];
  const pagination = listQuery.data?.pagination;

  return (
    <section className="space-y-4">
      <Toast message={toastMessage} onClose={() => setToastMessage(null)} />

      {/* Datalist สำหรับ autocomplete โซน */}
      <datalist id="customer-zones-list">
        {existingZones.map((z) => (
          <option key={z} value={z} />
        ))}
      </datalist>

      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800 dark:text-slate-100">
            {moduleMeta.label}
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">{moduleMeta.description}</p>
        </div>
        <span className="rounded-full bg-slate-200 px-3 py-1 font-mono text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          {moduleMeta.code} · SRS §{moduleMeta.srsSection}
        </span>
      </header>

      <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-850">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="ค้นหาชื่อลูกค้า หรือรหัส CUS-…"
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500"
            />
            <input
              type="text"
              list="customer-zones-list"
              value={zoneFilter}
              onChange={(e) => {
                setZoneFilter(e.target.value);
                setPage(1);
              }}
              placeholder="กรองตามโซน…"
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500"
            />
            <select
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value);
                setPage(1);
              }}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="">ทุกประเภทลูกค้า</option>
              <option value="person">บุคคลทั่วไป (person)</option>
              <option value="shop">ร้านค้า (shop)</option>
              <option value="organization">หน่วยงาน/องค์กร (organization)</option>
            </select>
            <select
              value={activeFilter}
              onChange={(e) => {
                setActiveFilter(e.target.value as '1' | '0' | 'all');
                setPage(1);
              }}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="1">เฉพาะที่ใช้งานอยู่ (Active)</option>
              <option value="0">เฉพาะที่ระงับ (Inactive)</option>
              <option value="all">ทั้งหมด</option>
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canWrite && (
              <button
                type="button"
                disabled={exporting}
                onClick={handleExportExcel}
                className="rounded-lg border border-emerald-600 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-950/70"
              >
                {exporting ? 'กำลังส่งออก…' : 'Export Excel (.xlsx)'}
              </button>
            )}
            {canWrite && (
              <button
                type="button"
                onClick={openCreateForm}
                className="rounded-lg bg-brand-700 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-600 dark:bg-brand-600 dark:hover:bg-brand-500 shadow-sm"
              >
                + เพิ่มลูกค้าใหม่
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm dark:divide-slate-800">
            <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-600 dark:bg-slate-800/80 dark:text-slate-300">
              <tr>
                <th className="px-3 py-2">รหัส</th>
                <th className="px-3 py-2">ชื่อลูกค้า / ร้านค้า</th>
                <th className="px-3 py-2">ประเภท</th>
                <th className="px-3 py-2">โซนจัดส่ง</th>
                <th className="px-3 py-2">โทรศัพท์</th>
                <th className="px-3 py-2 text-right">18.9L (฿)</th>
                <th className="px-3 py-2 text-right">ถังค้าง</th>
                <th className="px-3 py-2 text-right">มัดจำ/เครดิต</th>
                <th className="px-3 py-2">สถานะ</th>
                <th className="px-3 py-2 text-right">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {customers.length === 0 ? (
                <tr>
                  <td
                    colSpan={10}
                    className="px-3 py-8 text-center text-sm text-slate-400 dark:text-slate-500"
                  >
                    ไม่พบข้อมูลลูกค้าตามเงื่อนไขที่ค้นหา
                  </td>
                </tr>
              ) : (
                customers.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="px-3 py-2 font-mono text-xs font-semibold text-brand-700 dark:text-brand-400">
                      <Link to={`/customers/${c.id}`} className="hover:underline">
                        {c.code}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      <Link
                        to={`/customers/${c.id}`}
                        className="font-medium text-slate-800 hover:text-brand-700 hover:underline dark:text-slate-200 dark:hover:text-brand-400"
                      >
                        {c.name}
                      </Link>
                      {c.address && (
                        <p className="max-w-xs truncate text-xs text-slate-400 dark:text-slate-500">
                          {c.address}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-400">
                      {CUSTOMER_TYPE_LABELS[c.customerType] ?? c.customerType}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-400">
                      {c.zone ?? '-'}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-600 dark:text-slate-400">
                      {c.phone ?? '-'}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs font-semibold text-slate-700 dark:text-slate-300">
                      {formatBaht(c.prices['FG-189L'])}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs text-amber-800 dark:text-amber-300">
                      {c.outstandingBottles}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs text-emerald-700 dark:text-emerald-400">
                      {formatBaht(c.balanceSat)}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {c.isActive ? (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                          ใช้งาน
                        </span>
                      ) : (
                        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-slate-600 dark:bg-slate-700 dark:text-slate-400">
                          ระงับ
                        </span>
                      )}
                    </td>
                    <td className="space-x-1.5 whitespace-nowrap px-3 py-2 text-right text-xs">
                      <Link
                        to={`/customers/${c.id}`}
                        className="rounded border border-slate-200 px-2 py-1 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                      >
                        รายละเอียด
                      </Link>
                      {canWrite && (
                        <button
                          type="button"
                          onClick={() => openEditForm(c)}
                          className="rounded border border-slate-200 px-2 py-1 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                        >
                          แก้ไข
                        </button>
                      )}
                      {isAdmin && c.isActive && (
                        <button
                          type="button"
                          onClick={() => deleteMutation.mutate(c.id)}
                          className="rounded border border-red-200 bg-red-50 px-2 py-1 text-red-700 hover:bg-red-100 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-950/70"
                        >
                          ระงับ
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {pagination && (
          <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-600 dark:border-slate-800 dark:text-slate-400">
            <span>
              หน้า {pagination.page} จาก {pagination.totalPages} (รวมทั้งหมด {pagination.total}{' '}
              ราย · 50 รายการ/หน้า)
            </span>
            <div className="space-x-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded border border-slate-200 px-3 py-1 disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                ก่อนหน้า
              </button>
              <button
                type="button"
                disabled={page >= pagination.totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="rounded border border-slate-200 px-3 py-1 disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                ถัดไป
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal ฟอร์มสร้าง/แก้ไขลูกค้า (แบ่ง 4 กล่องชัดเจน + Leaflet ปักหมุด + Sticky Bar) */}
      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">
                {editingCustomer
                  ? `แก้ไขข้อมูลลูกค้า [${editingCustomer.code}] ${editingCustomer.name}`
                  : 'ลงทะเบียนลูกค้าใหม่ (ระบบออกรหัส CUS-#### อัตโนมัติ)'}
              </h2>
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              >
                ✕ ปิด
              </button>
            </div>

            <form onSubmit={handleSaveCustomer} className="mt-4 space-y-5 text-sm">
              {formError && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
                  {formError}
                </div>
              )}

              {/* ① ส่วนข้อมูลลูกค้า */}
              <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/40">
                <div className="flex items-center gap-2 border-b border-slate-200/60 pb-2 dark:border-slate-700/60">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-700 text-[11px] font-bold text-white">
                    1
                  </span>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                    ข้อมูลทั่วไปและข้อมูลติดต่อ
                  </h3>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                      ประเภทลูกค้า
                    </label>
                    <select
                      value={customerType}
                      onChange={(e) => setCustomerType(e.target.value as CustomerType)}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    >
                      <option value="shop">ร้านค้า (shop)</option>
                      <option value="person">บุคคลทั่วไป (person)</option>
                      <option value="organization">หน่วยงาน/องค์กร (organization)</option>
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                      ชื่อลูกค้า / ร้านค้า / หน่วยงาน *
                    </label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="เช่น ร้านสมบูรณ์การค้า, นายสมเกียรติ พรหมดี"
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500"
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                      ผู้ติดต่อ
                    </label>
                    <input
                      type="text"
                      value={contactPerson}
                      onChange={(e) => setContactPerson(e.target.value)}
                      placeholder="ชื่อผู้ประสานงาน"
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                      เบอร์โทรศัพท์
                    </label>
                    <input
                      type="tel"
                      inputMode="numeric"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="08XXXXXXXX"
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                      เลขประจำตัวผู้เสียภาษี (Tax ID)
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={13}
                      pattern="[0-9]*"
                      value={taxId}
                      onChange={(e) => setTaxId(e.target.value)}
                      placeholder="13 หลัก (ถ้ามี)"
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                      สาขา
                    </label>
                    <input
                      type="text"
                      value={branchType}
                      onChange={(e) => setBranchType(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                  </div>
                </div>
              </div>

              {/* ② ส่วนที่อยู่จัดส่ง */}
              <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/40">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/60 pb-2 dark:border-slate-700/60">
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-700 text-[11px] font-bold text-white">
                      2
                    </span>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                      ที่อยู่จัดส่ง (มาตรฐานไทย)
                    </h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleDefaultAddress}
                      className="text-xs font-medium text-brand-700 hover:underline dark:text-brand-400"
                    >
                      ใช้ที่อยู่เริ่มต้น (จริม ท่าปลา)
                    </button>
                    <span className="text-slate-300 dark:text-slate-600">|</span>
                    <button
                      type="button"
                      onClick={handleClearAddress}
                      className="text-xs font-medium text-rose-600 hover:underline dark:text-rose-400"
                    >
                      ล้างที่อยู่
                    </button>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-6">
                  <div>
                    <label className="block text-xs text-slate-600 dark:text-slate-400">
                      บ้านเลขที่
                    </label>
                    <input
                      type="text"
                      value={houseNo}
                      onChange={(e) => setHouseNo(e.target.value)}
                      placeholder="99/1"
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 dark:text-slate-400">หมู่ที่</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={moo}
                      onChange={(e) => setMoo(e.target.value)}
                      placeholder="1"
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 dark:text-slate-400">
                      ตำบล/แขวง
                    </label>
                    <input
                      type="text"
                      value={subdistrict}
                      onChange={(e) => setSubdistrict(e.target.value)}
                      placeholder="จริม"
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 dark:text-slate-400">
                      อำเภอ/เขต
                    </label>
                    <input
                      type="text"
                      value={district}
                      onChange={(e) => setDistrict(e.target.value)}
                      placeholder="ท่าปลา"
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 dark:text-slate-400">จังหวัด</label>
                    <input
                      type="text"
                      value={province}
                      onChange={(e) => setProvince(e.target.value)}
                      placeholder="อุตรดิตถ์"
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 dark:text-slate-400">
                      รหัสไปรษณีย์
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={5}
                      pattern="[0-9]*"
                      value={postalCode}
                      onChange={(e) => setPostalCode(e.target.value)}
                      placeholder="53150"
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <label className="block text-xs text-slate-600 dark:text-slate-400">
                      โซนสายส่ง (Zone)
                    </label>
                    <input
                      type="text"
                      list="customer-zones-list"
                      value={zone}
                      onChange={(e) => setZone(e.target.value)}
                      placeholder="เลือกจากรายการหรือพิมพ์โซนใหม่…"
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs text-slate-600 dark:text-slate-400">
                      ที่อยู่รวม / จุดสังเกตเพิ่มเติม
                    </label>
                    <input
                      type="text"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="เช่น ตรงข้ามวัดจริม, ใกล้ อบต.จริม"
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500"
                    />
                  </div>
                </div>

                {/* Live Address Preview Box */}
                <div className="rounded-lg border border-slate-200 bg-white p-2.5 text-xs dark:border-slate-700 dark:bg-slate-900/70">
                  <span className="font-semibold text-slate-500 dark:text-slate-400">
                    Live Address Preview:{' '}
                  </span>
                  <span className="text-slate-800 dark:text-slate-200">{liveAddressPreview}</span>
                </div>
              </div>

              {/* ③ ส่วนราคาต่อหน่วยและระดับราคา */}
              <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/40">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/60 pb-2 dark:border-slate-700/60">
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-700 text-[11px] font-bold text-white">
                      3
                    </span>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                      ระดับราคาและราคาเฉพาะราย 4 SKU
                    </h3>
                  </div>

                  {/* ป้ายกำกับสถานะราคา */}
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-[11px] ${priceStatus.badgeClass}`}
                  >
                    {priceStatus.label}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    เลือกระดับราคา (Price Tier):
                  </label>
                  <select
                    value={priceTierId}
                    onChange={(e) => handleTierChange(e.target.value)}
                    className="min-w-[220px] rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  >
                    <option value="">-- กำหนดราคาเอง / ไม่ระบุ Tier --</option>
                    {(tiersQuery.data?.data ?? []).map((t) => (
                      <option key={t.id} value={String(t.id)}>
                        {t.name} (18.9L: {satangToBaht(t.price189lSat)}฿)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                  <div>
                    <label className="block text-xs text-slate-600 dark:text-slate-400">
                      ถัง 18.9L (บาท) *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      inputMode="decimal"
                      value={price189Baht}
                      onChange={(e) => setPrice189Baht(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 dark:text-slate-400">
                      แพ็ค 350ml (บาท) *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      inputMode="decimal"
                      value={price350Baht}
                      onChange={(e) => setPrice350Baht(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 dark:text-slate-400">
                      แพ็ค 600ml (บาท) *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      inputMode="decimal"
                      value={price600Baht}
                      onChange={(e) => setPrice600Baht(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 dark:text-slate-400">
                      แพ็ค 1500ml (บาท) *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      inputMode="decimal"
                      value={price1500Baht}
                      onChange={(e) => setPrice1500Baht(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 dark:text-slate-400">
                      เครดิตเทอม (วัน)
                    </label>
                    <input
                      type="number"
                      min="0"
                      inputMode="numeric"
                      value={creditTermDays}
                      onChange={(e) => setCreditTermDays(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                  </div>
                </div>
              </div>

              {/* ④ ส่วนพิกัด GPS จัดส่ง */}
              <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/40">
                <div className="flex items-center gap-2 border-b border-slate-200/60 pb-2 dark:border-slate-700/60">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-700 text-[11px] font-bold text-white">
                    4
                  </span>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                    พิกัด GPS จัดส่ง (ค้นหา/วางลิงก์ Google Maps หรือคลิกบนแผนที่)
                  </h3>
                </div>

                <div className="flex flex-wrap gap-2">
                  <input
                    type="url"
                    value={gmapsUrl}
                    onChange={(e) => setGmapsUrl(e.target.value)}
                    placeholder="วางลิงก์ Google Maps เช่น https://maps.app.goo.gl/… หรือ google.com/maps…"
                    className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500"
                  />
                  <button
                    type="button"
                    disabled={resolvingUrl || !gmapsUrl.trim()}
                    onClick={handleResolveGmapsUrl}
                    className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-50 dark:bg-slate-700 dark:hover:bg-slate-600"
                  >
                    {resolvingUrl ? 'กำลังแปลงลิงก์…' : 'แปลงลิงก์ Google Maps'}
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-600 dark:text-slate-400">
                      Latitude
                    </label>
                    <input
                      type="number"
                      step="any"
                      inputMode="decimal"
                      value={latText}
                      onChange={(e) => setLatText(e.target.value)}
                      placeholder="17.XXXXXX (เว้นว่างได้)"
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 dark:text-slate-400">
                      Longitude
                    </label>
                    <input
                      type="number"
                      step="any"
                      inputMode="decimal"
                      value={lngText}
                      onChange={(e) => setLngText(e.target.value)}
                      placeholder="100.XXXXXX (เว้นว่างได้)"
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500"
                    />
                  </div>
                </div>

                <LeafletPinPicker
                  lat={latText.trim() !== '' ? Number(latText) : null}
                  lng={lngText.trim() !== '' ? Number(lngText) : null}
                  onChange={(nextLat, nextLng) => {
                    setLatText(String(nextLat));
                    setLngText(String(nextLng));
                  }}
                  onClear={() => {
                    setLatText('');
                    setLngText('');
                  }}
                />
              </div>

              {/* Sticky Action Bar ด้านล่าง ไม่ต้องเลื่อนจอหา */}
              <div className="sticky bottom-0 -mx-6 -mb-6 mt-6 flex items-center justify-end gap-3 rounded-b-2xl border-t border-slate-200 bg-white/95 px-6 py-3.5 shadow-lg backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-brand-700 px-5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-brand-600 disabled:opacity-50 dark:bg-brand-600 dark:hover:bg-brand-500"
                >
                  {saving
                    ? 'กำลังบันทึก…'
                    : editingCustomer
                      ? 'บันทึกการแก้ไข'
                      : 'บันทึกข้อมูลลูกค้า'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
