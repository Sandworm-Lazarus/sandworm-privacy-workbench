(function () {
  'use strict';

  function initialize() {
    const ids = ['source', 'output', 'mode-json', 'mode-text', 'email-rule', 'default-fields',
      'custom-fields', 'redact-btn', 'demo-btn', 'clear-btn', 'upload-btn', 'file-input',
      'drop-zone', 'review-check', 'copy-btn', 'download-btn', 'status', 'error-box',
      'email-count', 'field-count', 'input-size', 'output-size', 'result-badge',
      'source-label', 'hide-source', 'source-cover', 'source-panel'];
    const el = Object.fromEntries(ids.map(id => [id, document.getElementById(id)]));
    if (ids.some(id => !el[id]) || !globalThis.PrivacyGuard) return;
    const guard = globalThis.PrivacyGuard;
    const presidio = Object.fromEntries(['presidio-import','presidio-file','presidio-panel','presidio-summary','presidio-findings'].map(id=>[id,document.getElementById(id)]));
    function resetPresidio(){
      if(presidio['presidio-panel']) presidio['presidio-panel'].hidden=true;
      if(presidio['presidio-findings']) presidio['presidio-findings'].replaceChildren();
      if(presidio['presidio-summary']) presidio['presidio-summary'].textContent='';
    }
    const hint = document.getElementById('mode-hint');
    const encoder = new TextEncoder();
    let mode = 'json';
    let revision = 0;
    let result = null;
    let dragDepth = 0;

    const errors = Object.freeze({
      INVALID_INPUT: 'ข้อมูลต้องเป็นข้อความ กรุณาตรวจสอบแล้วลองอีกครั้ง',
      INVALID_OPTIONS: 'กฎที่กำหนดไม่ถูกต้อง กรุณาตรวจสอบชื่อฟิลด์',
      INPUT_TOO_LARGE: 'ข้อมูลมีขนาดเกิน 1 MiB กรุณาลดขนาดแล้วลองอีกครั้ง',
      OUTPUT_TOO_LARGE: 'ผลลัพธ์มีขนาดเกิน 1 MiB กรุณาลดขนาดข้อมูล',
      INVALID_UNICODE: 'ข้อมูลมีอักขระหรือรูปแบบ UTF-8 ที่ไม่ถูกต้อง',
      INVALID_JSON: 'JSON ไม่ถูกต้อง กรุณาตรวจสอบรูปแบบ หรือเลือกโหมดข้อความ',
      DUPLICATE_KEY: 'JSON มีชื่อคีย์ซ้ำ กรุณาแก้ไขก่อนประมวลผล',
      MAX_DEPTH: 'JSON ซ้อนกันลึกเกินขีดจำกัด 32 ระดับ',
      MAX_NODES: 'JSON มีค่ามากเกินขีดจำกัด 50,000 ค่า'
    });

    function byteLabel(bytes) {
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KiB';
      return (bytes / (1024 * 1024)).toFixed(2) + ' MiB';
    }

    function say(message) { el.status.textContent = message; }
    function error(message) {
      el['error-box'].textContent = message;
      el['error-box'].hidden = false;
      say('ยังไม่มีผลลัพธ์สำหรับส่งออก');
    }

    function syncExport() {
      const ready = result !== null && el['review-check'].checked;
      el['copy-btn'].disabled = !ready;
      el['download-btn'].disabled = !ready;
      el['result-badge'].textContent = result === null ? 'รอประมวลผล' : ready ? 'ตรวจทานแล้ว' : 'รอตรวจทาน';
    }

    function invalidate(message) {
      revision += 1;
      resetPresidio();
      result = null;
      el.output.value = '';
      el['review-check'].checked = false;
      el['review-check'].disabled = true;
      el['email-count'].textContent = '—';
      el['field-count'].textContent = '—';
      el['output-size'].textContent = '—';
      el['input-size'].textContent = byteLabel(encoder.encode(el.source.value).byteLength);
      el['error-box'].hidden = true;
      el['error-box'].textContent = '';
      syncExport();
      if (message) say(message);
      return revision;
    }

    function syncMode() {
      el['mode-json'].setAttribute('aria-pressed', String(mode === 'json'));
      el['mode-text'].setAttribute('aria-pressed', String(mode === 'text'));
      el['default-fields'].disabled = mode !== 'json';
      el['custom-fields'].disabled = mode !== 'json';
      if (hint) hint.textContent = mode === 'json'
        ? 'ปิดบังค่าในฟิลด์ที่เลือกและอีเมลในข้อความ โดยคงชื่อคีย์เดิม'
        : 'โหมดข้อความปิดบังอีเมลตามกฎเท่านั้น กฎชื่อฟิลด์ใช้กับ JSON';
    }

    function setMode(next) {
      if (mode === next) return;
      mode = next;
      syncMode();
      invalidate('เปลี่ยนโหมดแล้ว กรุณาประมวลผลอีกครั้ง');
    }

    function showSource() {
      const concealed = el['hide-source'].checked;
      el.source.hidden = concealed;
      el['source-cover'].hidden = !concealed;
      el['source-panel'].classList.toggle('source-concealed', concealed);
    }

    function process() {
      invalidate();
      if (el.source.value.length === 0) {
        error('เพิ่มข้อความหรือไฟล์ก่อนประมวลผล');
        return;
      }
      const custom = el['custom-fields'].value.split(',').map(name => name.trim()).filter(Boolean);
      const fields = el['default-fields'].checked ? [...guard.DEFAULT_FIELDS, ...custom] : custom;
      try {
        const next = guard.redact(el.source.value, {
          mode, maskEmails: el['email-rule'].checked, sensitiveFields: fields
        });
        result = Object.freeze({ output: next.output, mode });
        el.output.value = next.output;
        el['email-count'].textContent = String(next.stats.emails);
        el['field-count'].textContent = String(next.stats.fields);
        el['input-size'].textContent = byteLabel(next.stats.inputBytes);
        el['output-size'].textContent = byteLabel(next.stats.outputBytes);
        el['review-check'].disabled = false;
        syncExport();
        say('ประมวลผลแล้ว ตรวจทานผลลัพธ์และยืนยันก่อนคัดลอกหรือดาวน์โหลด');
      } catch (caught) {
        // Never render native parser/decoder messages or any source-derived details.
        const message = caught && Object.hasOwn(errors, caught.code) ? errors[caught.code]
          : 'ประมวลผลไม่สำเร็จ กรุณาตรวจสอบข้อมูลและกฎแล้วลองอีกครั้ง';
        error(message);
      }
    }

    async function importFiles(files) {
      const ticket = invalidate('กำลังอ่านไฟล์ในเครื่อง…');
      if (!files || files.length !== 1) {
        error('เลือกไฟล์ครั้งละ 1 ไฟล์');
        return;
      }
      const file = files[0];
      const extension = /\.(json|txt|log)$/i.exec(file.name || '');
      if (!extension) {
        error('รองรับเฉพาะไฟล์ .json, .txt และ .log');
        return;
      }
      if (!Number.isSafeInteger(file.size) || file.size < 0 || file.size > guard.MAX_BYTES) {
        error(errors.INPUT_TOO_LARGE);
        return;
      }
      try {
        const bytes = await file.arrayBuffer();
        if (ticket !== revision) return;
        if (bytes.byteLength > guard.MAX_BYTES) {
          error(errors.INPUT_TOO_LARGE);
          return;
        }
        const contents = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        if (ticket !== revision) return;
        mode = extension[1].toLowerCase() === 'json' ? 'json' : 'text';
        el.source.value = contents;
        el['source-label'].textContent = mode === 'json' ? 'ไฟล์ JSON ที่นำเข้า' : 'ไฟล์ข้อความที่นำเข้า';
        syncMode();
        invalidate('นำเข้าแล้ว เลือกกฎและกดปิดบังข้อมูล');
      } catch (caught) {
        if (ticket !== revision) return;
        error('อ่านไฟล์ไม่สำเร็จ กรุณาใช้ไฟล์ข้อความ UTF-8 ที่ถูกต้อง');
      }
    }

    async function importPresidio(files) {
      el.source.value='';
      el['file-input'].value='';
      el['source-label'].textContent='ไม่มีต้นฉบับ — รายงานจาก local worker';
      el['hide-source'].checked=false;
      showSource();
      const ticket=invalidate('กำลังตรวจรูปแบบรายงาน Presidio ในเครื่อง…');
      try{
        const parser=globalThis.PresidioReport;
        if(!parser||!files||files.length!==1||!/\.json$/i.test(files[0].name||'')||!Number.isSafeInteger(files[0].size)||files[0].size<0||files[0].size>parser.MAX_BYTES) throw new Error();
        const bytes=await files[0].arrayBuffer();
        if(ticket!==revision) return;
        if(bytes.byteLength>parser.MAX_BYTES) throw new Error();
        const report=parser.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
        if(ticket!==revision) return;
        mode='text';syncMode();
        result=Object.freeze({output:report.output,mode:'text'});
        el.output.value=report.output;
        el['output-size'].textContent=byteLabel(encoder.encode(report.output).byteLength);
        el['email-count'].textContent=String(report.findings.filter(f=>f.entity==='EMAIL_ADDRESS').length);
        el['field-count'].textContent='—';
        el['review-check'].disabled=false;
        const rows=report.findings.map(f=>{
          const row=document.createElement('tr');
          for(const value of [f.entity,f.start,f.end,f.score.toFixed(2)]){
            const cell=document.createElement('td');cell.textContent=String(value);row.appendChild(cell);
          }
          return row;
        });
        presidio['presidio-findings'].replaceChildren(...rows);
        presidio['presidio-panel'].hidden=false;
        presidio['presidio-summary'].textContent='นำเข้ารายงาน '+report.findings.length+' รายการ · เกณฑ์คะแนน '+report.minimumScore+' · กฎคำตรงตัว '+report.customTerms+' คำ';
        syncExport();
        say('นำเข้าผล Presidio แล้ว ตรวจทานข้อความด้านบนก่อนส่งออก แหล่งกำเนิดรายงานยังไม่ได้รับการยืนยัน');
      }catch(_){
        if(ticket!==revision) return;
        invalidate();error('รายงาน Presidio ไม่ถูกต้องหรือเกิน 256 KiB ใช้รายงาน schema 2 จาก worker ของโปรเจกต์');
      }
    }

    function clear() {
      el.source.value = '';
      el['file-input'].value = '';
      el['source-label'].textContent = 'ข้อมูลต้นฉบับ';
      el['hide-source'].checked = false;
      showSource();
      invalidate('ล้างข้อมูลจากหน้าจอแล้ว');
      el.source.focus();
    }

    function demo() {
      mode = 'json';
      el['email-rule'].checked = true;
      el['default-fields'].checked = true;
      el['custom-fields'].value = '';
      el['hide-source'].checked = false;
      el['file-input'].value = '';
      el.source.value = '{\n  "customer_name": "บุคคลสมมติ ก",\n  "email": "nina@example.invalid",\n  "api_key": "SYNTHETIC-DEMO-KEY",\n  "note": "ติดต่อทีมที่ support@example.invalid",\n  "status": "pending",\n  "request_id": 900719925474099312345\n}';
      el['source-label'].textContent = 'ข้อมูลตัวอย่างสมมติ';
      syncMode();
      showSource();
      invalidate('โหลดตัวอย่างแล้ว กดปิดบังข้อมูลเพื่อทดลอง');
    }

    async function copy() {
      if (!result || !el['review-check'].checked) return;
      const ticket = revision;
      const snapshot = result;
      try {
        if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') throw new Error();
        await navigator.clipboard.writeText(snapshot.output);
        if (ticket === revision && result === snapshot) say('คัดลอกผลลัพธ์ที่ตรวจทานแล้ว');
      } catch (caught) {
        if (ticket === revision && result === snapshot) say('คัดลอกอัตโนมัติไม่ได้ กรุณาใช้ปุ่มดาวน์โหลด');
      }
    }

    function download() {
      if (!result || !el['review-check'].checked) return;
      let url;
      let anchor;
      try {
        const isJson = result.mode === 'json';
        const blob = new Blob([result.output], { type: isJson ? 'application/json;charset=utf-8' : 'text/plain;charset=utf-8' });
        url = URL.createObjectURL(blob);
        anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = isJson ? 'redacted.json' : 'redacted.txt';
        document.body.appendChild(anchor);
        anchor.click();
        say('เริ่มดาวน์โหลดผลลัพธ์ที่ตรวจทานแล้ว');
      } catch (caught) {
        say('ดาวน์โหลดไม่สำเร็จ กรุณาลองคัดลอกผลลัพธ์');
      } finally {
        if (anchor) anchor.remove();
        if (url) setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    }

    el.source.addEventListener('input', () => {
      el['source-label'].textContent = 'ข้อมูลต้นฉบับ';
      invalidate('ข้อมูลเปลี่ยนแล้ว กรุณาประมวลผลอีกครั้ง');
    });
    el['email-rule'].addEventListener('change', () => invalidate('กฎเปลี่ยนแล้ว กรุณาประมวลผลอีกครั้ง'));
    el['default-fields'].addEventListener('change', () => invalidate('กฎเปลี่ยนแล้ว กรุณาประมวลผลอีกครั้ง'));
    el['custom-fields'].addEventListener('input', () => invalidate('กฎเปลี่ยนแล้ว กรุณาประมวลผลอีกครั้ง'));
    el['mode-json'].addEventListener('click', () => setMode('json'));
    el['mode-text'].addEventListener('click', () => setMode('text'));
    el['redact-btn'].addEventListener('click', process);
    el['demo-btn'].addEventListener('click', demo);
    el['clear-btn'].addEventListener('click', clear);
    el['hide-source'].addEventListener('change', showSource);
    el['review-check'].addEventListener('change', syncExport);
    el['copy-btn'].addEventListener('click', copy);
    el['download-btn'].addEventListener('click', download);
    el['upload-btn'].addEventListener('click', () => el['file-input'].click());
    el['file-input'].addEventListener('change', () => {
      const files = Array.from(el['file-input'].files || []);
      el['file-input'].value = '';
      if (files.length) importFiles(files);
    });
    document.addEventListener('dragover', event => event.preventDefault());
    document.addEventListener('drop', event => event.preventDefault());
    el['drop-zone'].addEventListener('dragenter', event => {
      event.preventDefault();
      dragDepth += 1;
      el['drop-zone'].classList.add('is-dragging');
    });
    el['drop-zone'].addEventListener('dragover', event => event.preventDefault());
    el['drop-zone'].addEventListener('dragleave', event => {
      event.preventDefault();
      dragDepth = Math.max(0, dragDepth - 1);
      if (!dragDepth) el['drop-zone'].classList.remove('is-dragging');
    });
    el['drop-zone'].addEventListener('drop', event => {
      event.preventDefault();
      dragDepth = 0;
      el['drop-zone'].classList.remove('is-dragging');
      importFiles(Array.from(event.dataTransfer ? event.dataTransfer.files : []));
    });

    if(presidio['presidio-import']&&presidio['presidio-file']&&globalThis.PresidioReport){
      presidio['presidio-import'].addEventListener('click',()=>presidio['presidio-file'].click());
      presidio['presidio-file'].addEventListener('change',()=>{
        const files=Array.from(presidio['presidio-file'].files||[]);presidio['presidio-file'].value='';
        if(files.length) importPresidio(files);
      });
    }
    syncMode();
    showSource();
    invalidate('เพิ่มข้อมูลของคุณ หรือเริ่มจากตัวอย่างสมมติ');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
}());
