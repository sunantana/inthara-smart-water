const fs = require('fs');

const htmlPath = 'd:/13. Antigravity/Sunan/Inthara_program_develop/public/index.html';
const appPath = 'd:/13. Antigravity/Sunan/Inthara_program_develop/public/app.js';

let html = fs.readFileSync(htmlPath, 'utf8');
let app = fs.readFileSync(appPath, 'utf8');

// ==========================================
// 1. UPDATE index.html
// ==========================================
console.log('1. Updating index.html header in saved trips table...');

const oldHeader = `<th class="p-2.5 text-right font-bold">ยอดเงิน</th>
                  <th class="p-2.5 text-center font-bold">สถานะ</th>
                </tr>`;

const newHeader = `<th class="p-2.5 text-right font-bold">ยอดเงิน</th>
                  <th class="p-2.5 text-center font-bold">สถานะ</th>
                  <th class="p-2.5 text-center font-bold whitespace-nowrap">จัดการ / ดูบิล</th>
                </tr>`;

if (html.includes(oldHeader)) {
  html = html.replace(oldHeader, newHeader);
  fs.writeFileSync(htmlPath, html, 'utf8');
  console.log('✓ Successfully added "จัดการ / ดูบิล" column header in index.html');
} else {
  console.log('Warning: Header pattern not found in index.html');
}

// ==========================================
// 2. UPDATE app.js
// ==========================================
console.log('2. Updating app.js renderSavedTripsTable and openOrderSlipFromTrip...');

// 2.1 Update renderSavedTripsTable row generation
const oldRowPattern = `<td class="p-2.5 text-center">
          <span class="bg-emerald-100 text-emerald-800 text-[11px] font-bold px-2.5 py-0.5 rounded-full shadow-2xs">\${t.status || 'ส่งสำเร็จ'}</span>
        </td>
      </tr>`;

const newRowPattern = `<td class="p-2.5 text-center">
          <span class="bg-emerald-100 text-emerald-800 text-[11px] font-bold px-2.5 py-0.5 rounded-full shadow-2xs">\${t.status || 'ส่งสำเร็จ'}</span>
        </td>
        <td class="p-2.5 text-center whitespace-nowrap">
          <button type="button" onclick="openOrderSlipFromTrip('\${t.tripId}')" class="bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-200 font-bold px-2.5 py-1 rounded text-xs transition shadow-2xs inline-flex items-center gap-1" title="ดูบิลและพิมพ์ใบส่งของ">
            <span>📄</span> <span>ดูบิล</span>
          </button>
        </td>
      </tr>`;

if (app.includes(oldRowPattern)) {
  app = app.replace(oldRowPattern, newRowPattern);
  console.log('✓ Successfully added "ดูบิล" button in savedTrips table row');
} else {
  console.log('Warning: oldRowPattern not found in app.js');
}

// Update empty state colspan="9" to colspan="10" in renderSavedTripsTable
app = app.replace(
  'tbody.innerHTML = `<tr><td colspan="9" class="p-6 text-center',
  'tbody.innerHTML = `<tr><td colspan="10" class="p-6 text-center'
);

// 2.2 Update openOrderSlipModal, openOrderSlipFromTrip, and printOrderSlip
const oldSlipStart = 'function openOrderSlipModal(orderId) {';
const oldSlipEnd = 'function printOrderSlip(targetOrderId) {';

const sStart = app.indexOf(oldSlipStart);
const sPrintStart = app.indexOf(oldSlipEnd, sStart);

if (sStart === -1 || sPrintStart === -1) {
  console.error('Error: could not find slip functions in app.js');
  process.exit(1);
}

// Find the end of printOrderSlip
const sPrintEnd = app.indexOf('// ==========================================\n// CUSTOMER SECURITY & ACCESS MANAGEMENT', sPrintStart);

const newSlipLogic = `let currentSlipOrder = null;

function populateAndShowOrderSlip(ord) {
  currentSlipOrder = ord;
  const modal = document.getElementById('modalOrderSlip');
  if (!modal) return;

  const cust = (appData?.customers || []).find(c => c.id === ord.customerId) || {};

  document.getElementById('slipOrderId').textContent = ord.orderId;
  document.getElementById('slipDeliveryDate').textContent = ord.deliveryDate || '-';
  document.getElementById('slipDeliveryTime').textContent = (ord.deliveryTime || '09:00') + ' น.';
  document.getElementById('slipCustomerName').textContent = ord.customerName || cust.name || '-';
  document.getElementById('slipCustomerId').textContent = ord.customerId || '-';
  document.getElementById('slipCustomerPhone').textContent = ord.customerPhone || cust.phone || '-';
  document.getElementById('slipCustomerZone').textContent = ord.zone || cust.zone || '-';
  document.getElementById('slipCustomerAddress').textContent = ord.address || cust.address || '-';
  document.getElementById('slipPaymentTerm').textContent = ord.paymentTerm || cust.paymentTerm || 'เงินสด / โอนเงิน';
  document.getElementById('slipNotes').textContent = ord.notes || '-';

  const badgeEl = document.getElementById('slipStatusBadge');
  if (badgeEl) {
    if (ord.orderStatus === 'จัดส่งสำเร็จแล้ว') {
      badgeEl.className = 'text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded text-[10px] font-bold';
      badgeEl.textContent = '✓ จัดส่งสำเร็จแล้ว';
    } else {
      badgeEl.className = 'text-amber-800 bg-amber-100 px-2 py-0.5 rounded text-[10px] font-bold';
      badgeEl.textContent = '⏳ ยังไม่ได้จัดส่ง';
    }
  }

  // Items
  const items = [];
  if (Number(ord.qty189L || 0) > 0) {
    items.push({ name: 'น้ำดื่มถัง 18.9 ลิตร (ฝาปิดมาตรฐาน)', qty: Number(ord.qty189L), unit: 'ถัง', price: Number(ord.unitPrice189L || 15) });
  }
  if (Number(ord.qty350ml || 0) > 0) {
    items.push({ name: 'น้ำดื่มแพ็ค 350 ml (12 ขวด)', qty: Number(ord.qty350ml), unit: 'แพ็ค', price: Number(ord.unitPrice350ml || 35) });
  }
  if (Number(ord.qty600ml || 0) > 0) {
    items.push({ name: 'น้ำดื่มแพ็ค 600 ml (12 ขวด)', qty: Number(ord.qty600ml), unit: 'แพ็ค', price: Number(ord.unitPrice600ml || 35) });
  }
  if (Number(ord.qty1500ml || 0) > 0) {
    items.push({ name: 'น้ำดื่มแพ็ค 1.5 ลิตร (6 ขวด)', qty: Number(ord.qty1500ml), unit: 'แพ็ค', price: Number(ord.unitPrice1500ml || 35) });
  }

  // Fallback if items were not individually recorded
  if (items.length === 0 && Number(ord.totalAmount || 0) > 0) {
    items.push({ name: 'สินค้าจัดส่งตามสายส่ง', qty: 1, unit: 'รอบ', price: Number(ord.totalAmount) });
  }

  const tbody = document.getElementById('slipItemsTableBody');
  if (tbody) {
    tbody.innerHTML = items.map((it, idx) => \`
      <tr>
        <td class="p-2">\${idx + 1}. \${it.name}</td>
        <td class="p-2 text-center font-bold">\${it.qty} \${it.unit}</td>
        <td class="p-2 text-right font-mono">฿\${it.price.toLocaleString()}</td>
        <td class="p-2 text-right font-mono font-bold">฿\${(it.qty * it.price).toLocaleString()}</td>
      </tr>
    \`).join('');
  }

  const totalEl = document.getElementById('slipTotalAmount');
  if (totalEl) {
    totalEl.textContent = \`฿\${Number(ord.totalAmount || 0).toLocaleString()} บาท\`;
  }

  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function openOrderSlipModal(orderId) {
  const ord = (appData?.orders || []).find(o => o.orderId === orderId);
  if (!ord) return alert('ไม่พบข้อมูลออเดอร์นี้');
  populateAndShowOrderSlip(ord);
}

function openOrderSlipFromTrip(tripId) {
  const trip = (appData?.savedTrips || []).find(t => t.tripId === tripId);
  if (!trip) return alert('ไม่พบข้อมูลประวัติสายส่งนี้');

  let ord = null;
  if (trip.orderId) {
    ord = (appData?.orders || []).find(o => o.orderId === trip.orderId);
  }
  if (!ord && trip.customerId) {
    ord = (appData?.orders || []).find(o => o.customerId === trip.customerId && o.deliveryDate === trip.date);
  }

  if (!ord) {
    // Synthesize slip from trip data
    const cust = (appData?.customers || []).find(c => c.id === trip.customerId) || {};
    const b189 = Number(trip.totalBottles189L || 0);
    const pTotal = Number(trip.totalPacks || 0);
    const p189Price = Number(cust.price189L || 15);
    const p600Price = Number(cust.price600ml || 35);
    const totalRev = Number(trip.totalRevenue || (b189 * p189Price + pTotal * p600Price));

    ord = {
      orderId: trip.orderId || trip.tripId,
      customerId: trip.customerId || cust.id || '-',
      customerName: trip.customerName || cust.name || trip.vehicleName || 'ลูกค้าสายส่ง',
      customerPhone: cust.phone || '-',
      zone: cust.zone || '-',
      address: cust.address || '-',
      deliveryDate: trip.date,
      deliveryTime: trip.time || '09:00',
      qty189L: b189,
      qty350ml: 0,
      qty600ml: pTotal,
      qty1500ml: 0,
      unitPrice189L: p189Price,
      unitPrice600ml: p600Price,
      totalAmount: totalRev,
      paymentTerm: cust.paymentTerm || 'เงินสด / โอนเงิน',
      orderStatus: trip.status || 'จัดส่งสำเร็จแล้ว',
      notes: \`อ้างอิงรหัสสายส่ง: \${trip.tripId}\`
    };
  }

  populateAndShowOrderSlip(ord);
}

function closeOrderSlipModal() {
  const modal = document.getElementById('modalOrderSlip');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

function printOrderSlip(targetOrderId) {
  let ord = null;
  if (targetOrderId) {
    ord = (appData?.orders || []).find(o => o.orderId === targetOrderId);
  }
  if (!ord && currentSlipOrder) {
    ord = currentSlipOrder;
  }
  if (!ord) {
    const orderId = document.getElementById('slipOrderId')?.textContent?.trim();
    if (orderId) ord = (appData?.orders || []).find(o => o.orderId === orderId);
  }

  if (!ord) {
    window.print();
    return;
  }

  const cust = (appData?.customers || []).find(c => c.id === ord.customerId) || {};

  // Build items array
  const items = [];
  if (Number(ord.qty189L || 0) > 0) {
    items.push({ name: 'น้ำดื่มถัง 18.9 ลิตร (ฝาปิดมาตรฐาน)', qty: Number(ord.qty189L), unit: 'ถัง', price: Number(ord.unitPrice189L || 15) });
  }
  if (Number(ord.qty350ml || 0) > 0) {
    items.push({ name: 'น้ำดื่มแพ็ค 350 ml (12 ขวด)', qty: Number(ord.qty350ml), unit: 'แพ็ค', price: Number(ord.unitPrice350ml || 35) });
  }
  if (Number(ord.qty600ml || 0) > 0) {
    items.push({ name: 'น้ำดื่มแพ็ค 600 ml (12 ขวด)', qty: Number(ord.qty600ml), unit: 'แพ็ค', price: Number(ord.unitPrice600ml || 35) });
  }
  if (Number(ord.qty1500ml || 0) > 0) {
    items.push({ name: 'น้ำดื่มแพ็ค 1.5 ลิตร (6 ขวด)', qty: Number(ord.qty1500ml), unit: 'แพ็ค', price: Number(ord.unitPrice1500ml || 35) });
  }
  if (items.length === 0 && Number(ord.totalAmount || 0) > 0) {
    items.push({ name: 'สินค้าจัดส่งตามสายส่ง', qty: 1, unit: 'รอบ', price: Number(ord.totalAmount) });
  }

  const itemsHtml = items.map((it, idx) => \`
    <tr>
      <td style="text-align: center; border: 1px solid #94a3b8; padding: 6px 8px;">\${idx + 1}</td>
      <td style="border: 1px solid #94a3b8; padding: 6px 8px;"><b>\${it.name}</b></td>
      <td style="text-align: center; border: 1px solid #94a3b8; padding: 6px 8px; font-weight: bold;">\${it.qty} \${it.unit}</td>
      <td style="text-align: right; border: 1px solid #94a3b8; padding: 6px 8px; font-family: monospace;">฿\${Number(it.price).toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
      <td style="text-align: right; border: 1px solid #94a3b8; padding: 6px 8px; font-weight: bold; font-family: monospace;">฿\${Number(it.qty * it.price).toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
    </tr>
  \`).join('');

  // Remove existing print iframe if any
  let iframe = document.getElementById('printDeliverySlipIframe');
  if (iframe) iframe.remove();

  iframe = document.createElement('iframe');
  iframe.id = 'printDeliverySlipIframe';
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.visibility = 'hidden';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow.document;
  doc.open();
  doc.write(\`
<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8">
  <title>ใบส่งของ_\${ord.orderId}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 10mm 12mm;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    html, body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      color: #0f172a;
      font-family: 'Prompt', 'Sarabun', 'Segoe UI', Tahoma, sans-serif;
      font-size: 13px;
      line-height: 1.35;
    }
    .slip-container {
      width: 100%;
      max-width: 186mm;
      margin: 0 auto;
      border: 1.5px solid #0284c7;
      border-radius: 8px;
      padding: 16px 20px;
      page-break-inside: avoid;
      page-break-after: avoid;
    }
    .header-table {
      width: 100%;
      border-bottom: 2px solid #0284c7;
      padding-bottom: 8px;
      margin-bottom: 10px;
    }
    .company-title {
      font-size: 18px;
      font-weight: 800;
      color: #0369a1;
      margin: 0 0 2px 0;
    }
    .doc-badge {
      display: inline-block;
      background: #0284c7;
      color: #ffffff;
      padding: 4px 14px;
      border-radius: 6px;
      font-size: 15px;
      font-weight: bold;
      letter-spacing: 0.5px;
    }
    .info-box {
      width: 100%;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      background: #f8fafc;
      padding: 9px 12px;
      margin-bottom: 12px;
      font-size: 12.5px;
    }
    .info-table {
      width: 100%;
      border-collapse: collapse;
    }
    .info-table td {
      padding: 3px 6px;
      vertical-align: top;
    }
    table.data-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 10px;
      font-size: 12.5px;
    }
    table.data-table th {
      background: #e2e8f0;
      color: #1e293b;
      font-weight: bold;
      border: 1px solid #94a3b8;
      padding: 6px 8px;
    }
    table.data-table td {
      padding: 6px 8px;
      border: 1px solid #94a3b8;
    }
    .signatures-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 14px;
      padding-top: 10px;
      border-top: 1px solid #cbd5e1;
      text-align: center;
      font-size: 11.5px;
      page-break-inside: avoid;
    }
    .signatures-table td {
      padding: 10px 15px 0 15px;
      vertical-align: top;
    }
    .sig-dots {
      border-bottom: 1px dashed #64748b;
      height: 38px;
      width: 170px;
      margin: 0 auto 6px auto;
    }
    .footer-note {
      text-align: center;
      font-size: 10.5px;
      color: #64748b;
      margin-top: 12px;
      border-top: 1px dashed #cbd5e1;
      padding-top: 6px;
    }
  </style>
</head>
<body>
  <div class="slip-container">
    <!-- Header -->
    <table class="header-table">
      <tr>
        <td style="vertical-align: top;">
          <div class="company-title">💧 บริษัท น้ำดื่มอินทรา จำกัด</div>
          <div style="font-size: 11px; color: #475569;">โรงงานผลิตและจำหน่ายน้ำดื่มมาตรฐาน สะอาด ปลอดภัย</div>
          <div style="font-size: 11px; color: #64748b;">ต.จริม อ.ท่าปลา จ.อุตรดิตถ์ 53150 • โทร. 085-279-8343</div>
        </td>
        <td style="text-align: right; vertical-align: top;">
          <div class="doc-badge">ใบส่งของ / ใบเสร็จรับเงิน</div>
          <div style="font-size: 13px; font-weight: bold; font-family: monospace; color: #0284c7; margin-top: 4px;">
            เลขที่: \${ord.orderId}
          </div>
        </td>
      </tr>
    </table>

    <!-- Info Box -->
    <div class="info-box">
      <table class="info-table">
        <tr>
          <td style="width: 50%;">
            <b>ชื่อลูกค้า:</b> <span style="font-size: 13px; font-weight: bold; color: #0f172a;">\${ord.customerName || cust.name || '-'}</span> 
            <span style="color: #64748b; font-size: 11px;">[\${ord.customerId}]</span>
          </td>
          <td style="width: 50%;">
            <b>วันที่จัดส่ง:</b> <span style="font-weight: bold;">\${ord.deliveryDate || '-'}</span> 
            <b>เวลา:</b> \${ord.deliveryTime || '09:00'} น.
          </td>
        </tr>
        <tr>
          <td>
            <b>เบอร์โทรศัพท์:</b> <span style="font-family: monospace;">\${ord.customerPhone || cust.phone || '-'}</span>
          </td>
          <td>
            <b>โซนจัดส่ง:</b> \${ord.zone || cust.zone || '-'}
          </td>
        </tr>
        <tr>
          <td colspan="2" style="border-top: 1px dashed #cbd5e1; padding-top: 4px; margin-top: 2px;">
            <b>สถานที่จัดส่ง:</b> \${ord.address || cust.address || '-'}
          </td>
        </tr>
      </table>
    </div>

    <!-- Items Table -->
    <table class="data-table">
      <thead>
        <tr>
          <th style="width: 40px; text-align: center;">ลำดับ</th>
          <th>รายการสินค้า</th>
          <th style="width: 100px; text-align: center;">จำนวน</th>
          <th style="width: 110px; text-align: right;">ราคา/หน่วย</th>
          <th style="width: 120px; text-align: right;">รวมเงิน (บาท)</th>
        </tr>
      </thead>
      <tbody>
        \${itemsHtml}
      </tbody>
      <tfoot>
        <tr style="background: #f1f5f9; font-weight: bold; font-size: 13px;">
          <td colspan="4" style="text-align: right; border: 1px solid #94a3b8; padding: 7px 8px;">
            ยอดรวมสุทธิทั้งสิ้น (Grand Total):
          </td>
          <td style="text-align: right; border: 1px solid #94a3b8; padding: 7px 8px; font-size: 14px; color: #047857; font-family: monospace;">
            ฿\${Number(ord.totalAmount || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}
          </td>
        </tr>
      </tfoot>
    </table>

    <!-- Payment & Status -->
    <table style="width: 100%; font-size: 12px; margin-bottom: 8px;">
      <tr>
        <td style="width: 50%;">
          <b>เงื่อนไขการชำระเงิน:</b> \${ord.paymentTerm || cust.paymentTerm || 'เงินสด / โอนเงิน'}
        </td>
        <td style="width: 50%; text-align: right;">
          <b>สถานะออเดอร์:</b> <span style="font-weight: bold; color: \${ord.orderStatus === 'จัดส่งสำเร็จแล้ว' ? '#047857' : '#b45309'};">\${ord.orderStatus || 'ยังไม่ได้จัดส่ง'}</span>
        </td>
      </tr>
      \${ord.notes ? \`<tr><td colspan="2" style="padding-top: 3px; color: #475569;"><b>หมายเหตุ:</b> \${ord.notes}</td></tr>\` : ''}
    </table>

    <!-- Signatures -->
    <table class="signatures-table">
      <tr>
        <td style="width: 50%;">
          <div class="sig-dots"></div>
          <div>ลงชื่อ .................................................... ผู้รับสินค้า / ลูกค้า</div>
          <div style="font-size: 10.5px; color: #64748b; margin-top: 3px;">วันที่ ..... / ..... / ..........</div>
        </td>
        <td style="width: 50%;">
          <div class="sig-dots"></div>
          <div>ลงชื่อ .................................................... ผู้ส่งสินค้า / พนักงาน</div>
          <div style="font-size: 10.5px; color: #64748b; margin-top: 3px;">วันที่ ..... / ..... / ..........</div>
        </td>
      </tr>
    </table>

    <!-- Footer Note -->
    <div class="footer-note">
      ได้รับสินค้าตามรายการข้างต้นถูกต้อง ครบถ้วน และอยู่ในสภาพสมบูรณ์เรียบร้อยแล้ว • ขอบพระคุณที่ไว้วางใจน้ำดื่มอินทรา
    </div>
  </div>
</body>
</html>
  \`);
  doc.close();

  // Trigger print after iframe renders
  setTimeout(() => {
    iframe.contentWindow.focus();
    iframe.contentWindow.print();
  }, 250);
}
`;

app = app.slice(0, sStart) + newSlipLogic + app.slice(sPrintEnd);
fs.writeFileSync(appPath, app, 'utf8');
console.log('✓ Successfully written updated slip functions to app.js');
