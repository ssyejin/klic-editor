import JSZip from 'jszip'

export async function extractFromFile(file) {
  const ext = file.name.split('.').pop().toLowerCase()

  if (ext === 'hwpx') {
    return extractFromHwpx(file)
  } else if (ext === 'hwp') {
    return extractFromHwp(file)
  }

  throw new Error('지원하지 않는 파일 형식입니다. HWP 또는 HWPX 파일을 업로드해주세요.')
}

async function extractFromHwpx(file) {
  const zip = await JSZip.loadAsync(file)

  const sectionFiles = Object.keys(zip.files).filter(
    (name) => name.startsWith('Contents/section') && name.endsWith('.xml')
  )

  if (sectionFiles.length === 0) {
    throw new Error('HWPX 파일에서 내용을 찾을 수 없습니다.')
  }

  const tables = []

  for (const sectionFile of sectionFiles) {
    const xmlText = await zip.files[sectionFile].async('text')
    const extracted = extractTablesFromXml(xmlText)
    tables.push(...extracted)
  }

  if (tables.length === 0) {
    return { type: 'hwpx', content: '', tableCount: 0 }
  }

  // 표 데이터를 간단한 텍스트 형식으로 변환 (토큰 절약)
  const simplified = tables.map((rows, i) => {
    const rowText = rows.map((cells) => cells.join(' | ')).join('\n')
    return `[표 ${i + 1}]\n${rowText}`
  }).join('\n\n')

  return { type: 'hwpx', content: simplified, tableCount: tables.length }
}

function extractTablesFromXml(xmlText) {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xmlText, 'application/xml')

  // HWPX 네임스페이스 대응 - tbl 태그 탐색
  const tblElements = [
    ...doc.getElementsByTagName('hh:tbl'),
    ...doc.getElementsByTagName('tbl'),
  ]

  return Array.from(tblElements).map((tbl) => {
    const rows = [
      ...tbl.getElementsByTagName('hh:tr'),
      ...tbl.getElementsByTagName('tr'),
    ]

    return Array.from(rows).map((row) => {
      const cells = [
        ...row.getElementsByTagName('hh:tc'),
        ...row.getElementsByTagName('tc'),
      ]

      return Array.from(cells).map((cell) => cell.textContent.replace(/\s+/g, ' ').trim())
    })
  })
}

async function extractFromHwp(file) {
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)

  let text = ''
  for (let i = 0; i < bytes.length - 1; i++) {
    if (bytes[i] !== 0 && bytes[i] >= 32 && bytes[i] < 128) {
      text += String.fromCharCode(bytes[i])
    }
  }

  // HWP는 텍스트만 추출되므로 4000자로 제한
  return { type: 'hwp', content: text.slice(0, 4000) }
}
