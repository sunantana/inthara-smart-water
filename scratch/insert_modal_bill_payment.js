const fs = require('fs');

const indexPath = 'd:/13. Antigravity/Sunan/Inthara_program_develop/public/index.html';
let indexContent = fs.readFileSync(indexPath, 'utf8');

const modalBillPaymentHtml = `  <!-- MODAL: Bill Payment & Settlement Manager -->
  <div id="modalBillPayment" class="fixed inset-0 bg-slate-900/60 hidden items-center justify-center z-50 p-4">
    <div class="bg-white rounded-2xl max-w-xl w-full p-5 shadow-2xl space-y-3.5 max-h-[92vh] overflow-y-auto">
      
      <!-- Header -->
      <div class="flex items-center justify-between border-b pb-2.5">
        <div class="flex items-center gap-2">
          <span class="w-8 h-8 rounded-lg bg-amber-500 text-white font-black text-base flex items-center justify-center shadow-2xs">💳</span>
          <div>
            <h3 class="font-bold text-slate-800 text-sm">ระบบจัดการบิลและรับชำระค้างชำระ</h3>
            <p class="text-[11px] text-slate-500">บันทึกรับเงินชำระหนี้ / ตัดยอดบิลค้างชำระ</p>
          </div>
        </div>
        <button type="button" onclick="closeBillPaymentModal()" class="text-slate-400 hover:text-slate-600 text-xl font-bold p-1">✕</button>
      </div>

      <!-- Customer Summary Card -->
      <div class="bg-amber-50/80 border border-amber-200 rounded-xl p-3 flex items-center justify-between">
        <div>
          <div class="font-bold text-amber-950 text-xs flex items-center gap-1.5" id="billPayCustTitle">
            <span>👤 เลือกข้อมูลลูกค้า...</span>
          </div>
          <div class="text-[11px] text-slate-600 mt-0.5" id="billPayCustSub">-</div>
        </div>
        <div class="text-right">
          <span class="text-[10px] text-slate-500 block">ยอดหนี้ค้างสะสมรวม:</span>
          <span class="text-base font-black text-rose-700 font-mono" id="billPayCustTotalDebt">฿0</span>
        </div>
      </div>

      <!-- Unpaid Orders Table / Selector -->
      <div class="rounded-xl border border-slate-200 bg-slate-50/50 p-3 space-y-2">
        <div class="flex items-center justify-between text-xs font-bold text-slate-700">
          <span>📋 รายการบิลที่ค้างชำระ</span>
          <span class="text-[10px] font-normal text-slate-500" id="billPayOrdersCountNotice"></span>
        </div>
        
        <div class="max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-2xs">
          <table class="w-full text-left text-xs border-collapse">
            <thead>
              <tr class="bg-slate-100 text-slate-600 border-b border-slate-200 text-[11px]">
                <th class="p-2 text-center w-10">เลือก</th>
                <th class="p-2">เลขที่บิล / วันที่</th>
                <th class="p-2 text-right">ยอดบิล</th>
                <th class="p-2 text-right">จ่ายแล้ว</th>
                <th class="p-2 text-right font-bold text-rose-700">ค้างชำระ</th>
              </tr>
            </thead>
            <tbody id="billPayOrdersTableBody" class="divide-y divide-slate-100"></tbody>
          </table>
        </div>
      </div>

      <!-- Payment Form -->
      <form onsubmit="submitBillPayment(event)" class="space-y-3 text-xs">
        <input type="hidden" id="billPayCustomerId" />
        <input type="hidden" id="billPayOrderId" />

        <div class="rounded-xl border border-slate-200 bg-white p-3 space-y-2.5 shadow-2xs">
          <div class="font-bold text-slate-800 text-xs flex items-center gap-1.5 pb-1 border-b border-slate-100">
            <span>💵</span> <span>รายละเอียดการรับเงินชำระ</span>
          </div>

          <div class="grid grid-cols-2 gap-2.5">
            <!-- Amount Input -->
            <div>
              <label class="block text-slate-600 font-semibold mb-1">ยอดเงินที่รับชำระจริง (บาท) *</label>
              <div class="flex items-center gap-1">
                <span class="font-bold text-slate-400 text-sm">฿</span>
                <input id="billPayAmount" type="number" min="1" step="1" required class="w-full border border-emerald-300 bg-emerald-50/20 rounded-lg px-2.5 py-1.5 text-base font-black text-emerald-800 text-right font-mono focus:bg-white" />
              </div>
            </div>

            <!-- Payment Method -->
            <div>
              <label class="block text-slate-600 font-semibold mb-1">ช่องทางรับเงิน *</label>
              <select id="billPayMethod" required class="w-full border border-slate-300 rounded-lg px-2.5 py-2 font-medium bg-white">
                <option value="เงินสด">🟢 เงินสด (Cash)</option>
                <option value="โอนเงินผ่านธนาคาร / พร้อมเพย์">🔵 โอนเงินผ่านธนาคาร / พร้อมเพย์</option>
                <option value="เช็ค / ตั๋วสัญญาใช้เงิน">⚪ เช็คธนาคาร / วางบิล</option>
              </select>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-2.5 pt-1">
            <!-- Payment Date -->
            <div>
              <label class="block text-slate-600 font-semibold mb-1">วันที่รับชำระ *</label>
              <input id="billPayDate" type="date" required class="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 font-medium bg-white" />
            </div>

            <!-- Notes / Slip Ref -->
            <div>
              <label class="block text-slate-600 font-semibold mb-1">หมายเหตุ / อ้างอิงสลิป</label>
              <input id="billPayNotes" type="text" placeholder="เช่น สลิปโอนเงิน, รับเงินสดที่โรงงาน..." class="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 bg-slate-50 focus:bg-white" />
            </div>
          </div>
        </div>

        <!-- Buttons -->
        <div class="flex items-center justify-between pt-1 border-t border-slate-100">
          <button type="button" onclick="closeBillPaymentModal()" class="px-4 py-2 rounded-xl border border-slate-300 text-slate-600 font-semibold text-xs hover:bg-slate-50 transition">ยกเลิก</button>
          <button type="submit" id="btnSubmitBillPayment" class="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm transition flex items-center gap-1.5">
            <span>✅</span> <span>บันทึกรับเงินชำระหนี้</span>
          </button>
        </div>
      </form>
    </div>
  </div>\n\n`;

const target = '<!-- MODAL: Printable Order Slip / Delivery Bill -->';
if (!indexContent.includes('id="modalBillPayment"')) {
  if (indexContent.includes(target)) {
    indexContent = indexContent.replace(target, modalBillPaymentHtml + '  ' + target);
    fs.writeFileSync(indexPath, indexContent, 'utf8');
    console.log('✓ Successfully inserted modalBillPayment into index.html');
  } else {
    console.error('Target not found in index.html');
  }
} else {
  console.log('modalBillPayment already in index.html');
}
