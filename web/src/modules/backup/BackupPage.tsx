import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../api/client';
import { useAuthSession } from '../../lib/auth';

interface BackupFileInfo {
  filename: string;
  sizeBytes: number;
  sizeFormatted: string;
  createdAt: string;
}

interface BackupStatusResponse {
  cronSchedule: string;
  retentionMax: number;
  totalBackups: number;
  lastBackup: BackupFileInfo | null;
  backupsDir: string;
}

interface BackupListResponse {
  backups: BackupFileInfo[];
  total: number;
}

export default function BackupPage() {
  const { user } = useAuthSession();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === 'admin';

  const [restoreModalFile, setRestoreModalFile] = useState<BackupFileInfo | null>(null);
  const [adminPassword, setAdminPassword] = useState('');
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Status Query
  const statusQuery = useQuery({
    queryKey: ['backup-status'],
    enabled: isAdmin,
    queryFn: () => api.get<BackupStatusResponse>('/backup/status'),
  });

  // List Backups Query
  const listQuery = useQuery({
    queryKey: ['backup-list'],
    enabled: isAdmin,
    queryFn: () => api.get<BackupListResponse>('/backup/list'),
  });

  // Run Manual Backup Mutation
  const runBackupMutation = useMutation({
    mutationFn: () => api.post('/backup/run'),
    onSuccess: (data: unknown) => {
      const resp = data as { backup?: { filename?: string } };
      setNotice({
        type: 'success',
        message: `สำรองข้อมูลสำเร็จ! ไฟล์: ${resp.backup?.filename || 'เรียบร้อย'}`,
      });
      queryClient.invalidateQueries({ queryKey: ['backup-status'] });
      queryClient.invalidateQueries({ queryKey: ['backup-list'] });
    },
    onError: (err) => {
      setNotice({
        type: 'error',
        message: err instanceof ApiError ? err.message : 'เกิดข้อผิดพลาดในการสำรองข้อมูล',
      });
    },
  });

  // Restore Mutation
  const restoreMutation = useMutation({
    mutationFn: ({ filename, pass }: { filename: string; pass: string }) =>
      api.post('/backup/restore', { filename, adminPassword: pass }),
    onSuccess: (data: unknown) => {
      const resp = data as { preRestoreBackup?: string };
      setNotice({
        type: 'success',
        message: `กู้คืนข้อมูลสำเร็จ! ฐานข้อมูลเดิมถูกสำรองไว้ที่: ${resp.preRestoreBackup || 'pre-restore'}`,
      });
      setRestoreModalFile(null);
      setAdminPassword('');
      queryClient.invalidateQueries({ queryKey: ['backup-status'] });
      queryClient.invalidateQueries({ queryKey: ['backup-list'] });
    },
    onError: (err) => {
      setNotice({
        type: 'error',
        message: err instanceof ApiError ? err.message : 'เกิดข้อผิดพลาดในการกู้คืนข้อมูล',
      });
    },
  });

  function handleConfirmRestore(e: React.FormEvent) {
    e.preventDefault();
    if (!restoreModalFile || !adminPassword) return;
    restoreMutation.mutate({
      filename: restoreModalFile.filename,
      pass: adminPassword,
    });
  }

  if (!isAdmin) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-amber-800">
        <h2 className="text-base font-bold">จำกัดสิทธิ์เฉพาะผู้ดูแลระบบ (Admin Only)</h2>
        <p className="text-sm mt-1">หน้านี้สงวนสิทธิ์เฉพาะผู้ใช้บทบาท admin เท่านั้นตามข้อกำหนด BKP-1</p>
      </div>
    );
  }

  const status = statusQuery.data;

  return (
    <section className="space-y-6">
      <header>
        <div className="flex items-center gap-2">
          <span className="text-2xl">💾</span>
          <h1 className="text-2xl font-bold text-slate-800">สำรองและกู้คืนฐานข้อมูล (Backup & Restore)</h1>
        </div>
        <p className="text-sm text-slate-500 mt-1">
          ระบบสำรองข้อมูลอัตโนมัติรายวัน (Cron 02:00 น.), สำรองแบบ Manual ด้วยคำสั่ง SQLite VACUUM INTO, และกู้คืนข้อมูลแบบปลอดภัย (BKP-1 ถึง BKP-3)
        </p>
      </header>

      {notice && (
        <div
          className={`p-3.5 rounded-lg border text-sm flex items-center justify-between ${
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

      {/* Top Status Card */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <h2 className="text-base font-bold text-slate-800">ระบบสำรองข้อมูลอัตโนมัติ (Automated Daily Backup)</h2>
            </div>
            <p className="text-xs text-slate-500">
              กำหนดเวลา: <span className="font-mono font-semibold text-slate-700">02:00 น. ทุกวัน</span> | เก็บรักษาย้อนหลังสูงสุด: <span className="font-semibold text-slate-700">{status?.retentionMax ?? 30} ไฟล์</span>
            </p>
            <p className="text-xs text-slate-400">
              ไฟล์ล่าสุด: <span className="font-mono text-slate-600">{status?.lastBackup?.filename || 'ยังไม่มีการสำรอง'}</span> ({status?.lastBackup?.sizeFormatted || '-'})
            </p>
          </div>

          <div>
            <button
              onClick={() => runBackupMutation.mutate()}
              disabled={runBackupMutation.isPending}
              className="px-5 py-2.5 bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold rounded-lg shadow transition disabled:opacity-50 flex items-center gap-2"
            >
              <span>⚡</span>
              {runBackupMutation.isPending ? 'กำลังสำรองข้อมูล…' : 'สำรองข้อมูลทันที (Run Backup Now)'}
            </button>
          </div>
        </div>
      </div>

      {/* Backups List Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <span>🗄️</span> รายการไฟล์สำรองทั้งหมด ({listQuery.data?.total ?? 0} ไฟล์)
          </h3>
          <button
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ['backup-list'] });
              queryClient.invalidateQueries({ queryKey: ['backup-status'] });
            }}
            className="text-xs text-sky-600 hover:text-sky-700 hover:underline"
          >
            รีเฟรช ↺
          </button>
        </div>

        {listQuery.isPending ? (
          <p className="p-8 text-center text-sm text-slate-400">กำลังโหลดรายการไฟล์สำรอง…</p>
        ) : listQuery.isError ? (
          <p className="p-4 text-center text-sm text-red-600">ไม่สามารถโหลดรายการไฟล์สำรองได้</p>
        ) : (listQuery.data?.backups.length ?? 0) === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400 space-y-2">
            <p>ยังไม่มีไฟล์สำรองในโฟลเดอร์ backups/</p>
            <p className="text-xs text-slate-500">กดปุ่ม "สำรองข้อมูลทันที" ด้านบนเพื่อสร้างไฟล์สำรองแรก</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
                  <th className="py-2.5 px-4 font-semibold">ชื่อไฟล์สำรอง (.db)</th>
                  <th className="py-2.5 px-4 font-semibold">ขนาดไฟล์</th>
                  <th className="py-2.5 px-4 font-semibold">วันที่และเวลาที่สำรอง</th>
                  <th className="py-2.5 px-4 font-semibold text-center">การกระทำ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {listQuery.data?.backups.map((bkp) => (
                  <tr key={bkp.filename} className="hover:bg-slate-50">
                    <td className="py-2.5 px-4 font-mono font-medium text-slate-800">
                      {bkp.filename}
                    </td>
                    <td className="py-2.5 px-4 text-slate-600 text-xs">{bkp.sizeFormatted}</td>
                    <td className="py-2.5 px-4 text-slate-600 text-xs font-mono">{bkp.createdAt}</td>
                    <td className="py-2.5 px-4 text-center">
                      <button
                        onClick={() => {
                          setRestoreModalFile(bkp);
                          setAdminPassword('');
                          setNotice(null);
                        }}
                        className="px-3 py-1 bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold rounded shadow-sm transition"
                      >
                        กู้คืน (Restore)
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Restore Confirmation Modal */}
      {restoreModalFile && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4 animate-in fade-in">
            <div className="flex items-center gap-2 text-amber-600">
              <span className="text-2xl">⚠️</span>
              <h3 className="text-lg font-bold text-slate-800">ยืนยันการกู้คืนฐานข้อมูล (Restore)</h3>
            </div>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800 space-y-1">
              <p className="font-semibold">คำเตือนสำคัญ:</p>
              <p>การกู้คืนจะเขียนทับฐานข้อมูลปัจจุบันด้วยข้อมูลจากไฟล์:</p>
              <p className="font-mono font-bold text-amber-900">{restoreModalFile.filename}</p>
              <p className="mt-1 text-[11px] text-amber-700">
                (ระบบจะสร้างสำเนา .pre-restore สำรองข้อมูลปัจจุบันไว้ก่อนเขียนทับโดยอัตโนมัติ)
              </p>
            </div>

            <form onSubmit={handleConfirmRestore} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  กรุณากรอกรหัสผ่าน Admin เพื่อยืนยัน:
                </label>
                <input
                  type="password"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  placeholder="รหัสผ่านผู้ดูแลระบบ"
                  className="w-full px-3 py-2 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  required
                  autoFocus
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setRestoreModalFile(null);
                    setAdminPassword('');
                  }}
                  disabled={restoreMutation.isPending}
                  className="px-4 py-2 border border-slate-300 text-slate-700 text-xs font-medium rounded hover:bg-slate-50"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={restoreMutation.isPending || !adminPassword}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded shadow transition disabled:opacity-50"
                >
                  {restoreMutation.isPending ? 'กำลังกู้คืนข้อมูล…' : 'ยืนยันกู้คืนข้อมูล'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
