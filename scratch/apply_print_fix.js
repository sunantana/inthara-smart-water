const fs = require('fs');

const htmlPath = 'd:/13. Antigravity/Sunan/Inthara_program_develop/public/index.html';
const appPath = 'd:/13. Antigravity/Sunan/Inthara_program_develop/public/app.js';

let html = fs.readFileSync(htmlPath, 'utf8');
let app = fs.readFileSync(appPath, 'utf8');

// ==========================================
// 1. UPDATE index.html
// ==========================================
console.log('1. Updating index.html...');

// 1.1 Add @media print CSS in <head>
const printCss = `
    /* Single-Page Print Optimization for Delivery Slip */
    @media print {
      @page {
        size: A4 portrait;
        margin: 10mm 12mm;
      }
      body * {
        visibility: hidden !important;
      }
      #modalOrderSlip, #modalOrderSlip * {
        visibility: visible !important;
      }
      #modalOrderSlip {
        position: absolute !important;
        left: 0 !important;
        top: 0 !important;
        width: 100% !important;
        height: auto !important;
        background: #ffffff !important;
        padding: 0 !important;
        margin: 0 !important;
        overflow: visible !important;
        display: block !important;
        z-index: 999999 !important;
      }
      #modalOrderSlip > div {
        max-width: 100% !important;
        width: 100% !important;
        border: none !important;
        box-shadow: none !important;
        padding: 0 !important;
        margin: 0 !important;
        overflow: visible !important;
      }
      #modalOrderSlip .border-b,
      #modalOrderSlip button,
      #modalOrderSlip .flex.items-center.justify-between.pt-2 {
        display: none !important;
      }
      #orderSlipPrintableArea {
        border: 1px solid #94a3b8 !important;
        border-radius: 6px !important;
        padding: 14px 18px !important;
        margin: 0 auto !important;
        width: 100% !important;
        max-width: 185mm !important;
        page-break-inside: avoid !important;
        page-break-after: avoid !important;
      }
      html, body {
        background: #ffffff !important;
        color: #0f172a !important;
        height: auto !important;
        overflow: visible !important;
      }
    }
`;

if (!html.includes('Single-Page Print Optimization')) {
  html = html.replace('</style>', printCss + '\n  </style>');
  console.log('✓ Added @media print CSS to index.html');
}

// 1.2 Update print button label in modalOrderSlip
const oldPrintBtn = '<button type="button" onclick="printOrderSlip()" class="bg-sky-600 hover:bg-sky-700 text-white font-bold px-4 py-2 rounded-xl text-xs transition shadow-sm flex items-center gap-1.5">\n          <span>🖨️</span> <span>พิมพ์เอกสารใบส่งของ</span>\n        </button>';
const newPrintBtn = `<div class="flex items-center gap-2">
          <button type="button" onclick="printOrderSlip()" class="bg-sky-600 hover:bg-sky-700 text-white font-bold px-4 py-2 rounded-xl text-xs transition shadow-sm flex items-center gap-1.5" title="พิมพ์เฉพาะใบส่งของนี้ พอดี 1 หน้า A4">
            <span>🖨️</span> <span>พิมพ์ใบส่งของ (หน้าเดียว)</span>
          </button>
          <span class="text-[11px] text-slate-500 hidden sm:inline">เฉพาะเอกสารใบนี้ พอดี 1 หน้า A4</span>
        </div>`;

if (html.includes('<span>พิมพ์เอกสารใบส่งของ</span>')) {
  html = html.replace(oldPrintBtn, newPrintBtn);
  console.log('✓ Updated print button label and hint');
}

fs.writeFileSync(htmlPath, html, 'utf8');
console.log('✓ Saved index.html');


// ==========================================
// 2. UPDATE app.js (Dedicated single-page iframe print)
// ==========================================
console.log('2. Updating app.js printOrderSlip function...');

const oldPrintFnStart = 'function printOrderSlip() {';
const oldPrintFnEnd = 'function printOrderSlip() {\n  window.print();\n}';

const newPrintFn = `function printOrderSlip(targetOrderId) {
  const orderId = targetOrderId || document.getElementById('slipOrderId')?.textContent?.trim();
  const ord = (appData?.orders || []).find(o => o.orderId === orderId);

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
}`;

if (app.includes(oldPrintFnEnd)) {
  app = app.replace(oldPrintFnEnd, newPrintFn);
  fs.writeFileSync(appPath, app, 'utf8');
  console.log('✓ Successfully updated printOrderSlip in app.js');
} else {
  console.error('Could not find oldPrintFnEnd in app.js');
  process.exit(1);
}
