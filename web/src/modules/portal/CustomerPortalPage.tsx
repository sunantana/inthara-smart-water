import { useEffect, useState } from 'react';
import StepperInput from '../../components/ui/StepperInput';

interface PortalPrice {
  sku: string;
  name: string;
  unitPriceSat: number;
  unitPriceBaht: number;
}

interface PortalOrderItem {
  sku: string;
  qty: number;
  unitPriceSat: number;
  unitPriceBaht: number;
  subtotalSat: number;
  subtotalBaht: number;
}

interface PortalOrder {
  id: number;
  code: string;
  orderDate: string;
  deliveryDate: string;
  status: string;
  totalSat: number;
  totalBaht: number;
  items: PortalOrderItem[];
}

interface PortalMeData {
  customer: {
    id: number;
    code: string;
    name: string;
    phone: string;
    zone: string;
    address: string;
  };
  prices: Record<string, PortalPrice>;
  financials: {
    balanceSat: number;
    balanceBaht: number;
    outstandingDebtSat: number;
    outstandingDebtBaht: number;
    outstandingBottles: number;
  };
  recentOrders: PortalOrder[];
}

const PORTAL_TOKEN_KEY = 'inthara_portal_token';

export default function CustomerPortalPage() {
  const [token, setToken] = useState<string | null>(() => sessionStorage.getItem(PORTAL_TOKEN_KEY));
  const [customerCode, setCustomerCode] = useState('');
  const [pin, setPin] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [lockMinutes, setLockMinutes] = useState<number | null>(null);

  // Data states
  const [portalData, setPortalData] = useState<PortalMeData | null>(null);
  const [loadingMe, setLoadingMe] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Order form states
  const [qty189L, setQty189L] = useState<number>(0);
  const [qty350ML, setQty350ML] = useState<number>(0);
  const [qty600ML, setQty600ML] = useState<number>(0);
  const [qty1500ML, setQty1500ML] = useState<number>(0);
  const [deliveryDate, setDeliveryDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  });
  const [notes, setNotes] = useState('');
  const [orderSubmitting, setOrderSubmitting] = useState(false);
  const [orderSuccessMsg, setOrderSuccessMsg] = useState<string | null>(null);
  const [orderErrorMsg, setOrderErrorMsg] = useState<string | null>(null);

  async function fetchPortalMe(activeToken: string) {
    setLoadingMe(true);
    setFetchError(null);
    try {
      const res = await fetch('/api/portal/me', {
        headers: {
          Authorization: `Bearer ${activeToken}`,
        },
      });

      if (res.status === 401 || res.status === 403) {
        handleLogout();
        setLoginError('เซสชันพอร์ทัลหมดอายุ กรุณาเข้าสู่ระบบใหม่');
        return;
      }

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.error?.message || 'ไม่สามารถโหลดข้อมูลพอร์ทัลได้');
      }

      const json = await res.json();
      setPortalData(json);
    } catch (err: unknown) {
      setFetchError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการดึงข้อมูล');
    } finally {
      setLoadingMe(false);
    }
  }

  useEffect(() => {
    if (token) {
      fetchPortalMe(token);
    }
  }, [token]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError(null);
    setLockMinutes(null);

    const cleanCode = customerCode.trim().toUpperCase();
    const cleanPin = pin.trim();

    if (!cleanCode || !cleanPin) {
      setLoginError('กรุณากรอกรหัสลูกค้าและรหัส PIN');
      return;
    }

    setLoginLoading(true);
    try {
      const res = await fetch('/api/portal/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerCode: cleanCode, pin: cleanPin }),
      });

      const body = await res.json().catch(() => null);

      if (!res.ok) {
        if (res.status === 409) {
          const mins = body?.lockMinutes || body?.error?.lockMinutes || 15;
          setLockMinutes(mins);
          setLoginError(`บัญชีพอร์ทัลถูกระงับชั่วคราวเนื่องจากใส่ PIN ผิดครบกำหนด เหลือเวลาอีก ${mins} นาที`);
        } else if (res.status === 429) {
          setLoginError('พยายามเข้าสู่ระบบถี่เกินไป (เกิน 5 ครั้งใน 15 นาที) กรุณารอสักครู่แล้วลองใหม่');
        } else {
          setLoginError(body?.error?.message || 'รหัสลูกค้าหรือรหัส PIN ไม่ถูกต้อง');
        }
        return;
      }

      const receivedToken = body.token;
      if (receivedToken) {
        sessionStorage.setItem(PORTAL_TOKEN_KEY, receivedToken);
        setToken(receivedToken);
        setPin('');
      }
    } catch {
      setLoginError('เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ต');
    } finally {
      setLoginLoading(false);
    }
  }

  function handleLogout() {
    sessionStorage.removeItem(PORTAL_TOKEN_KEY);
    setToken(null);
    setPortalData(null);
    setOrderSuccessMsg(null);
    setOrderErrorMsg(null);
  }

  async function handleCreateOrder(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;

    setOrderSuccessMsg(null);
    setOrderErrorMsg(null);

    const items: Array<{ sku: string; qty: number }> = [];
    if (qty189L > 0) items.push({ sku: 'FG-189L', qty: qty189L });
    if (qty350ML > 0) items.push({ sku: 'FG-350ML', qty: qty350ML });
    if (qty600ML > 0) items.push({ sku: 'FG-600ML', qty: qty600ML });
    if (qty1500ML > 0) items.push({ sku: 'FG-1500ML', qty: qty1500ML });

    if (items.length === 0) {
      setOrderErrorMsg('กรุณาระบุจำนวนสินค้าอย่างน้อย 1 รายการ');
      return;
    }

    setOrderSubmitting(true);
    try {
      const res = await fetch('/api/portal/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          deliveryDate,
          items,
          notes: notes.trim() || undefined,
        }),
      });

      const body = await res.json().catch(() => null);

      if (!res.ok) {
        setOrderErrorMsg(body?.error?.message || 'ไม่สามารถสร้างคำสั่งซื้อได้');
        return;
      }

      setOrderSuccessMsg(`สร้างคำสั่งซื้อ [${body.code || 'สำเร็จ'}] เรียบร้อยแล้ว! สถานะ: รอเจ้าหน้าที่ตรวจสอบ (Draft)`);
      // Reset form
      setQty189L(0);
      setQty350ML(0);
      setQty600ML(0);
      setQty1500ML(0);
      setNotes('');
      // Refresh me data to update recent orders
      fetchPortalMe(token);
    } catch {
      setOrderErrorMsg('ไม่สามารถติดต่อเซิร์ฟเวอร์เพื่อส่งคำสั่งซื้อได้');
    } finally {
      setOrderSubmitting(false);
    }
  }

  // Calculate estimated total
  const price189L = portalData?.prices['FG-189L']?.unitPriceBaht ?? 0;
  const price350ML = portalData?.prices['FG-350ML']?.unitPriceBaht ?? 0;
  const price600ML = portalData?.prices['FG-600ML']?.unitPriceBaht ?? 0;
  const price1500ML = portalData?.prices['FG-1500ML']?.unitPriceBaht ?? 0;

  const estimatedTotalBaht =
    qty189L * price189L +
    qty350ML * price350ML +
    qty600ML * price600ML +
    qty1500ML * price1500ML;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 antialiased pb-16">
      {/* Top Banner */}
      <header className="bg-sky-700 text-white shadow-md sticky top-0 z-30">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl" role="img" aria-label="water droplet">💧</span>
            <div>
              <h1 className="text-lg font-bold leading-tight">อินธารา สมาร์ทวอเตอร์</h1>
              <p className="text-xs text-sky-100">พอร์ทัลสั่งน้ำและตรวจสอบข้อมูลลูกค้า</p>
            </div>
          </div>
          {token && (
            <button
              onClick={handleLogout}
              className="text-xs bg-sky-800 hover:bg-sky-900 border border-sky-600 px-3 py-1.5 rounded transition"
            >
              ออกจากระบบ
            </button>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 pt-6">
        {!token ? (
          /* Login Screen */
          <div className="max-w-md mx-auto bg-white rounded-xl shadow-sm border border-slate-200 p-6 sm:p-8 mt-6">
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-14 h-14 bg-sky-100 text-sky-700 rounded-full mb-3 text-2xl">
                🔐
              </div>
              <h2 className="text-xl font-bold text-slate-800">เข้าสู่ระบบพอร์ทัลลูกค้า</h2>
              <p className="text-xs text-slate-500 mt-1">กรอกรหัสลูกค้าและรหัส PIN 4-6 หลักเพื่อเข้าใช้งาน</p>
            </div>

            {loginError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                {loginError}
                {lockMinutes && lockMinutes > 0 && (
                  <p className="mt-1 font-semibold text-xs">หากต้องการความช่วยเหลือด่วน กรุณาติดต่อแอดมิน</p>
                )}
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
                  รหัสลูกค้า (Customer Code)
                </label>
                <input
                  type="text"
                  placeholder="เช่น CUS-0001"
                  value={customerCode}
                  onChange={(e) => setCustomerCode(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-sky-500 focus:outline-none uppercase font-mono"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
                  รหัส PIN (4-6 หลัก)
                </label>
                <input
                  type="password"
                  maxLength={6}
                  inputMode="numeric"
                  placeholder="••••"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-sky-500 focus:outline-none tracking-widest font-mono"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loginLoading}
                className="w-full py-2.5 bg-sky-600 hover:bg-sky-700 text-white font-medium rounded shadow transition disabled:opacity-50"
              >
                {loginLoading ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}
              </button>
            </form>

            <div className="mt-6 pt-4 border-t border-slate-100 text-center text-xs text-slate-500 space-y-1">
              <p>💡 ยังไม่มีรหัส PIN หรือลืมรหัส PIN?</p>
              <p className="text-slate-600">กรุณาติดต่อเจ้าหน้าที่โรงน้ำอินธาราเพื่อตั้งรหัสหรือปลดล็อกบัญชี</p>
            </div>
          </div>
        ) : loadingMe && !portalData ? (
          <div className="text-center py-12">
            <p className="text-slate-500 text-sm">กำลังโหลดข้อมูลลูกค้าของคุณ…</p>
          </div>
        ) : fetchError ? (
          <div className="p-4 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
            <p className="font-semibold">เกิดข้อผิดพลาดในการโหลดข้อมูล</p>
            <p className="mt-1">{fetchError}</p>
            <button
              onClick={() => token && fetchPortalMe(token)}
              className="mt-3 px-3 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700"
            >
              ลองใหม่อีกครั้ง
            </button>
          </div>
        ) : portalData ? (
          /* Portal Dashboard Content */
          <div className="space-y-6">
            {/* Customer greeting banner */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-semibold px-2 py-0.5 bg-sky-100 text-sky-800 rounded">
                    {portalData.customer.code}
                  </span>
                  <span className="text-xs text-slate-500">{portalData.customer.zone || 'ไม่ระบุโซน'}</span>
                </div>
                <h2 className="text-lg font-bold text-slate-800 mt-1">{portalData.customer.name}</h2>
                <p className="text-xs text-slate-500">{portalData.customer.address || '-'}</p>
              </div>
              <div className="text-right">
                <span className="text-xs text-slate-400">โทรศัพท์</span>
                <p className="text-sm font-medium text-slate-700">{portalData.customer.phone || '-'}</p>
              </div>
            </div>

            {/* Quick Metrics: Debt, Bottles, Pricing */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <span className="text-xs font-medium text-slate-500">หนี้ค้างชำระ (บาท)</span>
                <p
                  className={`text-2xl font-bold mt-1 ${
                    portalData.financials.outstandingDebtBaht > 0 ? 'text-amber-600' : 'text-emerald-600'
                  }`}
                >
                  ฿{portalData.financials.outstandingDebtBaht.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  {portalData.financials.outstandingDebtBaht > 0
                    ? 'มีรายการค้างชำระ สามารถชำระเงินกับพนักงานจัดส่งได้'
                    : 'ไม่มีหนี้ค้างชำระ'}
                </p>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <span className="text-xs font-medium text-slate-500">ถัง 18.9L ค้างคืน (ใบ)</span>
                <p
                  className={`text-2xl font-bold mt-1 ${
                    portalData.financials.outstandingBottles > 0 ? 'text-sky-700' : 'text-slate-700'
                  }`}
                >
                  {portalData.financials.outstandingBottles} <span className="text-sm font-normal text-slate-500">ใบ</span>
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  กรุณาเตรียมถังเปล่าคืนพนักงานส่งน้ำในรอบส่งถัดไป
                </p>
              </div>
            </div>

            {/* Prices Card */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-1.5">
                <span>🏷️</span> ราคาน้ำดื่มของคุณตามทะเบียน
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                <div className="p-2.5 bg-slate-50 rounded border border-slate-100">
                  <span className="text-xs text-slate-500 block">ถัง 18.9L</span>
                  <span className="text-base font-bold text-sky-700">
                    ฿{portalData.prices['FG-189L']?.unitPriceBaht ?? 0}
                  </span>
                </div>
                <div className="p-2.5 bg-slate-50 rounded border border-slate-100">
                  <span className="text-xs text-slate-500 block">แพ็ค 350ml</span>
                  <span className="text-base font-bold text-sky-700">
                    ฿{portalData.prices['FG-350ML']?.unitPriceBaht ?? 0}
                  </span>
                </div>
                <div className="p-2.5 bg-slate-50 rounded border border-slate-100">
                  <span className="text-xs text-slate-500 block">แพ็ค 600ml</span>
                  <span className="text-base font-bold text-sky-700">
                    ฿{portalData.prices['FG-600ML']?.unitPriceBaht ?? 0}
                  </span>
                </div>
                <div className="p-2.5 bg-slate-50 rounded border border-slate-100">
                  <span className="text-xs text-slate-500 block">แพ็ค 1500ml</span>
                  <span className="text-base font-bold text-sky-700">
                    ฿{portalData.prices['FG-1500ML']?.unitPriceBaht ?? 0}
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Order Form */}
            <div className="bg-white p-5 rounded-xl border border-sky-100 shadow-sm">
              <h3 className="text-base font-bold text-slate-800 mb-2 flex items-center gap-2">
                <span>📦</span> สั่งน้ำดื่มออนไลน์
              </h3>
              <p className="text-xs text-slate-500 mb-4">
                เลือกจำนวนสินค้าที่ต้องการสั่ง ระบบจะสร้างใบสั่งซื้อ (Draft) ให้เจ้าหน้าที่จัดคิวจัดส่ง
              </p>

              {orderSuccessMsg && (
                <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded text-sm text-emerald-800">
                  {orderSuccessMsg}
                </div>
              )}

              {orderErrorMsg && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                  {orderErrorMsg}
                </div>
              )}

              <form onSubmit={handleCreateOrder} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* FG-189L */}
                  <div className="flex items-center justify-between p-3 border border-slate-200 rounded-lg">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">น้ำดื่มถัง 18.9L</p>
                      <p className="text-xs text-slate-500">฿{price189L} / ถัง</p>
                    </div>
                    <StepperInput
                      value={qty189L}
                      onChange={setQty189L}
                      min={0}
                      max={999}
                      unit="ถัง"
                    />
                  </div>

                  {/* FG-350ML */}
                  <div className="flex items-center justify-between p-3 border border-slate-200 rounded-lg">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">น้ำดื่มแพ็ค 350ml</p>
                      <p className="text-xs text-slate-500">฿{price350ML} / แพ็ค</p>
                    </div>
                    <StepperInput
                      value={qty350ML}
                      onChange={setQty350ML}
                      min={0}
                      max={999}
                      unit="แพ็ค"
                    />
                  </div>

                  {/* FG-600ML */}
                  <div className="flex items-center justify-between p-3 border border-slate-200 rounded-lg">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">น้ำดื่มแพ็ค 600ml</p>
                      <p className="text-xs text-slate-500">฿{price600ML} / แพ็ค</p>
                    </div>
                    <StepperInput
                      value={qty600ML}
                      onChange={setQty600ML}
                      min={0}
                      max={999}
                      unit="แพ็ค"
                    />
                  </div>

                  {/* FG-1500ML */}
                  <div className="flex items-center justify-between p-3 border border-slate-200 rounded-lg">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">น้ำดื่มแพ็ค 1500ml</p>
                      <p className="text-xs text-slate-500">฿{price1500ML} / แพ็ค</p>
                    </div>
                    <StepperInput
                      value={qty1500ML}
                      onChange={setQty1500ML}
                      min={0}
                      max={999}
                      unit="แพ็ค"
                    />
                  </div>
                </div>

                {/* Delivery Date & Notes */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      วันที่ต้องการให้จัดส่ง
                    </label>
                    <input
                      type="date"
                      value={deliveryDate}
                      onChange={(e) => setDeliveryDate(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-sky-500 focus:outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      หมายเหตุเพิ่มเติม / จุดวางถัง
                    </label>
                    <input
                      type="text"
                      placeholder="เช่น วางไว้หน้าบ้าน, มีถังเปล่าคืน 5 ใบ"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-sky-500 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Estimate & Submit (Sticky Bar) */}
                <div className="sticky bottom-0 -mx-5 -mb-5 mt-4 p-4 bg-white/95 backdrop-blur-xs border-t border-slate-200 rounded-b-xl flex flex-wrap items-center justify-between gap-3 shadow-md">
                  <div>
                    <span className="text-xs font-medium text-slate-500">ยอดคำสั่งซื้อรวมโดยประมาณ:</span>
                    <p className="text-2xl font-black font-mono text-sky-800">
                      ฿{estimatedTotalBaht.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  <button
                    type="submit"
                    disabled={orderSubmitting || estimatedTotalBaht === 0}
                    className="min-h-[44px] px-6 py-2.5 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-lg shadow transition disabled:opacity-50"
                  >
                    {orderSubmitting ? 'กำลังส่งคำสั่งซื้อ…' : 'ยืนยันสั่งน้ำดื่ม'}
                  </button>
                </div>
              </form>
            </div>

            {/* Order History */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <h3 className="text-base font-bold text-slate-800 mb-3 flex items-center gap-2">
                <span>🕒</span> ประวัติการสั่งน้ำ 3 เดือนล่าสุด
              </h3>

              {portalData.recentOrders && portalData.recentOrders.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs text-slate-500 bg-slate-50">
                        <th className="py-2 px-3">เลขที่คำสั่งซื้อ</th>
                        <th className="py-2 px-3">วันที่จัดส่ง</th>
                        <th className="py-2 px-3">รายการสินค้า</th>
                        <th className="py-2 px-3 text-right">ยอดรวม (บาท)</th>
                        <th className="py-2 px-3 text-center">สถานะ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {portalData.recentOrders.map((ord) => {
                        const statusColor =
                          ord.status === 'delivered'
                            ? 'bg-emerald-100 text-emerald-800'
                            : ord.status === 'delivering'
                              ? 'bg-blue-100 text-blue-800'
                              : ord.status === 'confirmed'
                                ? 'bg-sky-100 text-sky-800'
                                : ord.status === 'draft'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-slate-100 text-slate-700';

                        const statusLabel =
                          ord.status === 'delivered'
                            ? 'จัดส่งแล้ว'
                            : ord.status === 'delivering'
                              ? 'กำลังจัดส่ง'
                              : ord.status === 'confirmed'
                                ? 'ยืนยันแล้ว'
                                : ord.status === 'draft'
                                  ? 'รอดำเนินการ'
                                  : ord.status;

                        return (
                          <tr key={ord.id} className="hover:bg-slate-50">
                            <td className="py-2.5 px-3 font-mono font-medium text-slate-800">
                              {ord.code}
                            </td>
                            <td className="py-2.5 px-3 text-slate-600">{ord.deliveryDate}</td>
                            <td className="py-2.5 px-3 text-slate-600 text-xs">
                              {ord.items.map((it) => `${it.sku} x${it.qty}`).join(', ')}
                            </td>
                            <td className="py-2.5 px-3 text-right font-medium text-slate-800">
                              ฿{ord.totalBaht.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${statusColor}`}>
                                {statusLabel}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-center py-6 text-sm text-slate-400">ยังไม่มีประวัติการสั่งซื้อในช่วง 3 เดือนที่ผ่านมา</p>
              )}
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}
