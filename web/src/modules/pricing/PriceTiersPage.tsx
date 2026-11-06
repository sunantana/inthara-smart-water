import { type FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '../../api/client';
import { useAuthSession } from '../../lib/auth';
import { findModule } from '../../lib/modules';
import { bahtToSatang, formatBaht, satangToBaht } from '../../lib/money';

const moduleMeta = findModule('PRC');

export interface PriceTierItem {
  id: number;
  name: string;
  price189lSat: number;
  price350mlSat: number;
  price600mlSat: number;
  price1500mlSat: number;
  prices: {
    'FG-189L': number;
    'FG-350ML': number;
    'FG-600ML': number;
    'FG-1500ML': number;
  };
  isActive: boolean;
  customerCount: number;
  createdAt: string;
  updatedAt: string;
}

interface PriceTiersResponse {
  data: PriceTierItem[];
}

export default function PriceTiersPage() {
  const { user } = useAuthSession();
  const queryClient = useQueryClient();

  const canWrite = user?.role === 'admin' || user?.role === 'manager';
  const isAdmin = user?.role === 'admin';

  const [modalOpen, setModalOpen] = useState(false);
  const [editingTier, setEditingTier] = useState<PriceTierItem | null>(null);
  const [name, setName] = useState('');
  const [price189Baht, setPrice189Baht] = useState('15');
  const [price350Baht, setPrice350Baht] = useState('35');
  const [price600Baht, setPrice600Baht] = useState('35');
  const [price1500Baht, setPrice1500Baht] = useState('35');
  const [isActive, setIsActive] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionAlert, setActionAlert] = useState<{ type: 'ok' | 'err'; text: string } | null>(
    null,
  );

  const tiersQuery = useQuery({
    queryKey: ['price-tiers'],
    queryFn: () => api.get<PriceTiersResponse>('/price-tiers?active=all'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/price-tiers/${id}`),
    onSuccess: () => {
      setActionAlert({ type: 'ok', text: 'ลบระดับราคาสำเร็จ' });
      queryClient.invalidateQueries({ queryKey: ['price-tiers'] });
    },
    onError: (err) => {
      const msg = err instanceof ApiError ? err.message : 'ไม่สามารถลบระดับราคาได้';
      setActionAlert({ type: 'err', text: msg });
    },
  });

  function openCreateModal() {
    setEditingTier(null);
    setName('');
    setPrice189Baht('15');
    setPrice350Baht('35');
    setPrice600Baht('35');
    setPrice1500Baht('35');
    setIsActive(true);
    setErrorMessage(null);
    setModalOpen(true);
  }

  function openEditModal(tier: PriceTierItem) {
    setEditingTier(tier);
    setName(tier.name);
    setPrice189Baht(String(satangToBaht(tier.price189lSat)));
    setPrice350Baht(String(satangToBaht(tier.price350mlSat)));
    setPrice600Baht(String(satangToBaht(tier.price600mlSat)));
    setPrice1500Baht(String(satangToBaht(tier.price1500mlSat)));
    setIsActive(tier.isActive);
    setErrorMessage(null);
    setModalOpen(true);
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorMessage(null);

    try {
      const payload = {
        name: name.trim(),
        price189lSat: bahtToSatang(price189Baht),
        price350mlSat: bahtToSatang(price350Baht),
        price600mlSat: bahtToSatang(price600Baht),
        price1500mlSat: bahtToSatang(price1500Baht),
        isActive,
      };

      if (editingTier) {
        await api.put(`/price-tiers/${editingTier.id}`, payload);
        setActionAlert({ type: 'ok', text: `อัปเดตระดับราคา "${payload.name}" สำเร็จ` });
      } else {
        await api.post('/price-tiers', payload);
        setActionAlert({ type: 'ok', text: `สร้างระดับราคา "${payload.name}" สำเร็จ` });
      }

      setModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['price-tiers'] });
    } catch (err) {
      setErrorMessage(err instanceof ApiError ? err.message : 'บันทึกข้อมูลไม่สำเร็จ');
    }
  }

  const tiers = tiersQuery.data?.data ?? [];

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

      {actionAlert && (
        <div
          className={`rounded-xl border p-3 text-sm ${
            actionAlert.type === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {actionAlert.text}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-700">
              ชุดระดับราคามาตรฐาน (Price Tiers) — {tiers.length} รายการ
            </h2>
            <p className="text-xs text-slate-500">
              แสดงราคาต่อหน่วยเป็นบาท (บันทึกในฐานข้อมูลเป็นหน่วยสตางค์ integer ตามข้อตกลงระบบ)
            </p>
          </div>

          {canWrite && (
            <button
              type="button"
              onClick={openCreateModal}
              className="rounded-lg bg-brand-700 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-600"
            >
              + เพิ่มระดับราคาใหม่
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-600">
              <tr>
                <th className="px-3 py-2">ID</th>
                <th className="px-3 py-2">ชื่อระดับราคา (Tier Name)</th>
                <th className="px-3 py-2 text-right">ถัง 18.9L (บาท)</th>
                <th className="px-3 py-2 text-right">แพ็ค 350ml (บาท)</th>
                <th className="px-3 py-2 text-right">แพ็ค 600ml (บาท)</th>
                <th className="px-3 py-2 text-right">แพ็ค 1500ml (บาท)</th>
                <th className="px-3 py-2 text-center">ลูกค้าที่ผูกอยู่</th>
                <th className="px-3 py-2">สถานะ</th>
                {canWrite && <th className="px-3 py-2 text-right">จัดการ</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tiers.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-sm text-slate-400">
                    ยังไม่มีรายการระดับราคาในระบบ
                  </td>
                </tr>
              ) : (
                tiers.map((tier) => (
                  <tr key={tier.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2 font-mono text-xs text-slate-500">{tier.id}</td>
                    <td className="px-3 py-2 font-medium text-slate-800">{tier.name}</td>
                    <td className="px-3 py-2 text-right font-mono text-slate-700">
                      {formatBaht(tier.price189lSat, true)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-slate-700">
                      {formatBaht(tier.price350mlSat, true)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-slate-700">
                      {formatBaht(tier.price600mlSat, true)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-slate-700">
                      {formatBaht(tier.price1500mlSat, true)}
                    </td>
                    <td className="px-3 py-2 text-center font-mono text-xs text-slate-600">
                      {tier.customerCount} ราย
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {tier.isActive ? (
                        <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 font-medium text-emerald-700">
                          ใช้งาน
                        </span>
                      ) : (
                        <span className="rounded-full bg-slate-200 px-2.5 py-0.5 text-slate-600">
                          ปิดใช้งาน
                        </span>
                      )}
                    </td>
                    {canWrite && (
                      <td className="space-x-2 px-3 py-2 text-right text-xs">
                        <button
                          type="button"
                          onClick={() => openEditModal(tier)}
                          className="rounded border border-slate-200 px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-100"
                        >
                          แก้ไข
                        </button>
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => deleteMutation.mutate(tier.id)}
                            className="rounded border border-red-200 bg-red-50 px-2.5 py-1 font-medium text-red-700 hover:bg-red-100"
                          >
                            ลบ
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-base font-semibold text-slate-800">
              {editingTier ? `แก้ไขระดับราคา: ${editingTier.name}` : 'เพิ่มระดับราคาใหม่'}
            </h2>

            <form onSubmit={handleSubmit} className="mt-4 space-y-3 text-sm">
              {errorMessage && (
                <div className="rounded-lg bg-red-50 p-3 text-xs text-red-700">{errorMessage}</div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700">
                  ชื่อระดับราคา (เช่น ราคาส่งร้านค้า, ราคาหน่วยงานราชการ)
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700">
                    ถัง 18.9L (บาท/ถัง)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={price189Baht}
                    onChange={(e) => setPrice189Baht(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">
                    แพ็ค 350ml (บาท/แพ็ค)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={price350Baht}
                    onChange={(e) => setPrice350Baht(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">
                    แพ็ค 600ml (บาท/แพ็ค)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={price600Baht}
                    onChange={(e) => setPrice600Baht(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">
                    แพ็ค 1500ml (บาท/แพ็ค)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={price1500Baht}
                    onChange={(e) => setPrice1500Baht(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                />
                เปิดใช้งานระดับราคานี้ (is_active)
              </label>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-600"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-brand-700 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-600"
                >
                  บันทึก
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
