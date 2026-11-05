import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { findModule } from '../../lib/modules';

const module = findModule('TMS');

/**
 * TMS (SRS §3.7) — Phase 0: ทดสอบว่า Leaflet + OpenStreetMap ใช้งานได้ใน stack จริง
 * พิกัดโรงงานจริงจะมาจากข้อมูลเดิม/การตั้งค่าใน Phase 6 (ยังไม่ใส่ค่าสมมติลงฐานข้อมูล)
 * จุดกลางแผนที่นี้ใช้กรุงเทพฯ เป็นเพียงจุดเริ่มต้นเพื่อทดสอบการเรนเดอร์
 */
const TEMP_MAP_CENTER: [number, number] = [13.7563, 100.5018];

export default function TmsPage() {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const map = L.map(containerRef.current, { center: TEMP_MAP_CENTER, zoom: 11 });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors',
    }).addTo(map);

    return () => {
      map.remove();
    };
  }, []);

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold text-slate-800">{module.label}</h1>
        <span className="rounded-full bg-slate-200 px-3 py-1 font-mono text-xs text-slate-600">
          {module.code} · SRS §{module.srsSection}
        </span>
      </header>

      <p className="text-slate-600">{module.description}</p>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div ref={containerRef} className="h-96 w-full" />
        <p className="border-t border-slate-200 px-4 py-3 text-xs text-slate-500">
          แผนที่ทดสอบ (Leaflet + OpenStreetMap) — การวางแผนเส้นทาง/ปักหมุด/lากลำดับป้าย
          จะทำใน Phase 6 ตามแผนงาน
        </p>
      </div>
    </section>
  );
}
