// ตัวเขียนไฟล์ .xlsx แบบไม่พึ่งไลบรารี (zip แบบไม่บีบอัด + SpreadsheetML) รองรับสไตล์พื้นฐาน ความกว้างคอลัมน์ เซลล์รวม และตรึงแถว/คอลัมน์

export type StyleKey =
  | 'title' | 'subtitle' | 'header' | 'headerAll' | 'section'
  | 'label' | 'labelIndent' | 'labelStrong'
  | 'money' | 'moneyStrong' | 'int' | 'rate' | 'center' | 'note' | 'plain'

export type XCell = { v: string | number | null; s?: StyleKey }

export type SheetSpec = {
  sheetName: string
  rows: XCell[][]
  colWidths: number[]
  merges?: string[]
  freeze?: { row: number; col: number } // จำนวนแถว/คอลัมน์ที่ตรึง
  rowHeights?: Record<number, number> // เลขแถวเริ่มที่ 1
}

// ลำดับต้องตรงกับ cellXfs ใน styles.xml ด้านล่าง
const STYLE_INDEX: Record<StyleKey, number> = {
  plain: 0, title: 1, subtitle: 2, header: 3, headerAll: 4, section: 5,
  label: 6, labelIndent: 7, labelStrong: 8, money: 9, moneyStrong: 10, int: 11, rate: 12, center: 13, note: 14,
}

const esc = (value: unknown) => String(value ?? '')
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')

const colName = (n: number) => { let s = ''; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26) } return s }

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
const FONT = '<name val="Tahoma"/><family val="2"/><charset val="222"/>'
const STYLES = `${XML}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="0.0000"/></numFmts>
<fonts count="6">
<font><sz val="11"/>${FONT}</font>
<font><b/><sz val="11"/>${FONT}</font>
<font><b/><sz val="14"/>${FONT}</font>
<font><i/><sz val="10"/><color rgb="FF57534E"/>${FONT}</font>
<font><b/><sz val="11"/><color rgb="FFFFFFFF"/>${FONT}</font>
<font><sz val="10"/><color rgb="FF57534E"/>${FONT}</font>
</fonts>
<fills count="5">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF0F766E"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFCCFBF1"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF134E4A"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="2">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left style="thin"><color rgb="FFD6D3D1"/></left><right style="thin"><color rgb="FFD6D3D1"/></right><top style="thin"><color rgb="FFD6D3D1"/></top><bottom style="thin"><color rgb="FFD6D3D1"/></bottom><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="15">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="4" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="4" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1" indent="2"/></xf>
<xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="4" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
<xf numFmtId="4" fontId="1" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
<xf numFmtId="3" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="5" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`

const sheetXml = (spec: SheetSpec) => {
  const rowsXml = spec.rows.map((row, ri) => {
    const r = ri + 1
    const h = spec.rowHeights?.[r]
    const cells = row.map((cell, ci) => {
      const ref = `${colName(ci + 1)}${r}`
      const s = STYLE_INDEX[cell.s || 'plain']
      if (cell.v === null || cell.v === '') return `<c r="${ref}" s="${s}"/>`
      if (typeof cell.v === 'number' && Number.isFinite(cell.v)) return `<c r="${ref}" s="${s}"><v>${cell.v}</v></c>`
      return `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${esc(cell.v)}</t></is></c>`
    }).join('')
    return `<row r="${r}"${h ? ` ht="${h}" customHeight="1"` : ''}>${cells}</row>`
  }).join('')
  const cols = spec.colWidths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')
  const fr = spec.freeze
  const pane = fr ? `<pane${fr.col ? ` xSplit="${fr.col}"` : ''}${fr.row ? ` ySplit="${fr.row}"` : ''} topLeftCell="${colName(fr.col + 1)}${fr.row + 1}" activePane="${fr.row && fr.col ? 'bottomRight' : fr.row ? 'bottomLeft' : 'topRight'}" state="frozen"/>` : ''
  const merges = spec.merges?.length ? `<mergeCells count="${spec.merges.length}">${spec.merges.map(m => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : ''
  return `${XML}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0" showGridLines="0">${pane}</sheetView></sheetViews><sheetFormatPr defaultRowHeight="18"/><cols>${cols}</cols><sheetData>${rowsXml}</sheetData>${merges}<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/><pageSetup paperSize="9" orientation="landscape" fitToHeight="0"/></worksheet>`
}

export function buildXlsx(spec: SheetSpec): Uint8Array {
  const sheetName = spec.sheetName.replace(/[\\/?*:[\]]/g, ' ').slice(0, 31)
  const files: [string, string][] = [
    ['[Content_Types].xml', `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`],
    ['_rels/.rels', `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml', `${XML}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${esc(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml', STYLES],
    ['xl/worksheets/sheet1.xml', sheetXml(spec)],
  ]

  const encoder = new TextEncoder()
  const crcTable = new Uint32Array(256)
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c >>> 0 }
  const crc32 = (bytes: Uint8Array) => { let c = 0xffffffff; for (const b of bytes) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
  const u16 = (v: number) => [v & 255, (v >>> 8) & 255]
  const u32 = (v: number) => [...u16(v & 65535), ...u16(Math.floor(v / 65536))]
  const DOS_TIME = 0, DOS_DATE = 0x0021 // 1980-01-01

  const chunks: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0
  for (const [name, content] of files) {
    const nb = encoder.encode(name), data = encoder.encode(content), crc = crc32(data)
    const local = new Uint8Array([...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(DOS_TIME), ...u16(DOS_DATE), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nb.length), ...u16(0), ...nb, ...data])
    const dir = new Uint8Array([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(DOS_TIME), ...u16(DOS_DATE), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nb.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset), ...nb])
    chunks.push(local); central.push(dir); offset += local.length
  }
  const centralSize = central.reduce((n, a) => n + a.length, 0)
  chunks.push(...central, new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(centralSize), ...u32(offset), ...u16(0)]))

  const total = chunks.reduce((n, c) => n + c.length, 0)
  const out = new Uint8Array(total)
  let p = 0
  for (const c of chunks) { out.set(c, p); p += c.length }
  return out
}

export function downloadXlsx(spec: SheetSpec, fileName: string) {
  const bytes = buildXlsx(spec)
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName.replace(/[\\/:*?"<>|]/g, '_')
  document.body.appendChild(link); link.click(); link.remove()
  URL.revokeObjectURL(url)
}


export function downloadXlsxWorkbook(specs: SheetSpec[], fileName: string) {
  const safeSpecs = specs.length ? specs : [{ sheetName: 'ไม่มีข้อมูล', rows: [[{ v: 'ไม่พบรายการรอแก้ไข', s: 'title' }]], colWidths: [36] }]
  const used = new Set<string>()
  const sheets = safeSpecs.map((spec, i) => {
    const baseName = (spec.sheetName || `Sheet ${i + 1}`).replace(/[\\\\/?*:[\\]]/g, ' ').trim().slice(0, 31) || `Sheet ${i + 1}`
    let name = baseName, n = 2
    while (used.has(name.toLowerCase())) { const suffix = ` (${n++})`; name = baseName.slice(0, 31 - suffix.length) + suffix }
    used.add(name.toLowerCase())
    return { ...spec, sheetName: name }
  })
  const files: [string, string][] = [
    ['[Content_Types].xml', `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`],
    ['_rels/.rels', `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml', `${XML}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s,i)=>`<sheet name="${esc(s.sheetName)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')}</sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml', STYLES],
    ...sheets.map((s,i)=>[`xl/worksheets/sheet${i+1}.xml`, sheetXml(s)] as [string,string])
  ]
  const encoder = new TextEncoder(), crcTable = new Uint32Array(256)
  for (let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;crcTable[n]=c>>>0}
  const crc32=(b:Uint8Array)=>{let c=0xffffffff;for(const v of b)c=crcTable[(c^v)&255]^(c>>>8);return(c^0xffffffff)>>>0}
  const u16=(v:number)=>[v&255,(v>>>8)&255], u32=(v:number)=>[...u16(v&65535),...u16(Math.floor(v/65536))]
  const chunks:Uint8Array[]=[], central:Uint8Array[]=[]; let offset=0
  for(const [name,content] of files){
    const nb=encoder.encode(name), data=encoder.encode(content), crc=crc32(data)
    const local=new Uint8Array([...u32(0x04034b50),...u16(20),...u16(0x0800),...u16(0),...u16(0),...u16(0x0021),...u32(crc),...u32(data.length),...u32(data.length),...u16(nb.length),...u16(0),...nb,...data])
    const dir=new Uint8Array([...u32(0x02014b50),...u16(20),...u16(20),...u16(0x0800),...u16(0),...u16(0),...u16(0x0021),...u32(crc),...u32(data.length),...u32(data.length),...u16(nb.length),...u16(0),...u16(0),...u16(0),...u16(0),...u32(0),...u32(offset),...nb])
    chunks.push(local);central.push(dir);offset+=local.length
  }
  const centralSize=central.reduce((n,a)=>n+a.length,0)
  chunks.push(...central,new Uint8Array([...u32(0x06054b50),...u16(0),...u16(0),...u16(files.length),...u16(files.length),...u32(centralSize),...u32(offset),...u16(0)]))
  const total=chunks.reduce((n,c)=>n+c.length,0), out=new Uint8Array(total);let pos=0
  for(const c of chunks){out.set(c,pos);pos+=c.length}
  const url=URL.createObjectURL(new Blob([out as BlobPart],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}))
  const a=document.createElement('a');a.href=url;a.download=fileName.replace(/[\\\\/:*?"<>|]/g,'_');document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url)
}
