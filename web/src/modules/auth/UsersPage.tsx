import { type FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '../../api/client';
import { ROLE_LABELS, type UserRole } from '../../lib/auth';
import { findModule } from '../../lib/modules';

const moduleMeta = findModule('AUTH');

export interface UserItem {
  id: number;
  username: string;
  displayName: string;
  role: UserRole;
  employeeId: number | null;
  isActive: boolean;
  failedAttempts: number;
  lockUntil: string | null;
  hasPin: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLogItem {
  id: number;
  userId: number | null;
  username: string;
  role: string | null;
  action: string;
  entity: string | null;
  entityId: string | null;
  ip: string | null;
  status: string;
  detail: string | null;
  createdAt: string;
}

interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export default function UsersPage() {
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<'users' | 'audit'>('users');
  const [userSearch, setUserSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');

  // ฟิลเตอร์ Audit Log
  const [auditUsername, setAuditUsername] = useState('');
  const [auditAction, setAuditAction] = useState('');
  const [auditFrom, setAuditFrom] = useState('');
  const [auditTo, setAuditTo] = useState('');
  const [auditPage, setAuditPage] = useState(1);

  // Modal สร้าง/แก้ไขผู้ใช้
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserItem | null>(null);
  const [formUsername, setFormUsername] = useState('');
  const [formDisplayName, setFormDisplayName] = useState('');
  const [formRole, setFormRole] = useState<UserRole>('staff');
  const [formPassword, setFormPassword] = useState('');
  const [formPin, setFormPin] = useState('');
  const [formIsActive, setFormIsActive] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);

  const usersQuery = useQuery({
    queryKey: ['auth-users', userSearch, roleFilter],
    queryFn: () => {
      const params = new URLSearchParams({ page: '1', limit: '50' });
      if (userSearch.trim()) params.set('search', userSearch.trim());
      if (roleFilter) params.set('role', roleFilter);
      return api.get<PaginatedResponse<UserItem>>(`/auth/users?${params.toString()}`);
    },
  });

  const auditQuery = useQuery({
    queryKey: ['auth-audit-logs', auditUsername, auditAction, auditFrom, auditTo, auditPage],
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(auditPage),
        limit: '25',
      });
      if (auditUsername.trim()) params.set('username', auditUsername.trim());
      if (auditAction.trim()) params.set('action', auditAction.trim());
      if (auditFrom) params.set('from', auditFrom);
      if (auditTo) params.set('to', auditTo);
      return api.get<PaginatedResponse<AuditLogItem>>(`/auth/audit-logs?${params.toString()}`);
    },
  });

  const unlockMutation = useMutation({
    mutationFn: (id: number) => api.post(`/auth/users/${id}/unlock`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth-users'] });
      queryClient.invalidateQueries({ queryKey: ['auth-audit-logs'] });
    },
  });

  function openCreateModal() {
    setEditingUser(null);
    setFormUsername('');
    setFormDisplayName('');
    setFormRole('staff');
    setFormPassword('');
    setFormPin('');
    setFormIsActive(true);
    setFormError(null);
    setModalOpen(true);
  }

  function openEditModal(u: UserItem) {
    setEditingUser(u);
    setFormUsername(u.username);
    setFormDisplayName(u.displayName);
    setFormRole(u.role);
    setFormPassword('');
    setFormPin('');
    setFormIsActive(u.isActive);
    setFormError(null);
    setModalOpen(true);
  }

  async function handleSaveUser(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);

    try {
      if (editingUser) {
        const body: Record<string, unknown> = {
          displayName: formDisplayName.trim(),
          role: formRole,
          isActive: formIsActive,
        };
        if (formPassword.trim()) body.password = formPassword;
        if (formPin.trim()) body.pin = formPin.trim();

        await api.put(`/auth/users/${editingUser.id}`, body);
      } else {
        await api.post('/auth/users', {
          username: formUsername.trim(),
          displayName: formDisplayName.trim(),
          role: formRole,
          password: formPassword,
          pin: formPin.trim() || undefined,
        });
      }

      setModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['auth-users'] });
      queryClient.invalidateQueries({ queryKey: ['auth-audit-logs'] });
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'บันทึกข้อมูลไม่สำเร็จ');
    }
  }

  const users = usersQuery.data?.data ?? [];
  const auditLogs = auditQuery.data?.data ?? [];
  const auditPagination = auditQuery.data?.pagination;

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

      <div className="flex gap-2 border-b border-slate-200">
        <button
          type="button"
          onClick={() => setActiveTab('users')}
          className={`border-b-2 px-4 py-2 text-sm font-medium ${
            activeTab === 'users'
              ? 'border-brand-700 text-brand-700'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          จัดการบัญชีผู้ใช้ ({users.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('audit')}
          className={`border-b-2 px-4 py-2 text-sm font-medium ${
            activeTab === 'audit'
              ? 'border-brand-700 text-brand-700'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          ตาราง Audit Log ({auditPagination?.total ?? 0})
        </button>
      </div>

      {activeTab === 'users' && (
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="ค้นหาชื่อผู้ใช้ หรือชื่อแสดง…"
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
              />
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
              >
                <option value="">ทุกบทบาท</option>
                <option value="admin">admin</option>
                <option value="manager">manager</option>
                <option value="staff">staff</option>
                <option value="driver">driver</option>
                <option value="customer">customer</option>
              </select>
            </div>

            <button
              type="button"
              onClick={openCreateModal}
              className="rounded-lg bg-brand-700 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-600"
            >
              + เพิ่มผู้ใช้ใหม่
            </button>
          </div>

          {usersQuery.isError && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {usersQuery.error instanceof ApiError
                ? usersQuery.error.message
                : 'ไม่สามารถโหลดรายชื่อผู้ใช้ได้'}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-600">
                <tr>
                  <th className="px-3 py-2">ID</th>
                  <th className="px-3 py-2">Username</th>
                  <th className="px-3 py-2">ชื่อ-สกุล / ชื่อแสดง</th>
                  <th className="px-3 py-2">บทบาท (Role)</th>
                  <th className="px-3 py-2">PIN</th>
                  <th className="px-3 py-2">สถานะ / ล็อก</th>
                  <th className="px-3 py-2 text-right">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => {
                  const isLocked =
                    Boolean(u.lockUntil) && Date.parse(u.lockUntil ?? '') > Date.now();
                  return (
                    <tr key={u.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2 font-mono text-xs text-slate-500">{u.id}</td>
                      <td className="px-3 py-2 font-medium text-slate-800">{u.username}</td>
                      <td className="px-3 py-2 text-slate-700">{u.displayName}</td>
                      <td className="px-3 py-2">
                        <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-700">
                          {ROLE_LABELS[u.role] ?? u.role}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {u.hasPin ? (
                          <span className="text-emerald-700">ตั้งแล้ว</span>
                        ) : (
                          <span className="text-amber-600">ยังไม่ตั้ง</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {!u.isActive ? (
                          <span className="rounded-full bg-slate-200 px-2 py-0.5 text-slate-600">
                            ปิดใช้งาน
                          </span>
                        ) : isLocked ? (
                          <span className="rounded-full bg-red-100 px-2 py-0.5 font-semibold text-red-700">
                            ถูกล็อก ({u.failedAttempts} ครั้ง)
                          </span>
                        ) : (
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">
                            ปกติ (ผิด {u.failedAttempts})
                          </span>
                        )}
                      </td>
                      <td className="space-x-2 px-3 py-2 text-right text-xs">
                        {(isLocked || u.failedAttempts > 0) && (
                          <button
                            type="button"
                            onClick={() => unlockMutation.mutate(u.id)}
                            className="rounded border border-amber-300 bg-amber-50 px-2.5 py-1 font-medium text-amber-800 hover:bg-amber-100"
                          >
                            ปลดล็อก
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => openEditModal(u)}
                          className="rounded border border-slate-200 px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-100"
                        >
                          แก้ไข / รีเซ็ต PIN
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'audit' && (
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
          <div className="grid gap-2 sm:grid-cols-4">
            <input
              type="text"
              value={auditUsername}
              onChange={(e) => {
                setAuditUsername(e.target.value);
                setAuditPage(1);
              }}
              placeholder="กรองตาม username…"
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            />
            <input
              type="text"
              value={auditAction}
              onChange={(e) => {
                setAuditAction(e.target.value);
                setAuditPage(1);
              }}
              placeholder="กรองตาม action (เช่น LOGIN_SUCCESS)…"
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            />
            <input
              type="date"
              value={auditFrom}
              onChange={(e) => {
                setAuditFrom(e.target.value);
                setAuditPage(1);
              }}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            />
            <input
              type="date"
              value={auditTo}
              onChange={(e) => {
                setAuditTo(e.target.value);
                setAuditPage(1);
              }}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            />
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
              <thead className="bg-slate-50 font-semibold uppercase text-slate-600">
                <tr>
                  <th className="px-3 py-2">เวลา</th>
                  <th className="px-3 py-2">ผู้ใช้</th>
                  <th className="px-3 py-2">บทบาท</th>
                  <th className="px-3 py-2">Action</th>
                  <th className="px-3 py-2">สถานะ</th>
                  <th className="px-3 py-2">รายละเอียด</th>
                  <th className="px-3 py-2">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {auditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-slate-500">
                      {log.createdAt}
                    </td>
                    <td className="px-3 py-2 font-medium text-slate-800">{log.username}</td>
                    <td className="px-3 py-2 text-slate-600">{log.role ?? '-'}</td>
                    <td className="px-3 py-2 font-mono font-semibold text-brand-700">
                      {log.action}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded px-2 py-0.5 font-medium ${
                          log.status === 'success'
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-red-50 text-red-700'
                        }`}
                      >
                        {log.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-600">{log.detail ?? '-'}</td>
                    <td className="px-3 py-2 font-mono text-slate-400">{log.ip ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {auditPagination && (
            <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-600">
              <span>
                หน้า {auditPagination.page} จาก {auditPagination.totalPages} (รวม{' '}
                {auditPagination.total} รายการ)
              </span>
              <div className="space-x-2">
                <button
                  type="button"
                  disabled={auditPage <= 1}
                  onClick={() => setAuditPage((p) => Math.max(1, p - 1))}
                  className="rounded border border-slate-200 px-3 py-1 disabled:opacity-40"
                >
                  ก่อนหน้า
                </button>
                <button
                  type="button"
                  disabled={auditPage >= auditPagination.totalPages}
                  onClick={() => setAuditPage((p) => p + 1)}
                  className="rounded border border-slate-200 px-3 py-1 disabled:opacity-40"
                >
                  ถัดไป
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-base font-semibold text-slate-800">
              {editingUser ? `แก้ไขผู้ใช้: ${editingUser.username}` : 'เพิ่มผู้ใช้ใหม่'}
            </h2>

            <form onSubmit={handleSaveUser} className="mt-4 space-y-3 text-sm">
              {formError && (
                <div className="rounded-lg bg-red-50 p-3 text-xs text-red-700">{formError}</div>
              )}

              {!editingUser && (
                <div>
                  <label className="block text-xs font-medium text-slate-700">Username</label>
                  <input
                    type="text"
                    required
                    value={formUsername}
                    onChange={(e) => setFormUsername(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700">ชื่อแสดง</label>
                <input
                  type="text"
                  required
                  value={formDisplayName}
                  onChange={(e) => setFormDisplayName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">บทบาท (Role)</label>
                <select
                  value={formRole}
                  onChange={(e) => setFormRole(e.target.value as UserRole)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                >
                  <option value="admin">admin — ผู้ดูแลระบบ</option>
                  <option value="manager">manager — ผู้จัดการ</option>
                  <option value="staff">staff — พนักงานสำนักงาน</option>
                  <option value="driver">driver — พนักงานขับรถ</option>
                  <option value="customer">customer — ลูกค้า</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">
                  {editingUser ? 'ตั้งรหัสผ่านใหม่ (เว้นว่างถ้าไม่เปลี่ยน)' : 'รหัสผ่านเริ่มต้น'}
                </label>
                <input
                  type="password"
                  required={!editingUser}
                  minLength={8}
                  value={formPassword}
                  onChange={(e) => setFormPassword(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">
                  {editingUser
                    ? 'รีเซ็ต PIN 4-8 หลัก (เว้นว่างถ้าไม่เปลี่ยน)'
                    : 'รหัส PIN 4-8 หลัก (สำหรับยืนยันเปลี่ยนรหัสผ่าน)'}
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  value={formPin}
                  onChange={(e) => setFormPin(e.target.value)}
                  placeholder="ตัวเลข 4-8 หลัก"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </div>

              {editingUser && (
                <label className="flex items-center gap-2 text-xs text-slate-700">
                  <input
                    type="checkbox"
                    checked={formIsActive}
                    onChange={(e) => setFormIsActive(e.target.checked)}
                  />
                  เปิดใช้งานบัญชีนี้ (is_active)
                </label>
              )}

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
