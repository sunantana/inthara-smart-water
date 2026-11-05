import type { ModuleCode } from '../../lib/modules';
import { findModule } from '../../lib/modules';

interface ModulePlaceholderProps {
  code: ModuleCode;
}

/**
 * หน้าเปล่าของโมดูล — Phase 0 สร้างเฉพาะโครง route/layout
 * เนื้อหาจริงจะทำใน Phase ของโมดูลนั้นตาม docs/specs/05_แผนงาน_Freebuff_Phases.md
 */
export default function ModulePlaceholder({ code }: ModulePlaceholderProps) {
  const module = findModule(code);

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold text-slate-800">{module.label}</h1>
        <span className="rounded-full bg-slate-200 px-3 py-1 font-mono text-xs text-slate-600">
          {module.code} · SRS §{module.srsSection}
        </span>
      </header>

      <p className="text-slate-600">{module.description}</p>

      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6">
        <p className="font-medium text-slate-700">หน้านี้ยังไม่ถูกพัฒนา (Phase 0)</p>
        <p className="mt-1 text-sm text-slate-500">
          Phase 0 สร้างเฉพาะโครงโปรเจกต์ เมนู และเส้นทาง (route) ของทั้ง 16 โมดูล
          ฟังก์ชันจริงจะเพิ่มใน Phase ถัดไปตามแผนงาน
        </p>
        <p className="mt-3 text-sm text-slate-500">
          เส้นทาง: <code className="rounded bg-slate-100 px-1.5 py-0.5">{module.path}</code>
        </p>
      </div>
    </section>
  );
}
