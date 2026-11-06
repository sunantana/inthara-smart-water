import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ApiError, api } from '../../api/client';
import { useAuthSession } from '../../lib/auth';
import { findModule } from '../../lib/modules';
import { bahtToSatang, formatBaht, satangToBaht } from '../../lib/money';
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

const DEFAULT_FACTORY_COORDS: [number, number] = [17.7915, 100.3782];

interface LeafletPinPickerProps {
  lat: number | null;
  lng: number | null;
  onChange: (lat: number, lng: number) => void;
}

function LeafletPinPicker({ lat, lng, onChange }: LeafletPinPickerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.CircleMarker | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const initialCenter: [number, number] =
      lat !== null && lng !== null ? [lat, lng] : DEFAULT_FACTORY_COORDS;

    const map = L.map(containerRef.current, { center: initialCenter, zoom: 13 });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors',
    }).addTo(map);

    const marker = L.circleMarker(initialCenter, {
      radius: 9,
      color: '#0f766e',
      fillColor: '#14b8a6',
      fillOpacity: 0.9,
      weight: 2,
    }).addTo(map);

    map.on('click', (ev: L.LeafletMouseEvent) => {
      const nextLat = Number(ev.latlng.lat.toFixed(6));
      const nextLng = Number(ev.latlng.lng.toFixed(6));
      marker.setLatLng([nextLat, nextLng]);
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
    if (!mapRef.current || !markerRef.current) return;
    if (lat !== null && lng !== null && Number.isFinite(lat) && Number.isFinite(lng)) {
      markerRef.current.setLatLng([lat, lng]);
      mapRef.current.setView([lat, lng], mapRef.current.getZoom());
    }
  }, [lat, lng]);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200">
      <div ref={containerRef} className="h-56 w-full" />
      <p className="bg-slate-50 px-3 py-1.5 text-[11px] text-slate-500">
        คลิกบนแผนที่เพื่อปักหมุดพิกัดร้านค้า หรือวางลิงก์ Google Maps ด้านบนแล้วกดแปลงลิงก์
      </p>
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

  // Modal สร้าง/แก้ไขลูกค้า
  const [formOpen, setFormOpen] = useState(false);
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
  const [latText, setLatText] = useState('17.7915');
  const [lngText, setLngText] = useState('100.3782');
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

  function openCreateForm() {
    setEditingCustomer(null);
    setCustomerType('shop');
    setName('');
    setContactPerson('');
    setPhone('');
    setTaxId('');
    setBranchType('สำนักงานใหญ่');
    setZone('โซนท่าปลา - ต.จริม');
    setHouseNo('');
    setMoo('');
    setSubdistrict('จริม');
    setDistrict('ท่าปลา');
    setProvince('อุตรดิตถ์');
    setPostalCode('53150');
    setAddress('');
    setLatText('17.7915');
    setLngText('100.3782');
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
        lat: latText.trim() !== '' ? Number(latText) : null,
        lng: lngText.trim() !== '' ? Number(lngText) : null,
        priceTierId: priceTierId ? Number(priceTierId) : null,
        creditTermDays: Number(creditTermDays || 0),
      };

      if (editingCustomer) {
        await api.put(`/customers/${editingCustomer.id}`, baseBody);
        await api.put(`/customers/${editingCustomer.id}/prices`, { prices: pricesPayload });
      } else {
        await api.post('/customers', {
          ...baseBody,
          prices: pricesPayload,
        });
      }

      setFormOpen(false);
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      if (routeCustomerId) {
        queryClient.invalidateQueries({ queryKey: ['customer-detail', routeCustomerId] });
      }
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'บันทึกข้อมูลลูกค้าไม่สำเร็จ');
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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link
            to="/customers"
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            ← กลับหน้ารายชื่อลูกค้า
          </Link>

          {detail && canWrite && (
            <button
              type="button"
              onClick={() => openEditForm(detail)}
              className="rounded-lg bg-brand-700 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-600"
            >
              แก้ไขข้อมูล / ปรับราคาเฉพาะราย
            </button>
          )}
        </div>

        {detailQuery.isPending && (
          <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
            กำลังโหลดข้อมูลลูกค้า…
          </p>
        )}

        {detailQuery.isError && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            ไม่พบข้อมูลลูกค้า หรือเกิดข้อผิดพลาดในการโหลดข้อมูล
          </div>
        )}

        {detail && (
          <>
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-brand-700 px-2.5 py-0.5 font-mono text-xs font-semibold text-white">
                      {detail.code}
                    </span>
                    <span className="rounded bg-slate-100 px-2.5 py-0.5 text-xs text-slate-700">
                      {CUSTOMER_TYPE_LABELS[detail.customerType] ?? detail.customerType}
                    </span>
                    {detail.isActive ? (
                      <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                        ใช้งานปกติ
                      </span>
                    ) : (
                      <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">
                        ระงับใช้งาน
                      </span>
                    )}
                  </div>
                  <h1 className="mt-2 text-xl font-bold text-slate-800">{detail.name}</h1>
                  <p className="mt-1 text-sm text-slate-600">{detail.address ?? '-'}</p>
                </div>

                <div className="grid grid-cols-2 gap-3 text-right sm:grid-cols-3">
                  <div className="rounded-xl bg-amber-50 p-3">
                    <p className="text-xs text-amber-800">ถัง 18.9L ค้างส่ง</p>
                    <p className="mt-1 font-mono text-lg font-bold text-amber-900">
                      {detail.outstandingBottles} ใบ
                    </p>
                  </div>
                  <div className="rounded-xl bg-emerald-50 p-3">
                    <p className="text-xs text-emerald-800">ยอดมัดจำ/เครดิต (Balance)</p>
                    <p className="mt-1 font-mono text-lg font-bold text-emerald-900">
                      {formatBaht(detail.balanceSat, true)}
                    </p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">เครดิตเทอม</p>
                    <p className="mt-1 font-mono text-lg font-bold text-slate-800">
                      {detail.creditTermDays} วัน
                    </p>
                  </div>
                </div>
              </div>

              <dl className="mt-4 grid gap-3 border-t border-slate-100 pt-4 text-xs sm:grid-cols-4">
                <div>
                  <dt className="text-slate-400">ผู้ติดต่อ</dt>
                  <dd className="mt-0.5 font-medium text-slate-700">
                    {detail.contactPerson ?? '-'}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-400">เบอร์โทรศัพท์</dt>
                  <dd className="mt-0.5 font-mono font-medium text-slate-700">
                    {detail.phone ?? '-'}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-400">โซนจัดส่ง</dt>
                  <dd className="mt-0.5 font-medium text-slate-700">{detail.zone ?? '-'}</dd>
                </div>
                <div>
                  <dt className="text-slate-400">พิกัด GPS (lat, lng)</dt>
                  <dd className="mt-0.5 font-mono text-slate-700">
                    {detail.lat != null && detail.lng != null
                      ? `${detail.lat}, ${detail.lng}`
                      : '-'}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-slate-800">
                    ราคาเฉพาะรายต่อ SKU (อ้างอิงในใบสั่งซื้อเสมอ)
                  </h2>
                  <span className="text-xs text-slate-500">
                    Tier: {detail.priceTierName ?? 'กำหนดเอง'}
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">ถัง 18.9 ลิตร (FG-189L)</p>
                    <p className="mt-1 font-mono text-base font-bold text-brand-700">
                      {formatBaht(detail.prices['FG-189L'], true)}
                    </p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">แพ็ค 350 ml (FG-350ML)</p>
                    <p className="mt-1 font-mono text-base font-bold text-brand-700">
                      {formatBaht(detail.prices['FG-350ML'], true)}
                    </p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">แพ็ค 600 ml (FG-600ML)</p>
                    <p className="mt-1 font-mono text-base font-bold text-brand-700">
                      {formatBaht(detail.prices['FG-600ML'], true)}
                    </p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">แพ็ค 1,500 ml (FG-1500ML)</p>
                    <p className="mt-1 font-mono text-base font-bold text-brand-700">
                      {formatBaht(detail.prices['FG-1500ML'], true)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <h2 className="text-sm font-semibold text-slate-800">
                  ประวัติการสั่งซื้อ 5 รายการล่าสุด (CRM-7)
                </h2>
                {detail.recentOrders.length === 0 ? (
                  <p className="mt-4 text-xs text-slate-400">
                    ยังไม่มีประวัติออเดอร์สำหรับลูกค้ารายนี้
                  </p>
                ) : (
                  <ul className="mt-3 divide-y divide-slate-100 text-xs">
                    {detail.recentOrders.map((ord) => (
                      <li key={ord.id} className="flex items-center justify-between py-2">
                        <div>
                          <span className="font-mono font-semibold text-slate-800">{ord.code}</span>
                          <span className="ml-2 text-slate-500">ส่งวันที่ {ord.deliveryDate}</span>
                        </div>
                        <div className="font-mono font-medium text-slate-700">
                          {formatBaht(ord.totalSat, true)} ({ord.status})
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="text-sm font-semibold text-slate-800">
                ประวัติการเปลี่ยนแปลงราคาต่อหน่วย (SRS PRC-3)
              </h2>
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                  <thead className="bg-slate-50 font-semibold text-slate-600">
                    <tr>
                      <th className="px-3 py-2">วันที่-เวลา</th>
                      <th className="px-3 py-2">รหัสสินค้า (SKU)</th>
                      <th className="px-3 py-2 text-right">ราคาเดิม (บาท)</th>
                      <th className="px-3 py-2 text-right">ราคาใหม่ (บาท)</th>
                      <th className="px-3 py-2">ผู้แก้ไข</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {detail.priceHistory.map((h) => (
                      <tr key={h.id}>
                        <td className="px-3 py-2 font-mono text-slate-500">{h.createdAt}</td>
                        <td className="px-3 py-2 font-mono font-semibold text-slate-800">
                          {h.sku}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-slate-500">
                          {h.oldPriceSat != null ? formatBaht(h.oldPriceSat, true) : '-'}
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-semibold text-emerald-700">
                          {formatBaht(h.newPriceSat, true)}
                        </td>
                        <td className="px-3 py-2 text-slate-600">
                          {h.changedByName || h.changedByUsername || '-'}
                        </td>
                      </tr>
                    ))}
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
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">{moduleMeta.label}</h1>
          <p className="text-sm text-slate-600">{moduleMeta.description}</p>
        </div>
        <span className="rounded-full bg-slate-200 px-3 py-1 font-mono text-xs text-slate-600">
          {moduleMeta.code} · SRS §{moduleMeta.srsSection}
        </span>
      </header>

      <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
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
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            />
            <input
              type="text"
              value={zoneFilter}
              onChange={(e) => {
                setZoneFilter(e.target.value);
                setPage(1);
              }}
              placeholder="กรองตามโซน (เช่น โซนท่าปลา - ต.จริม)…"
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            />
            <select
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value);
                setPage(1);
              }}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
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
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
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
                className="rounded-lg border border-emerald-600 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
              >
                {exporting ? 'กำลังส่งออก…' : 'Export Excel (.xlsx)'}
              </button>
            )}
            {canWrite && (
              <button
                type="button"
                onClick={openCreateForm}
                className="rounded-lg bg-brand-700 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-600"
              >
                + เพิ่มลูกค้าใหม่
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-600">
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
            <tbody className="divide-y divide-slate-100">
              {customers.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-3 py-8 text-center text-sm text-slate-400">
                    ไม่พบข้อมูลลูกค้าตามเงื่อนไขที่ค้นหา
                  </td>
                </tr>
              ) : (
                customers.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2 font-mono text-xs font-semibold text-brand-700">
                      <Link to={`/customers/${c.id}`} className="hover:underline">
                        {c.code}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      <Link
                        to={`/customers/${c.id}`}
                        className="font-medium text-slate-800 hover:text-brand-700 hover:underline"
                      >
                        {c.name}
                      </Link>
                      {c.address && (
                        <p className="max-w-xs truncate text-xs text-slate-400">{c.address}</p>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-600">
                      {CUSTOMER_TYPE_LABELS[c.customerType] ?? c.customerType}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-600">{c.zone ?? '-'}</td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-600">
                      {c.phone ?? '-'}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs font-semibold text-slate-700">
                      {formatBaht(c.prices['FG-189L'])}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs text-amber-800">
                      {c.outstandingBottles}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs text-emerald-700">
                      {formatBaht(c.balanceSat)}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {c.isActive ? (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700">
                          ใช้งาน
                        </span>
                      ) : (
                        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-slate-600">
                          ระงับ
                        </span>
                      )}
                    </td>
                    <td className="space-x-1.5 whitespace-nowrap px-3 py-2 text-right text-xs">
                      <Link
                        to={`/customers/${c.id}`}
                        className="rounded border border-slate-200 px-2 py-1 text-slate-700 hover:bg-slate-100"
                      >
                        รายละเอียด
                      </Link>
                      {canWrite && (
                        <button
                          type="button"
                          onClick={() => openEditForm(c)}
                          className="rounded border border-slate-200 px-2 py-1 text-slate-700 hover:bg-slate-100"
                        >
                          แก้ไข
                        </button>
                      )}
                      {isAdmin && c.isActive && (
                        <button
                          type="button"
                          onClick={() => deleteMutation.mutate(c.id)}
                          className="rounded border border-red-200 bg-red-50 px-2 py-1 text-red-700 hover:bg-red-100"
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
          <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-600">
            <span>
              หน้า {pagination.page} จาก {pagination.totalPages} (รวมทั้งหมด {pagination.total}{' '}
              ราย · 50 รายการ/หน้า)
            </span>
            <div className="space-x-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded border border-slate-200 px-3 py-1 disabled:opacity-40"
              >
                ก่อนหน้า
              </button>
              <button
                type="button"
                disabled={page >= pagination.totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="rounded border border-slate-200 px-3 py-1 disabled:opacity-40"
              >
                ถัดไป
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal ฟอร์มสร้าง/แก้ไขลูกค้า + ที่อยู่ไทยครบ field + ปักหมุด Leaflet + แปลงลิงก์ Google Maps */}
      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/50 p-4">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-base font-semibold text-slate-800">
                {editingCustomer
                  ? `แก้ไขข้อมูลลูกค้า [${editingCustomer.code}] ${editingCustomer.name}`
                  : 'ลงทะเบียนลูกค้าใหม่ (ระบบออกรหัส CUS-#### อัตโนมัติ)'}
              </h2>
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="text-xs text-slate-400 hover:text-slate-600"
              >
                ปิด
              </button>
            </div>

            <form onSubmit={handleSaveCustomer} className="mt-4 space-y-4 text-sm">
              {formError && (
                <div className="rounded-lg bg-red-50 p-3 text-xs text-red-700">{formError}</div>
              )}

              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700">ประเภทลูกค้า</label>
                  <select
                    value={customerType}
                    onChange={(e) => setCustomerType(e.target.value as CustomerType)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  >
                    <option value="shop">ร้านค้า (shop)</option>
                    <option value="person">บุคคลทั่วไป (person)</option>
                    <option value="organization">หน่วยงาน/องค์กร (organization)</option>
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700">
                    ชื่อลูกค้า / ร้านค้า / หน่วยงาน *
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700">ผู้ติดต่อ</label>
                  <input
                    type="text"
                    value={contactPerson}
                    onChange={(e) => setContactPerson(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">โทรศัพท์</label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">
                    เลขผู้เสียภาษี (Tax ID)
                  </label>
                  <input
                    type="text"
                    value={taxId}
                    onChange={(e) => setTaxId(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">สาขา</label>
                  <input
                    type="text"
                    value={branchType}
                    onChange={(e) => setBranchType(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </div>
              </div>

              {/* ที่อยู่ไทยครบ field ตาม CRM-1 */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                <p className="mb-2 text-xs font-semibold text-slate-700">
                  ที่อยู่จัดส่งมาตรฐานไทย (CRM-1)
                </p>
                <div className="grid gap-3 sm:grid-cols-6">
                  <div>
                    <label className="block text-xs text-slate-600">บ้านเลขที่</label>
                    <input
                      type="text"
                      value={houseNo}
                      onChange={(e) => setHouseNo(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600">หมู่ที่</label>
                    <input
                      type="text"
                      value={moo}
                      onChange={(e) => setMoo(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600">ตำบล/แขวง</label>
                    <input
                      type="text"
                      value={subdistrict}
                      onChange={(e) => setSubdistrict(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600">อำเภอ/เขต</label>
                    <input
                      type="text"
                      value={district}
                      onChange={(e) => setDistrict(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600">จังหวัด</label>
                    <input
                      type="text"
                      value={province}
                      onChange={(e) => setProvince(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600">รหัสไปรษณีย์</label>
                    <input
                      type="text"
                      value={postalCode}
                      onChange={(e) => setPostalCode(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono"
                    />
                  </div>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <div>
                    <label className="block text-xs text-slate-600">โซนสายส่ง (Zone)</label>
                    <input
                      type="text"
                      value={zone}
                      onChange={(e) => setZone(e.target.value)}
                      placeholder="เว้นว่างเพื่อให้สร้างตามตำบลอัตโนมัติ"
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs text-slate-600">
                      ที่อยู่รวม / จุดสังเกตเพิ่มเติม
                    </label>
                    <input
                      type="text"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="เว้นว่างเพื่อประกอบจากบ้านเลขที่/หมู่/ตำบลอัตโนมัติ"
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5"
                    />
                  </div>
                </div>
              </div>

              {/* ราคาต่อหน่วย 4 SKU (บาท -> แปลง satang ตอนส่ง) */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-slate-700">
                    ระดับราคา (Price Tier) และราคาเฉพาะราย 4 SKU (บาท/หน่วย)
                  </p>
                  <select
                    value={priceTierId}
                    onChange={(e) => handleTierChange(e.target.value)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs"
                  >
                    <option value="">-- กำหนดราคาเอง / เลือก Price Tier --</option>
                    {(tiersQuery.data?.data ?? []).map((t) => (
                      <option key={t.id} value={String(t.id)}>
                        {t.name} (18.9L: {satangToBaht(t.price189lSat)}฿)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-5">
                  <div>
                    <label className="block text-xs text-slate-600">ถัง 18.9L (บาท)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      value={price189Baht}
                      onChange={(e) => setPrice189Baht(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600">แพ็ค 350ml (บาท)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      value={price350Baht}
                      onChange={(e) => setPrice350Baht(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600">แพ็ค 600ml (บาท)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      value={price600Baht}
                      onChange={(e) => setPrice600Baht(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600">แพ็ค 1500ml (บาท)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      value={price1500Baht}
                      onChange={(e) => setPrice1500Baht(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600">เครดิตเทอม (วัน)</label>
                    <input
                      type="number"
                      min="0"
                      value={creditTermDays}
                      onChange={(e) => setCreditTermDays(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* พิกัดแผนที่ Leaflet + แปลงลิงก์ Google Maps (CRM-2) */}
              <div className="space-y-2 rounded-xl border border-slate-200 p-3">
                <p className="text-xs font-semibold text-slate-700">
                  พิกัด GPS จัดส่ง (ปักหมุดบนแผนที่ หรือแปลงจากลิงก์ Google Maps)
                </p>
                <div className="flex flex-wrap gap-2">
                  <input
                    type="url"
                    value={gmapsUrl}
                    onChange={(e) => setGmapsUrl(e.target.value)}
                    placeholder="วางลิงก์ Google Maps หรือลิงก์สั้น https://maps.app.goo.gl/…"
                    className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
                  />
                  <button
                    type="button"
                    disabled={resolvingUrl || !gmapsUrl.trim()}
                    onClick={handleResolveGmapsUrl}
                    className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-50"
                  >
                    {resolvingUrl ? 'กำลังแปลงลิงก์…' : 'แปลงลิงก์ Google Maps'}
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-600">Latitude</label>
                    <input
                      type="number"
                      step="any"
                      value={latText}
                      onChange={(e) => setLatText(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600">Longitude</label>
                    <input
                      type="number"
                      step="any"
                      value={lngText}
                      onChange={(e) => setLngText(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 font-mono text-xs"
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
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-600"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-brand-700 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-600"
                >
                  บันทึกข้อมูลลูกค้า
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
