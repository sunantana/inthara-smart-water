import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../api/client';
import { useAuthSession } from '../../lib/auth';

interface CustomerListItem {
  id: number;
  code: string;
  name: string;
  phone: string;
  zone: string;
  isActive: number | boolean;
}

interface CustomersApiResponse {
  items: CustomerListItem[];
  total: number;
}

interface PortalAccessStatus {
  customerId: number;
  customerCode: string;
  customerName: string;
  registered: boolean;
  enabled: boolean;
  failedAttempts: number;
  lockUntil: string | null;
  registeredAt: string | null;
  isLocked: boolean;
  lockMinutesRemaining: number;
}

export default function PortalAdminPage() {
  const { user } = useAuthSession();
  const queryClient = useQueryClient();
  const canManage = user?.role === 'admin' || user?.role === 'manager';

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerListItem | null>(null);

  // Modal / action state
  const [pinInput, setPinInput] = useState('');
  const [actionType, setActionType] = useState<'register' | 'reset-pin' | null>(null);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Search customers query
  const customersQuery = useQuery({
    queryKey: ['portal-admin-customers', searchTerm],
    queryFn: () => {
      const params = new URLSearchParams({ limit: '20' });
      if (searchTerm.trim()) params.set('search', searchTerm.trim());
      return api.get<CustomersApiResponse>(`/customers?${params.toString()}`);
    },
  });

  // Selected customer portal access status query
  const accessStatusQuery = useQuery({
    queryKey: ['portal-access-status', selectedCustomer?.id],
    enabled: Boolean(selectedCustomer?.id),
    queryFn: () => api.get<PortalAccessStatus>(`/customers/${selectedCustomer!.id}/portal/access-status`),
  });

  // Mutations
  const registerMutation = useMutation({
    mutationFn: ({ customerId, pin }: { customerId: number; pin: string }) =>
      api.post(`/customers/${customerId}/portal/register`, { pin }),
    onSuccess: () => {
      setNotice({ type: 'success', message: 'ลงทะเบียน PIN พอร์ทัลให้ลูกค้าสำเร็จ' });
      setActionType(null);
      setPinInput('');
      queryClient.invalidateQueries({ queryKey: ['portal-access-status', selectedCustomer?.id] });
    },
    onError: (err) => {
      setNotice({
        type: 'error',
        message: err instanceof ApiError ? err.message : 'เกิดข้อผิดพลาดในการลงทะเบียน PIN',
      });
    },
  });

  const resetPinMutation = useMutation({
    mutationFn: ({ customerId, pin }: { customerId: number; pin: string }) =>
      api.post(`/customers/${customerId}/portal/reset-pin`, { pin }),
    onSuccess: () => {
      setNotice({ type: 'success', message: 'รีเซ็ต PIN พอร์ทัลของลูกค้าเรียบร้อยแล้ว' });
      setActionType(null);
      setPinInput('');
      queryClient.invalidateQueries({ queryKey: ['portal-access-status', selectedCustomer?.id] });
    },
    onError: (err) => {
      setNotice({
        type: 'error',
        message: err instanceof ApiError ? err.message : 'เกิดข้อผิดพลาดในการรีเซ็ต PIN',
      });
    },
  });

  const unlockMutation = useMutation({
    mutationFn: (customerId: number) => api.post(`/customers/${customerId}/portal/unlock`),
    onSuccess: () => {
      setNotice({ type: 'success', message: 'ปลดล็อกบัญชีพอร์ทัลของลูกค้าเรียบร้อยแล้ว' });
      queryClient.invalidateQueries({ queryKey: ['portal-access-status', selectedCustomer?.id] });
    },
    onError: (err) => {
      setNotice({
        type: 'error',
        message: err instanceof ApiError ? err.message : 'เกิดข้อผิดพลาดในการปลดล็อก',
      });
    },
  });

  function handlePinSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCustomer) return;
    const cleanPin = pinInput.trim();
    if (cleanPin.length < 4 || cleanPin.length > 6) {
      setNotice({ type: 'error', message: 'รหัส PIN ต้องเป็นตัวเลข 4-6 หลัก' });
      return;
    }

    if (actionType === 'register') {
      registerMutation.mutate({ customerId: selectedCustomer.id, pin: cleanPin });
    } else if (actionType === 'reset-pin') {
      resetPinMutation.mutate({ customerId: selectedCustomer.id, pin: cleanPin });
    }
  }

  const access = accessStatusQuery.data;

  return (
    <section className="space-y-6">
      <header>
        <div className="flex items-center gap-2">
          <span className="text-2xl">📱</span>
          <h1 className="text-2xl font-bold text-slate-800">จัดการพอร์ทัลลูกค้า (Customer Portal Admin)</h1>
        </div>
        <p className="text-sm text-slate-500 mt-1">
          ลงทะเบียน PIN แรก, รีเซ็ตรหัสผ่าน PIN, ตรวจสอบการล็อกบัญชี และปลดล็อกการเข้าใช้งานพอร์ทัล (PORTAL-1 ถึง PORTAL-5)
        </p>
      </header>

      {notice && (
        <div
          className={`p-3 rounded-lg border text-sm flex items-center justify-between ${
            notice.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          <span>{notice.message}</span>
          <button
            onClick={() => setNotice(null)}
            className="text-xs font-semibold px-2 py-0.5 rounded hover:bg-black/5"
          >
            ปิด
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Customer Selector */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
            <span>🔍</span> ค้นหาและเลือกลูกค้า
          </h2>

          <div>
            <input
              type="text"
              placeholder="พิมพ์ชื่อลูกค้า หรือ รหัส CUS-..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-sky-500 focus:outline-none"
            />
          </div>

          <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
            {customersQuery.isPending ? (
              <p className="text-xs text-slate-400 py-4 text-center">กำลังค้นหารายชื่อลูกค้า…</p>
            ) : (customersQuery.data?.items?.length ?? 0) === 0 ? (
              <p className="text-xs text-slate-400 py-4 text-center">ไม่พบข้อมูลลูกค้า</p>
            ) : (
              customersQuery.data?.items.map((cust) => {
                const isSelected = selectedCustomer?.id === cust.id;
                return (
                  <button
                    key={cust.id}
                    onClick={() => {
                      setSelectedCustomer(cust);
                      setNotice(null);
                      setActionType(null);
                      setPinInput('');
                    }}
                    className={`w-full text-left p-2.5 transition rounded-lg ${
                      isSelected ? 'bg-sky-50 border border-sky-200' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold text-sky-700">{cust.code}</span>
                      <span className="text-[11px] text-slate-400">{cust.zone || '-'}</span>
                    </div>
                    <p className="text-sm font-medium text-slate-800 truncate">{cust.name}</p>
                    <p className="text-xs text-slate-500">{cust.phone || '-'}</p>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right Columns: Portal Access Details & Management */}
        <div className="lg:col-span-2 space-y-6">
          {!selectedCustomer ? (
            <div className="bg-white p-8 rounded-xl border border-slate-200 text-center text-slate-400 shadow-sm">
              <span className="text-4xl block mb-2">👈</span>
              <p className="text-sm font-medium">กรุณาเลือกลูกค้าจากแถบด้านซ้ายเพื่อดูหรือจัดการการเข้าถึงพอร์ทัล</p>
            </div>
          ) : accessStatusQuery.isPending ? (
            <div className="bg-white p-8 rounded-xl border border-slate-200 text-center text-slate-500 shadow-sm">
              กำลังตรวจสอบสถานะพอร์ทัลของลูกค้า…
            </div>
          ) : access ? (
            <div className="space-y-6">
              {/* Customer summary card */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                  <div>
                    <span className="font-mono text-xs font-semibold px-2 py-0.5 bg-sky-100 text-sky-800 rounded">
                      {access.customerCode}
                    </span>
                    <h2 className="text-lg font-bold text-slate-800 mt-1">{access.customerName}</h2>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-slate-500 block">สถานะพอร์ทัล</span>
                    {access.registered ? (
                      access.isLocked ? (
                        <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800">
                          🔒 ถูกระงับชั่วคราว ({access.lockMinutesRemaining} นาที)
                        </span>
                      ) : !access.enabled ? (
                        <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-800">
                          ⛔ ปิดการใช้งาน
                        </span>
                      ) : (
                        <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                          ✅ พร้อมใช้งาน
                        </span>
                      )
                    ) : (
                      <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-600">
                        ⚪ ยังไม่ลงทะเบียน PIN
                      </span>
                    )}
                  </div>
                </div>

                {/* Status details grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 text-xs">
                  <div>
                    <span className="text-slate-400 block">การลงทะเบียน</span>
                    <span className="font-semibold text-slate-700">
                      {access.registered ? 'ลงทะเบียนแล้ว' : 'ยังไม่เคยลงทะเบียน'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">จำนวนครั้งที่ใส่ผิด</span>
                    <span className="font-semibold text-slate-700">{access.failedAttempts} / 5 ครั้ง</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">ล็อกจนถึง</span>
                    <span className="font-semibold text-slate-700">{access.lockUntil || '-'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">วันที่ลงทะเบียน</span>
                    <span className="font-semibold text-slate-700">{access.registeredAt?.slice(0, 10) || '-'}</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons Panel */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
                <h3 className="text-sm font-bold text-slate-800">การจัดการพอร์ทัลสำหรับเจ้าหน้าที่</h3>

                <div className="flex flex-wrap gap-3">
                  {!access.registered ? (
                    <button
                      onClick={() => {
                        setActionType('register');
                        setPinInput('');
                      }}
                      disabled={!canManage}
                      className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold rounded-lg shadow transition disabled:opacity-50"
                    >
                      🔑 ลงทะเบียน PIN แรก
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => {
                          setActionType('reset-pin');
                          setPinInput('');
                        }}
                        disabled={!canManage}
                        className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-lg shadow transition disabled:opacity-50"
                      >
                        🔄 รีเซ็ตรหัส PIN ใหม่
                      </button>

                      {access.isLocked && (
                        <button
                          onClick={() => unlockMutation.mutate(selectedCustomer.id)}
                          disabled={!canManage || unlockMutation.isPending}
                          className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-lg shadow transition disabled:opacity-50"
                        >
                          {unlockMutation.isPending ? 'กำลังปลดล็อก…' : '🔓 ปลดล็อกบัญชีทันที'}
                        </button>
                      )}
                    </>
                  )}
                </div>

                {!canManage && (
                  <p className="text-xs text-amber-600">
                    * คุณไม่มีสิทธิ์จัดการ PIN หรือปลดล็อก (ต้องเป็นบทบาท Manager หรือ Admin)
                  </p>
                )}

                {/* PIN Input Form Modal / Sub-card */}
                {actionType && (
                  <div className="mt-4 p-4 border border-sky-200 bg-sky-50 rounded-xl space-y-3">
                    <h4 className="text-sm font-bold text-sky-900">
                      {actionType === 'register' ? 'ตั้งรหัส PIN พอร์ทัลใหม่' : 'รีเซ็ตรหัส PIN พอร์ทัล'}
                    </h4>
                    <form onSubmit={handlePinSubmit} className="space-y-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          รหัส PIN ใหม่ (ตัวเลข 4-6 หลัก):
                        </label>
                        <input
                          type="text"
                          pattern="[0-9]{4,6}"
                          maxLength={6}
                          placeholder="เช่น 1234 หรือ 123456"
                          value={pinInput}
                          onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))}
                          className="w-48 px-3 py-1.5 border border-slate-300 rounded font-mono text-center tracking-widest text-base focus:ring-2 focus:ring-sky-500 focus:outline-none"
                          required
                          autoFocus
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="submit"
                          disabled={registerMutation.isPending || resetPinMutation.isPending}
                          className="px-4 py-1.5 bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold rounded shadow transition disabled:opacity-50"
                        >
                          {registerMutation.isPending || resetPinMutation.isPending
                            ? 'กำลังบันทึก…'
                            : 'ยืนยันบันทึก PIN'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setActionType(null);
                            setPinInput('');
                          }}
                          className="px-3 py-1.5 bg-white border border-slate-300 text-slate-700 text-xs rounded hover:bg-slate-50"
                        >
                          ยกเลิก
                        </button>
                      </div>
                    </form>
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
